import { completeLevel, type GameInstance, type GameModule, type HudState } from '@recreio/core';
import { createLevelLoader } from './levelLoader';
import { Session, type GeneratedLevel, type State } from './logic';
import { EMBARCA_ID, messages, meta } from './meta';
import { Board } from './render/board';
import { createLogicClient, type LogicClient } from './worker';

/** Enquadramento provisório até a primeira fase ser montada. */
const INITIAL_BOUNDS = { width: 6.6, depth: 14 };
/** Pausa entre a última jogada e o aviso "Fase concluída". */
const WIN_DELAY = 0.8;
const BACKGROUND = 0xcfe8ff;

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
    let stuckShown = false;
    /** Muda a cada fase/reinício: descarta callbacks atrasados. */
    let epoch = 0;
    /** Fase cuja geração falhou (tentar de novo pelo Reiniciar ou por novo `next`). */
    let failedTarget: number | null = null;
    let errorKey: string | null = null;

    // --- HUD e diagnóstico ----------------------------------------------------------

    const emitHud = (): void => {
      const hud: HudState = { level, powerUps: [] };
      if (errorKey !== null) hud.message = errorKey;
      ctx.events.emit('hud', hud);
    };

    const syncDataset = (): void => {
      ds.level = String(level);
      ds.state = describeState(session.state);
      ds.view = board.viewString();
      ds.won = String(won);
      ds.bumps = String(session.bumps);
    };

    const updateStuck = (): void => {
      if (!won && !busy && session.stuck) {
        stuckShown = true;
        ctx.events.emit('no-moves', {
          stuck: true,
          canUndo: false,
          canAddTube: false,
          reason: 'stuck',
        });
      } else if (stuckShown) {
        stuckShown = false;
        ctx.events.emit('no-moves', { stuck: false, canUndo: false, canAddTube: false });
      }
    };

    // --- fim de fase ----------------------------------------------------------------

    const win = (): void => {
      won = true;
      progress = completeLevel(progress, level);
      ctx.storage
        .saveLevels(progress)
        .catch((err: unknown) => console.error('[embarca] falha ao salvar', err));
      ctx.audio.play('win');
      syncDataset();
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
      syncDataset();
      updateStuck();
    };

    // --- fases ----------------------------------------------------------------------

    const startPrefetch = (): void => loader.prefetch(level + 1);

    const applyLevel = (gen: GeneratedLevel): void => {
      epoch++;
      session = new Session(gen.state.level);
      won = false;
      busy = false;
      failedTarget = null;
      errorKey = null;
      board.setLevel(gen.state.level, session.state);
      emitHud();
      syncDataset();
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
        board.playMove(before, { vehicle }, result, result.state, () => onMoveDone(mine));
      } else {
        if (result.reason !== 'unknown-vehicle') {
          ctx.audio.play('error');
          ctx.haptics.tap(40);
        }
        board.playMove(before, { vehicle }, result, before, () => syncDataset());
      }
      syncDataset();
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
      const state = session.restart();
      won = false;
      busy = false;
      board.setState(state);
      emitHud();
      syncDataset();
      updateStuck();
    };

    // --- ciclo inicial --------------------------------------------------------------

    board.setLevel(first.state.level, session.state);
    emitHud();
    syncDataset();
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
      usePowerUp() {
        // Os power-ups da Embarca chegam no marco 4.
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
