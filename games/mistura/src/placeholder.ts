import {
  completeLevel,
  demoGame,
  type GameInstance,
  type GameModule,
  type PowerUpState,
} from '@recreio/core';
import { messages, meta, MISTURA_ID } from './meta';

/** Toques para "vencer" a fase provisória. */
const TAPS_TO_WIN = 12;
const UNDO_PER_LEVEL = 5;
const EXTRA_TUBE_PER_LEVEL = 1;

/**
 * PROVISÓRIO (marcos 3–4): reaproveita a cena de demonstração do core para o portal ter
 * um jogo real a montar. Valida HUD, power-ups, modal de fase concluída e progresso.
 * Será substituído pela Mistura de verdade (lógica no marco 4, 3D no marco 5).
 */
export const misturaGame: GameModule = {
  id: MISTURA_ID,
  meta,
  messages,

  async mount(container, ctx): Promise<GameInstance> {
    let progress = await ctx.storage.loadLevels();
    let level = progress.currentLevel;
    let undo = UNDO_PER_LEVEL;
    let extraTube = EXTRA_TUBE_PER_LEVEL;
    let done = false;

    const powerUps = (): PowerUpState[] => [
      { id: 'undo', labelKey: 'mistura.powerup.undo', icon: 'undo', count: undo },
      { id: 'extraTube', labelKey: 'mistura.powerup.extraTube', icon: 'plus', count: extraTube },
    ];
    const emitHud = (): void => ctx.events.emit('hud', { level, powerUps: powerUps() });

    const inner = await demoGame.mount(container, ctx);
    ctx.events.on('score', ({ score }) => {
      if (done || score < TAPS_TO_WIN) return;
      done = true;
      progress = completeLevel(progress, level);
      ctx.storage
        .saveLevels(progress)
        .catch((err) => console.error('[mistura] falha ao salvar', err));
      ctx.audio.play('win');
      ctx.events.emit('level-complete', { level });
    });
    emitHud();

    const resetLevel = (): void => {
      undo = UNDO_PER_LEVEL;
      extraTube = EXTRA_TUBE_PER_LEVEL;
      done = false;
      inner.restart();
      emitHud();
    };

    return {
      pause: () => inner.pause(),
      resume: () => inner.resume(),
      restart: resetLevel,
      next() {
        level += 1;
        resetLevel();
      },
      usePowerUp(id) {
        if (id === 'undo' && undo > 0) undo -= 1;
        else if (id === 'extraTube' && extraTube > 0) extraTube -= 1;
        else return;
        ctx.audio.play('click');
        emitHud();
      },
      destroy: () => inner.destroy(),
    };
  },
};
