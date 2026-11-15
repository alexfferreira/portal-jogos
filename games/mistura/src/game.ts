import {
  completeLevel,
  type GameInstance,
  type GameModule,
  type HudState,
  type PowerUpState,
} from '@recreio/core';
import { Session, type GeneratedLevel, type Move, type State } from './logic';
import { createLevelLoader } from './levelLoader';
import { messages, meta, MISTURA_ID } from './meta';
import { Board } from './render/board';
import { planPour } from './render/plan';
import { followRoteiro, hasTutorial, tutorialStep } from './render/tutorial';
import { CancelledError, createLogicClient, type LogicClient } from './worker';

/** Tamanho provisório do enquadramento até o primeiro layout. */
const INITIAL_BOUNDS = { width: 8, height: 12, depth: 1.5 };
/** Pausa entre a última jogada e o aviso "Fase concluída" (para o confete aparecer). */
const WIN_DELAY = 1.0;

/**
 * Dados de teste no canvas (`data-*`): só quando o build/execução de teste liga `VITE_E2E=1`.
 * Builds de produção não publicam nada.
 */
const PUBLISH_TEST_DATA = import.meta.env?.VITE_E2E === '1';

/** Estado em texto (tubos separados por "|"); camadas ocultas aparecem como "?", sem cor. */
function describeState(state: State): string {
  return state.tubes
    .map((t) => t.map((u) => (u.hidden ? '?' : String(u.color))).join(' '))
    .join(' | ');
}

/**
 * Mistura de cores: orquestra a lógica (`Session`, Worker) e o render (`Board`).
 * A lógica decide cada jogada na hora; o `Board` apenas anima e depois reconcilia o visual.
 */
export const misturaGame: GameModule = {
  id: MISTURA_ID,
  meta,
  messages,

  async mount(container, ctx): Promise<GameInstance> {
    const client: LogicClient = createLogicClient();
    ctx.onDestroy(() => client.dispose());

    const [stage, loaded] = await Promise.all([
      ctx.createStage(container, { camera: 'ortho-front-tilted', bounds: INITIAL_BOUNDS }),
      ctx.storage.loadLevels(),
    ]);
    let progress = loaded;
    let level = progress.currentLevel;
    const loader = createLevelLoader(client, {
      onError: (err) => console.error('[mistura] falha ao gerar a fase', err),
    });
    const first = await client.generateLevel(level);

    // Acessibilidade: o canvas é uma imagem com nome (o jogo não é jogável por teclado).
    const canvas = stage.canvas;
    canvas.setAttribute('role', 'img');
    const setCanvasLabel = (): void =>
      canvas.setAttribute('aria-label', ctx.i18n.t('mistura.canvas.label'));
    setCanvasLabel();
    ctx.i18n.subscribe(setCanvasLabel);

    const ds: DOMStringMap = PUBLISH_TEST_DATA ? canvas.dataset : {};
    if (PUBLISH_TEST_DATA) ds.moving = '0';
    const board = new Board({
      stage,
      quality: ctx.settings.get().quality,
      colorblind: ctx.settings.get().colorblind,
      diagnostics: PUBLISH_TEST_DATA,
      onAnimating: (animating) => {
        ds.moving = animating ? '1' : '0';
        if (!animating) ds.view = board.viewString();
      },
      sfx: (name) => ctx.audio.play(name),
      onLayout: (rects) => {
        ds.tubes = JSON.stringify(
          rects.map((r) => ({
            x: Math.round(r.x * 10) / 10,
            y: Math.round(r.y * 10) / 10,
            w: Math.round(r.w * 10) / 10,
            h: Math.round(r.h * 10) / 10,
          })),
        );
      },
    });

    let session = new Session(first.state);
    let initialRoute: Move[] = first.solution;
    /** Solução do estado atual (tutorial); `null` = desconhecida, recalcular pelo Worker. */
    let route: Move[] | null = hasTutorial(level) ? [...initialRoute] : null;
    let selected: number | null = null;
    let won = false;
    let busy = false;
    /** Despejo em animação: a mãozinha some até ele terminar. */
    let moving = false;
    let paused = false;
    let destroyed = false;
    /** Aviso "sem jogadas" aberto no momento (e por quê); `null` = fechado. */
    let stuckReason: 'stuck' | 'unsolvable' | null = null;
    let hintPending = false;
    let activeHint: Move | null = null;
    let handKey = '';
    /** Muda a cada mudança de estado: descarta dicas e rotas calculadas para um estado velho. */
    let version = 0;
    /** Muda a cada fase/reinício: descarta callbacks atrasados. */
    let epoch = 0;
    /** Fase cuja geração falhou (tentar de novo pelo Reiniciar ou por novo `next`). */
    let failedTarget: number | null = null;
    let errorKey: string | null = null;
    /** Aviso passageiro da dica ("não achei"); some na próxima mudança de estado. */
    let hintNoteKey: string | null = null;

    // --- HUD e diagnóstico ----------------------------------------------------------

    const currentStep = () =>
      won || busy ? tutorialStep(0, null, null) : tutorialStep(level, selected, route?.[0] ?? null);

    const emitHud = (): void => {
      const r = session.remaining;
      const locked = won || busy;
      const powerUps: PowerUpState[] = [
        {
          id: 'undo',
          labelKey: 'mistura.powerup.undo',
          icon: 'undo',
          count: r.undo,
          disabled: locked || !session.canUndo,
        },
        {
          id: 'extraTube',
          labelKey: 'mistura.powerup.extraTube',
          icon: 'plus',
          count: r.extraTube,
          disabled: locked,
        },
        {
          id: 'hint',
          labelKey: 'mistura.powerup.hint',
          icon: 'bulb',
          count: r.hint,
          disabled: locked || hintPending,
        },
      ];
      const hud: HudState = { level, powerUps };
      const message = errorKey ?? hintNoteKey ?? currentStep().message;
      if (message) hud.message = message;
      ctx.events.emit('hud', hud);
    };

    const syncDataset = (): void => {
      ds.level = String(level);
      ds.state = describeState(session.state);
      ds.view = board.viewString();
      ds.moving = board.animating ? '1' : '0';
      ds.tubeCount = String(session.state.tubes.length);
      ds.selected = selected === null ? '' : String(selected);
      ds.hint = activeHint ? `${activeHint.from},${activeHint.to}` : '';
      ds.won = String(won);
      ds.symbols = String(board.visibleSymbols());
      ds.hand = handKey;
    };

    /** Mãozinha: a da dica tem prioridade; senão a do tutorial. */
    const refreshHand = (): void => {
      const step = currentStep();
      let key = '';
      let target: { from: number | null; to: number } | null = null;
      if (moving) {
        target = null;
      } else if (activeHint && !won && !busy) {
        target = { from: activeHint.from, to: activeHint.to };
      } else if (step.hand) {
        target = step.hand;
      }
      if (target) key = `${target.from ?? '-'}>${target.to}`;
      if (key === handKey) return;
      handKey = key;
      board.setHand(target);
      ds.hand = handKey;
    };

    const refreshStep = (): void => {
      refreshHand();
      emitHud();
      syncDataset();
    };

    /** Pede ao Worker a solução do estado atual (tutorial) se o roteiro foi perdido. */
    const ensureRoute = (): void => {
      if (!hasTutorial(level) || route !== null || won || busy) return;
      const v = version;
      const e = epoch;
      client
        .hint(session.state)
        .then((res) => {
          if (destroyed || v !== version || e !== epoch) return;
          route = res.moves;
          refreshStep();
        })
        .catch((err: unknown) => {
          if (!(err instanceof CancelledError)) console.error('[mistura] falha no roteiro', err);
        });
    };

    /** Qualquer mudança de estado: descarta dica velha e atualiza HUD/diagnóstico. */
    const stateChanged = (): void => {
      version++;
      hintNoteKey = null;
      if (activeHint) {
        activeHint = null;
        board.setHint(null);
      }
      refreshStep();
      ensureRoute();
    };

    const showNoMoves = (reason: 'stuck' | 'unsolvable'): void => {
      const r = session.remaining;
      stuckReason = reason;
      ctx.events.emit('no-moves', {
        stuck: true,
        canUndo: session.canUndo && r.undo > 0,
        canAddTube: r.extraTube > 0,
        reason,
      });
    };

    const closeNoMoves = (): void => {
      if (stuckReason === null) return;
      stuckReason = null;
      ctx.events.emit('no-moves', { stuck: false, canUndo: false, canAddTube: false });
    };

    /**
     * Beco sem saída: ainda há jogadas legais, mas o solver prova que não há solução.
     * Usa a mesma chave `hint` do Worker, então não roda junto com uma dica pedida pelo
     * jogador nem no tutorial (que tem o próprio roteiro).
     */
    const checkDeadEnd = async (): Promise<void> => {
      // Com dica pendente, o `finally` de `requestHint` refaz a checagem se o estado mudou.
      if (hintPending) return;
      const v = version;
      const e = epoch;
      try {
        const res = await client.hint(session.state);
        if (destroyed || v !== version || e !== epoch || won || busy) return;
        if (res.status === 'unsolvable') showNoMoves('unsolvable');
        else closeNoMoves();
      } catch (err) {
        if (!(err instanceof CancelledError)) {
          console.error('[mistura] falha ao checar a fase', err);
          if (v === version && e === epoch) closeNoMoves();
        }
      }
    };

    const updateStuck = (): void => {
      if (!won && !busy && session.stuck) {
        showNoMoves('stuck');
        return;
      }
      // Um aviso de "sem saída" fica aberto até a nova checagem responder (evita piscar
      // ao usar tubo extra ou desfazer numa posição que continua sem solução).
      const keepOpen = stuckReason === 'unsolvable' && !won && !busy && !hasTutorial(level);
      // Se continua aberto, atualiza as opções (ex.: o tubo extra acabou de ser usado).
      if (keepOpen) showNoMoves('unsolvable');
      else closeNoMoves();
      if (!won && !busy && !hasTutorial(level)) void checkDeadEnd();
    };

    // --- fim de fase ----------------------------------------------------------------

    const win = (): void => {
      won = true;
      selected = null;
      board.select(null);
      progress = completeLevel(progress, level);
      ctx.storage
        .saveLevels(progress)
        .catch((err: unknown) => console.error('[mistura] falha ao salvar', err));
      ctx.audio.play('win');
      board.setHand(null);
      handKey = '';
      board.celebrate();
      refreshStep();
      const mine = epoch;
      stage.tweens.add({
        duration: WIN_DELAY,
        onUpdate: () => {},
        onComplete: () => {
          // Só avisa se nada mudou desde a vitória e o tabuleiro continua resolvido.
          if (destroyed || mine !== epoch || !won || !session.won) return;
          ctx.events.emit('level-complete', { level });
        },
      });
    };

    const onMoveDone = (mine: number): void => {
      if (destroyed || mine !== epoch) return;
      if (session.won) {
        win();
        return;
      }
      refreshStep();
      updateStuck();
    };

    // --- fases ----------------------------------------------------------------------

    const startPrefetch = (): void => loader.prefetch(level + 1);

    const applyLevel = (gen: GeneratedLevel): void => {
      epoch++;
      moving = false;
      session = new Session(gen.state);
      initialRoute = gen.solution;
      route = hasTutorial(level) ? [...initialRoute] : null;
      selected = null;
      won = false;
      busy = false;
      failedTarget = null;
      errorKey = null;
      activeHint = null;
      hintPending = false;
      handKey = '';
      board.setState(gen.state);
      closeNoMoves();
      stateChanged();
      updateStuck();
      startPrefetch();
    };

    /** Só avança `level` quando a geração dá certo; em falha mostra erro recuperável. */
    const loadLevel = async (target: number): Promise<void> => {
      busy = true;
      failedTarget = null;
      errorKey = null;
      epoch++;
      board.finishAnimations();
      emitHud();
      const result = await loader.load(target);
      if (destroyed || result.status === 'stale') return;
      if (result.status === 'ok') {
        level = target;
        applyLevel(result.gen);
        return;
      }
      busy = false;
      failedTarget = target;
      errorKey = 'mistura.error.generate';
      refreshStep();
    };

    // --- jogadas --------------------------------------------------------------------

    const invalid = (index: number): void => {
      ctx.audio.play('error');
      ctx.haptics.tap(40);
      board.shake(index);
    };

    const tapTube = (index: number): void => {
      const state = session.state;
      if (selected === null) {
        const tube = state.tubes[index];
        if (!tube || tube.length === 0) {
          invalid(index);
          return;
        }
        selected = index;
        board.select(index);
        ctx.audio.play('click');
        refreshStep();
        return;
      }
      if (index === selected) {
        selected = null;
        board.select(null);
        ctx.audio.play('click');
        refreshStep();
        return;
      }
      const from = selected;
      const result = session.move({ from, to: index });
      if (!result.ok) {
        selected = null;
        board.select(null);
        invalid(from);
        refreshStep();
        return;
      }
      selected = null;
      route = route ? followRoteiro(route, result.move) : null;
      const plan = planPour(state, result);
      board.setHand(null);
      handKey = '';
      moving = true;
      stateChanged();
      const mine = epoch;
      board.playMove(plan, result.state, () => {
        moving = false;
        onMoveDone(mine);
      });
    };

    const offTap = stage.onTap((p) => {
      ctx.audio.unlock();
      if (destroyed || paused) return;
      // Interromper: qualquer animação em curso termina agora (e pode disparar a vitória);
      // só depois decidimos se o toque ainda vale.
      board.finishAnimations();
      if (busy || won) return;
      const index = board.pick(p.x, p.y);
      if (index !== null) tapTube(index);
    });

    ctx.settings.subscribe((s) => {
      board.setColorblind(s.colorblind);
      syncDataset();
    });

    // --- power-ups ------------------------------------------------------------------

    const undo = (): void => {
      const out = session.undo();
      if (!out.ok) return;
      selected = null;
      route = null;
      ctx.audio.play('click');
      board.syncTo(out.state);
      stateChanged();
      updateStuck();
    };

    const extraTube = (): void => {
      const out = session.addTube();
      if (!out.ok) return;
      ctx.audio.play('click');
      board.addTube(out.state);
      stateChanged();
      updateStuck();
    };

    const requestHint = async (): Promise<void> => {
      if (hintPending || session.remaining.hint <= 0) return;
      hintPending = true;
      emitHud();
      const v = version;
      const e = epoch;
      try {
        const res = await client.hint(session.state);
        // O estado mudou enquanto o Worker pensava: a dica é velha, descarta sem gastar a carga.
        if (destroyed || v !== version || e !== epoch) return;
        if (!res.move) {
          // Sem dica: não gasta a carga e explica o motivo.
          if (res.status === 'unsolvable') showNoMoves('unsolvable');
          else if (res.status === 'limit') hintNoteKey = 'mistura.hint.limit';
          return;
        }
        if (!session.spendHint()) return;
        activeHint = res.move;
        board.setHint(res.move);
        ctx.audio.play('click');
      } catch (err) {
        if (!(err instanceof CancelledError)) console.error('[mistura] falha na dica', err);
      } finally {
        hintPending = false;
        if (!destroyed) {
          refreshStep();
          // O jogador jogou durante a dica: o estado novo ainda não foi checado.
          if (v !== version && e === epoch && !won && !busy) updateStuck();
        }
      }
    };

    const restart = (): void => {
      if (destroyed) return;
      // Falhou ao gerar a próxima fase: o botão de reiniciar tenta de novo.
      if (failedTarget !== null) {
        void loadLevel(failedTarget);
        return;
      }
      // Descarta uma geração pendente (o resultado antigo vira obsoleto) e recomeça esta fase.
      loader.invalidate();
      errorKey = null;
      epoch++;
      moving = false;
      board.finishAnimations();
      const state = session.restart();
      selected = null;
      won = false;
      busy = false;
      activeHint = null;
      handKey = '';
      route = hasTutorial(level) ? [...initialRoute] : null;
      board.setState(state);
      closeNoMoves();
      stateChanged();
      updateStuck();
    };

    // --- ciclo inicial --------------------------------------------------------------

    board.setState(session.state);
    syncDataset();
    refreshStep();
    ensureRoute();
    updateStuck();
    startPrefetch();

    return {
      pause() {
        paused = true;
        stage.pause();
      },
      resume() {
        paused = false;
        stage.resume();
      },
      restart,
      next() {
        if (destroyed || busy) return;
        void loadLevel(level + 1);
      },
      usePowerUp(id) {
        if (destroyed) return;
        // Primeiro termina as animações (pode disparar a vitória); depois decide.
        board.finishAnimations();
        if (busy || won) return;
        if (id === 'undo') undo();
        else if (id === 'extraTube') extraTube();
        else if (id === 'hint') void requestHint();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        epoch++;
        loader.invalidate();
        offTap();
        board.dispose();
        client.dispose();
      },
    };
  },
};
