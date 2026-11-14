import {
  solveSearch,
  type SearchLimits,
  type SearchProblem,
  type SearchStatus,
} from '@recreio/core/puzzle';
import { applyMove, isPure, isWin, legalMoves } from './state';
import type { Move, State, Tube } from './types';

/**
 * Chave canônica: a ordem dos tubos não importa, então as chaves de cada tubo são
 * ordenadas. Camadas ocultas entram na chave porque mudam as jogadas possíveis.
 */
export function canonicalKey(state: State): string {
  return state.tubes
    .map((t) => t.map((u) => (u.hidden ? `${u.color}?` : String(u.color))).join(','))
    .sort()
    .join('|');
}

/** Unidades "fora do lugar": tudo acima do prefixo uniforme da base, mais camadas ocultas. */
function heuristic(state: State): number {
  let cost = 0;
  for (const tube of state.tubes) {
    const base = tube[0];
    if (!base) continue;
    let prefix = 0;
    while (prefix < tube.length) {
      const u = tube[prefix] as Tube[number];
      if (u.hidden || u.color !== base.color) break;
      prefix++;
    }
    cost += tube.length - prefix;
    for (let i = prefix; i < tube.length; i++) if ((tube[i] as Tube[number]).hidden) cost += 1;
  }
  return cost;
}

/**
 * Jogadas úteis para a busca: `legalMoves` menos as que nunca ajudam.
 * - tubo puro (uma cor só) para tubo vazio: só troca de lugar;
 * - de tubo puro completo: já está pronto;
 * - entre dois tubos puros da mesma cor, só do menor para o maior (desempate pelo índice).
 */
export function searchMoves(state: State): Move[] {
  const { tubes, capacity } = state;
  return legalMoves(state).filter(({ from, to }) => {
    const src = tubes[from] as Tube;
    const dst = tubes[to] as Tube;
    if (isPure(src)) {
      if (dst.length === 0) return false;
      if (src.length === capacity) return false;
      if (isPure(dst) && (src.length > dst.length || (src.length === dst.length && from > to))) {
        return false;
      }
    }
    return true;
  });
}

export const misturaProblem: SearchProblem<State, Move> = {
  legalMoves: searchMoves,
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

/**
 * Resolve o estado (sem power-ups) usando a informação COMPLETA, inclusive as cores
 * reais das camadas ocultas. As jogadas devolvidas obedecem às regras reais do jogo.
 */
export function solve(state: State, limits: SearchLimits = {}): SolveResult {
  return solveSearch(misturaProblem, state, limits);
}

export interface HintResult {
  /** Estado ao qual a dica se refere (o chamador descarta a dica se o estado atual mudou). */
  state: State;
  status: SearchStatus;
  /** Próxima jogada sugerida; `null` se já venceu, sem saída ou limite estourado. */
  move: Move | null;
  /** Solução completa a partir do estado (útil para testes e2e). */
  moves: Move[];
  nodes: number;
}

/** Dica: primeira jogada de uma solução do estado atual (estado completo, ver DECISIONS). */
export function hint(state: State, limits: SearchLimits = {}): HintResult {
  const r = solve(state, limits);
  return { state, status: r.status, move: r.moves[0] ?? null, moves: r.moves, nodes: r.nodes };
}
