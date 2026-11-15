import {
  completeLevel,
  type GameInstance,
  type GameModule,
  type HudState,
  type PowerUpState,
} from '@recreio/core';
import { createLevelLoader } from './levelLoader';
import { Session, type GeneratedLevel, type Move, type State } from './logic';
import { EMBARCA_ID, messages, meta } from './meta';
import { Board } from './render/board';
import { followRoute, hasTutorial, tutorialStep, type TutorialStep } from './render/tutorial';
import { CancelledError, createLogicClient, type LogicClient } from './worker';

/** Enquadramento provisório até a primeira fase ser montada. */
const INITIAL_BOUNDS = { width: 6.6, depth: 14 };
/** Pausa entre a última jogada e o aviso "Fase concluída". */
const WIN_DELAY = 0.8;
const BACKGROUND = 0xcfe8ff;
const NO_STEP: TutorialStep = { hand: null, message: null };

/**
 * Dados de teste no canvas (`data-*`): só quando o build/execução de teste liga `VITE_E2E=1`.
 * Builds de produção não publicam nada.
 */
const PUBLISH_TEST_DATA = import.meta.env?.VITE_E2E === '1';

/**
 * Estado em texto: `b:<ids no tabuleiro>|s:<veículo:ocupados por vaga, ou ->|q:<índice>/<total>`.
 * Não escreve cores, então nada de veículo misterioso vaza por aqui.
 */
function describeState(state: State): string {
  const slots = state.slots.map((s) => (s === null ? '-' : `${s.vehicle}:${s.filled}`));
  return `b:${state.onBoard.join(',')}|s:${slots.join(',')}|q:${state.queueIndex}/${state.level.queue.length}`;
}

/**
 * Embarca: orquestra a lógica (`Session`, Worker) e o render (`Board`). A lógica decide cada
 * jogada na hora; o `Board` apenas anima e depois reconcilia o visual.
 */
export const embarcaGame: GameModule = {
  id: EMBARCA_ID,
  meta,
  messages,

  async mount(container, ctx): Promise<GameInstance> {
    const client: LogicClient = createLogicClient();
    ctx.onDestroy(() => client.dispose());

    const [stage, loaded] = await Promise.all([
      ctx.createStage(container, {
        camera: 'ortho-top',
        bounds: INITIAL_BOUNDS,
        background: BACKGROUND,
      }),
      ctx.storage.loadLevels(),
    ]);
    let progress = loaded;
    let level = progress.currentLevel;
    const loader = createLevelLoader(client, {
      onError: (err) => console.error('[embarca] falha ao gerar a fase', err),
    });
    const first = await client.generateLevel(level);

    // Acessibilidade: o canvas é uma imagem com nome (o jogo não é jogável por teclado).
    const canvas = stage.canvas;
    canvas.setAttribute('role', 'img');
    const setCanvasLabel = (): void =>
      canvas.setAttribute('aria-label', ctx.i18n.t('embarca.canvas.label'));
    setCanvasLabel();
    ctx.i18n.subscribe(setCanvasLabel);

    const ds: DOMStringMap = PUBLISH_TEST_DATA ? canvas.dataset : {};
    if (PUBLISH_TEST_DATA) ds.moving = '0';
    const board = new Board({
      stage,
      quality: ctx.settings.get().quality,
      sfx: (name) => ctx.audio.play(name),
      onAnimating: (animating) => {
        ds.moving = animating ? '1' : '0';
        if (!animating) ds.view = board.viewString();
      },
      ...(PUBLISH_TEST_DATA
        ? {
            onLayout: (boxes: unknown[]) => {
              ds.vehicles = JSON.stringify(boxes);
            },
          }
        : {}),
    });

    // Diagnóstico leve (a cada 0,5 s), só em teste: quadros por segundo e recursos da GPU.
    if (PUBLISH_TEST_DATA) {
      let clock = 0;
      let frames = 0;
      ctx.onDestroy(
        stage.onFrame((dt) => {
          clock += dt;
          frames++;
          if (clock < 0.5) return;
          const info = stage.renderer.info;
          ds.calls = String(info.render.calls);
          ds.triangles = String(info.render.triangles);
          ds.geometries = String(info.memory.geometries);
          ds.textures = String(info.memory.textures);
          ds.fps = String(Math.round(frames / clock));
          clock = 0;
          frames = 0;
        }),
      );
    }

    let session = new Session(first.state.level);
    let won = false;
    let busy = false;
    let paused = false;
    let destroyed = false;
    /** Aviso "sem jogadas" aberto no momento (e por quê); `null` = fechado. */
    let stuckReason: 'stuck' | 'unsolvable' | null = null;
    /** Muda a cada fase/reinício: descarta callbacks atrasados. */
    let epoch = 0;
    /** Fase cuja geração falhou (tentar de novo pelo Reiniciar ou por novo `next`). */
    let failedTarget: number | null = null;
    let errorKey: string | null = null;
    /** Muda a cada mudança de estado: descarta dicas e checagens calculadas para um estado velho. */
    let version = 0;
    let hintPending = false;
    /** Veículo que a dica está mostrando, ou `null`. */
    let activeHint: number | null = null;
    /** Aviso passageiro da dica ("não achei"); some na próxima mudança de estado. */
    let hintNoteKey: string | null = null;
    /** Solução do estado atual (tutorial); `null` = desconhecida, recalcular pelo Worker. */
    let route: Move[] | null = hasTutorial(level) ? [...first.solution] : null;
    let initialRoute: Move[] = first.solution;
    /** Jogada em animação: a mãozinha some até ela terminar. */
    let moving = false;
    let handTarget: number | null = null;

    // --- HUD e diagnóstico ----------------------------------------------------------

    /** Passo do tutorial: que veículo apontar e que texto mostrar. */
    const currentStep = (): TutorialStep =>
      won || busy
        ? NO_STEP
        : tutorialStep(
            level,
            route?.[0] ?? null,
            session.state.slots.filter((slot) => slot !== null).length,
          );

    const emitHud = (): void => {
      const r = session.remaining;
      const locked = won || busy;
      const powerUps: PowerUpState[] = [
        {
          id: 'undo',
          labelKey: 'embarca.powerup.undo',
          icon: 'undo',
          count: r.undo,
          disabled: locked || !session.canUndo,
        },
        {
          id: 'extraSlot',
          labelKey: 'embarca.powerup.extraSlot',
          icon: 'plus',
          count: r.extraSlot,
          disabled: locked,
        },
        {
          id: 'hint',
          labelKey: 'embarca.powerup.hint',
          icon: 'bulb',
          count: r.hint,
          disabled: locked || hintPending,
        },
      ];
      const hud: HudState = { level, powerUps };
      const message = errorKey ?? hintNoteKey ?? currentStep().message;
      if (message !== null) hud.message = message;
      ctx.events.emit('hud', hud);
    };

    const syncDataset = (): void => {
      ds.level = String(level);
      ds.state = describeState(session.state);
      ds.view = board.viewString();
      ds.won = String(won);
      ds.bumps = String(session.bumps);
      ds.slots = String(session.state.slots.length);
      ds.hint = activeHint === null ? '' : String(activeHint);
      ds.hand = handTarget === null ? '' : String(handTarget);
    };

    /** Mãozinha: a dica tem prioridade (ela já tem o anel); some durante a animação. */
    const refreshHand = (): void => {
      handTarget = activeHint !== null || moving ? null : currentStep().hand;
      board.setHand(handTarget);
      ds.hand = handTarget === null ? '' : String(handTarget);
    };

    /** Se o jogador saiu do roteiro (ou desfez), a solução do estado atual vem do Worker. */
    const ensureRoute = (): void => {
      if (!hasTutorial(level) || route !== null || won || busy) return;
      const v = version;
      const e = epoch;
      client
        .hint(session.state)
        .then((res) => {
          if (destroyed || v !== version || e !== epoch) return;
          route = res.moves;
          refreshHand();
          emitHud();
        })
        .catch((err: unknown) => {
          if (!(err instanceof CancelledError)) console.error('[embarca] falha no roteiro', err);
        });
    };

    /** Qualquer mudança de estado: HUD, mãozinha e dados de teste em dia. */
    const stateChanged = (): void => {
      version++;
      hintNoteKey = null;
      if (activeHint !== null) {
        activeHint = null;
        board.setHint(null);
      }
      refreshHand();
      emitHud();
      syncDataset();
      ensureRoute();
    };

    const showNoMoves = (reason: 'stuck' | 'unsolvable'): void => {
      const r = session.remaining;
      stuckReason = reason;
      ctx.events.emit('no-moves', {
        stuck: true,
        canUndo: session.canUndo && r.undo > 0,
        canAddTube: r.extraSlot > 0,
        reason,
        extraId: 'extraSlot',
        extraLabelKey: 'embarca.powerup.extraSlot',
      });
    };

    const closeNoMoves = (): void => {
      if (stuckReason === null) return;
      stuckReason = null;
      ctx.events.emit('no-moves', { stuck: false, canUndo: false, canAddTube: false });
    };

    /**
     * Beco sem saída: ainda há jogadas legais, mas o solver prova que não há solução. Usa a mesma
     * chave `hint` do Worker, então não roda junto com uma dica do jogador nem nas fases do
     * tutorial (que têm o próprio roteiro).
     */
    const checkDeadEnd = async (): Promise<void> => {
      // Com dica pendente, o `finally` de `requestHint` refaz a checagem se o estado mudou.
      if (hintPending || hasTutorial(level)) return;
      const v = version;
      const e = epoch;
      try {
        const res = await client.hint(session.state);
        if (destroyed || v !== version || e !== epoch || won || busy) return;
        if (res.status === 'unsolvable') showNoMoves('unsolvable');
        else closeNoMoves();
      } catch (err) {
        if (!(err instanceof CancelledError)) {
          console.error('[embarca] falha ao checar a fase', err);
          if (v === version && e === epoch) closeNoMoves();
        }
      }
    };

    const updateStuck = (): void => {
      if (!won && !busy && session.stuck) {
        showNoMoves('stuck');
        return;
      }
      // Um aviso de "sem saída" fica aberto até a nova checagem responder (evita piscar ao
      // usar a vaga extra ou desfazer numa posição que continua sem solução).
      const check = !won && !busy && !hasTutorial(level);
      if (stuckReason === 'unsolvable' && check) showNoMoves('unsolvable');
      else closeNoMoves();
      if (check) void checkDeadEnd();
    };

    // --- fim de fase ----------------------------------------------------------------

    const win = (): void => {
      won = true;
      progress = completeLevel(progress, level);
      ctx.storage
        .saveLevels(progress)
        .catch((err: unknown) => console.error('[embarca] falha ao salvar', err));
      ctx.audio.play('win');
      stateChanged();
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
      moving = false;
      if (session.won) {
        win();
        return;
      }
      stateChanged();
      updateStuck();
    };

    // --- fases ----------------------------------------------------------------------

    const startPrefetch = (): void => loader.prefetch(level + 1);

    const applyLevel = (gen: GeneratedLevel): void => {
      epoch++;
      session = new Session(gen.state.level);
      initialRoute = gen.solution;
      route = hasTutorial(level) ? [...initialRoute] : null;
      moving = false;
      won = false;
      busy = false;
      failedTarget = null;
      errorKey = null;
      hintPending = false;
      board.setLevel(gen.state.level, session.state);
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
      errorKey = 'embarca.error.generate';
      emitHud();
    };

    // --- jogadas --------------------------------------------------------------------

    const tapVehicle = (vehicle: number): void => {
      const before = session.state;
      const result = session.move({ vehicle });
      if (result.ok) {
        ctx.audio.play('click');
        const mine = epoch;
        route = route ? followRoute(route, { vehicle }) : null;
        moving = true;
        stateChanged();
        board.playMove(before, { vehicle }, result, result.state, () => onMoveDone(mine));
      } else {
        // O som de erro toca no instante do impacto (o `Board` cuida disso).
        if (result.reason !== 'unknown-vehicle') ctx.haptics.tap(40);
        board.playMove(before, { vehicle }, result, before, () => {
          syncDataset();
          refreshHand(); // o tabuleiro apaga a mão ao reconciliar
        });
        syncDataset();
      }
    };

    // --- power-ups ------------------------------------------------------------------

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
          else if (res.status === 'limit') hintNoteKey = 'embarca.hint.limit';
          return;
        }
        if (!session.spendHint()) return;
        activeHint = res.move.vehicle;
        board.setHint(activeHint);
        refreshHand();
        ctx.audio.play('click');
      } catch (err) {
        if (!(err instanceof CancelledError)) console.error('[embarca] falha na dica', err);
      } finally {
        hintPending = false;
        if (!destroyed) {
          emitHud();
          syncDataset();
          // O jogador jogou durante a dica: o estado novo ainda não foi checado.
          if (v !== version && e === epoch && !won && !busy) updateStuck();
        }
      }
    };

    const undo = (): void => {
      const out = session.undo();
      if (!out.ok) return;
      ctx.audio.play('click');
      route = null;
      board.setState(out.state);
      stateChanged();
      updateStuck();
    };

    const extraSlot = (): void => {
      const out = session.addSlot();
      if (!out.ok) return;
      ctx.audio.play('click');
      board.setState(out.state);
      stateChanged();
      updateStuck();
    };

    const offTap = stage.onTap((p) => {
      ctx.audio.unlock();
      if (destroyed || paused) return;
      // Interromper: qualquer animação em curso termina agora (e pode disparar a vitória);
      // só depois decidimos se o toque ainda vale.
      board.finishAnimations();
      if (busy || won) return;
      const id = board.pick(p.x, p.y);
      if (id !== null) tapVehicle(id);
    });

    ctx.settings.subscribe((s) => board.setQuality(s.quality));

    const restart = (): void => {
      if (destroyed) return;
      // Falhou ao gerar a próxima fase: o botão de reiniciar tenta de novo.
      if (failedTarget !== null) {
        void loadLevel(failedTarget);
        return;
      }
      // Descarta uma geração pendente e recomeça esta fase.
      loader.invalidate();
      errorKey = null;
      epoch++;
      hintPending = false;
      route = hasTutorial(level) ? [...initialRoute] : null;
      moving = false;
      const state = session.restart();
      won = false;
      busy = false;
      board.setState(state);
      closeNoMoves();
      stateChanged();
      updateStuck();
    };

    // --- ciclo inicial --------------------------------------------------------------

    board.setLevel(first.state.level, session.state);
    stateChanged();
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
        else if (id === 'extraSlot') extraSlot();
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
