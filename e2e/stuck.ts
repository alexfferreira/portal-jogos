import {
  applyMove,
  generateLevel,
  isStuck,
  isWin,
  legalMoves,
  type Move,
  type State,
} from '@recreio/game-mistura/logic';

export interface StuckSetup {
  level: number;
  /** Jogadas (a partir do início da fase) que levam a um beco sem saída. */
  moves: Move[];
  /** Estado final (sem saída). */
  stuck: State;
}

/**
 * Procura, de forma determinística, uma sequência curta de jogadas válidas que termina em
 * "sem saída": a cada passo escolhe a jogada que deixa menos jogadas disponíveis (empate:
 * a primeira). Percorre as fases de `from` a `to` e devolve a de sequência mais curta.
 */
export function findStuckSequence(from = 1, to = 120, maxMoves = 14): StuckSetup | null {
  let best: StuckSetup | null = null;
  for (let level = from; level <= to; level++) {
    let state = generateLevel(level).state;
    const moves: Move[] = [];
    while (moves.length < maxMoves && !isWin(state) && !isStuck(state)) {
      let pick: { move: Move; state: State; options: number } | null = null;
      for (const move of legalMoves(state)) {
        const r = applyMove(state, move);
        if (!r.ok) continue;
        const options = legalMoves(r.state).length;
        if (isWin(r.state)) continue;
        if (!pick || options < pick.options) pick = { move, state: r.state, options };
      }
      if (!pick) break;
      moves.push(pick.move);
      state = pick.state;
    }
    if (isStuck(state) && (!best || moves.length < best.moves.length)) {
      best = { level, moves, stuck: state };
      if (moves.length <= 4) break;
    }
  }
  return best;
}
