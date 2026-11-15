import {
  solveSearch,
  type SearchLimits,
  type SearchProblem,
  type SearchStatus,
} from '@recreio/core/puzzle';
import { applyMove, isWin, legalMoves } from './state';
import type { Move, State } from './types';

/**
 * Chave de estado: veículos no tabuleiro, vagas e posição na fila. A ordem das vagas entra
 * na chave porque a vaga de menor índice embarca primeiro: trocar duas vagas muda o jogo.
 */
export function canonicalKey(state: State): string {
  const slots = state.slots.map((s) => (s === null ? '-' : `${s.vehicle}:${s.filled}`));
  return `${state.onBoard.join(',')}|${slots.join(',')}|${state.queueIndex}`;
}

/** Quanto falta: veículos no tabuleiro pesam mais que veículos esperando passageiros. */
function heuristic(state: State): number {
  return state.onBoard.length * 4 + state.slots.filter((s) => s !== null).length;
}

export const embarcaProblem: SearchProblem<State, Move> = {
  legalMoves,
  apply: (state, move) => {
    const r = applyMove(state, move);
    if (!r.ok) throw new Error(`jogada inválida no solver: ${r.reason}`);
    return r.state;
  },
  isGoal: isWin,
  canonicalKey,
  heuristic,
};

export interface SolveResult {
  status: SearchStatus;
  moves: Move[];
  nodes: number;
}

/** Resolve o estado (sem power-ups) com as regras reais do jogo. */
export function solve(state: State, limits: SearchLimits = {}): SolveResult {
  return solveSearch(embarcaProblem, state, limits);
}

export interface HintResult {
  /** Estado ao qual a dica se refere (o chamador descarta a dica se o estado atual mudou). */
  state: State;
  status: SearchStatus;
  /** Próxima jogada sugerida; `null` se já venceu, sem saída ou limite estourado. */
  move: Move | null;
  /** Solução completa a partir do estado. */
  moves: Move[];
  nodes: number;
}

/** Dica: primeira jogada de uma solução do estado atual. */
export function hint(state: State, limits: SearchLimits = {}): HintResult {
  const r = solve(state, limits);
  return { state, status: r.status, move: r.moves[0] ?? null, moves: r.moves, nodes: r.nodes };
}
