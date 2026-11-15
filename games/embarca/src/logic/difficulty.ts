import { createRng } from '@recreio/core/puzzle';
import { applyMove, createState, isStuck, isWin, legalMoves } from './state';
import type { Level } from './types';

export interface PlayOutcome {
  won: boolean;
  stuck: boolean;
  /** Quantas jogadas foram aplicadas antes da primeira recusa (ou do fim da lista). */
  applied: number;
  /**
   * Maior número de vagas ocupadas no instante em que um veículo toma a vaga (antes do
   * embarque): as vagas ocupadas antes da jogada mais uma.
   */
  peakParked: number;
}

/** Joga os veículos em ordem com o motor real; para na primeira jogada recusada. */
export function playOrder(level: Level, order: readonly number[]): PlayOutcome {
  let state = createState(level);
  let applied = 0;
  let peakParked = 0;
  for (const vehicle of order) {
    const occupied = state.slots.filter((s) => s !== null).length;
    const r = applyMove(state, { vehicle });
    if (!r.ok) break;
    state = r.state;
    applied++;
    peakParked = Math.max(peakParked, occupied + 1);
  }
  return { won: isWin(state), stuck: isStuck(state), applied, peakParked };
}

/**
 * Fração (0..1) de `samples` partidas que terminam em vitória quando cada jogada é escolhida
 * ao acaso (PRNG semeado) entre as legais, até vencer ou travar. Mede o quanto a fase
 * depende de acertar a ordem: perto de 1 = quase qualquer ordem serve.
 */
export function randomPlayoutWinRate(level: Level, seed: number, samples: number): number {
  const rng = createRng(seed);
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    let state = createState(level);
    for (;;) {
      const moves = legalMoves(state);
      if (moves.length === 0) break;
      const r = applyMove(state, rng.pick(moves));
      if (!r.ok) break;
      state = r.state;
    }
    if (isWin(state)) wins++;
  }
  return wins / samples;
}
