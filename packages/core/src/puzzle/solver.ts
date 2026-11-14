/**
 * Busca genérica para puzzles (seção 4.4): memoização de estados canônicos,
 * limite de nós e de tempo.
 *
 * Algoritmo: busca gulosa "melhor primeiro" (best-first) com fila de prioridade.
 * - A prioridade é `heuristic(estado)` (menor = mais promissor) somada a
 *   `depthWeight * profundidade` (padrão 0 = totalmente guloso).
 * - Empates saem em ordem LIFO, o que sem heurística equivale a uma busca em profundidade (DFS).
 * - `canonicalKey` identifica estados equivalentes (ordem de tubos, simetrias): cada chave é
 *   expandida uma única vez. Esgotar a fila sem achar a meta prova que NÃO há solução.
 * - Não garante a solução mais curta; garante uma solução válida rapidamente.
 */
export type SearchStatus = 'solved' | 'unsolvable' | 'limit';

export interface SearchProblem<State, Move> {
  legalMoves(state: State): readonly Move[];
  apply(state: State, move: Move): State;
  isGoal(state: State): boolean;
  /** Chave string igual para estados equivalentes. */
  canonicalKey(state: State): string;
  /** Estimativa de distância até a meta; menor = melhor. Opcional. */
  heuristic?(state: State): number;
}

export interface SearchLimits {
  /** Máximo de estados distintos gerados (determinístico). Padrão 200 000. */
  maxNodes?: number;
  /** Tempo máximo em ms (não determinístico; use só como teto de segurança). */
  maxMillis?: number;
  /** Relógio injetável (testes). Padrão: `performance.now` ou `Date.now`. */
  now?: () => number;
  /** Peso da profundidade na prioridade. Padrão 0. */
  depthWeight?: number;
}

export interface SearchResult<Move> {
  status: SearchStatus;
  /** Sequência de jogadas até a meta (vazia se `status !== 'solved'` ou já resolvido). */
  moves: Move[];
  /** Estados distintos gerados. */
  nodes: number;
}

/** Contrato genérico de solver: recebe um estado e devolve a sequência de jogadas. */
export interface Solver<State, Move> {
  solve(state: State, limits?: SearchLimits): SearchResult<Move>;
}

interface Node<State, Move> {
  state: State;
  parent: number;
  move: Move | undefined;
  depth: number;
}

interface HeapEntry {
  priority: number;
  seq: number;
  index: number;
}

/** Heap binário mínimo; em empate de prioridade, o `seq` maior (mais novo) sai primeiro. */
class MinHeap {
  private data: HeapEntry[] = [];

  get size(): number {
    return this.data.length;
  }

  private before(a: HeapEntry, b: HeapEntry): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.seq > b.seq);
  }

  push(entry: HeapEntry): void {
    const d = this.data;
    d.push(entry);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(d[i] as HeapEntry, d[p] as HeapEntry)) break;
      [d[i], d[p]] = [d[p] as HeapEntry, d[i] as HeapEntry];
      i = p;
    }
  }

  pop(): HeapEntry | undefined {
    const d = this.data;
    const top = d[0];
    const last = d.pop();
    if (top === undefined || last === undefined) return top;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && this.before(d[l] as HeapEntry, d[m] as HeapEntry)) m = l;
        if (r < d.length && this.before(d[r] as HeapEntry, d[m] as HeapEntry)) m = r;
        if (m === i) break;
        [d[i], d[m]] = [d[m] as HeapEntry, d[i] as HeapEntry];
        i = m;
      }
    }
    return top;
  }
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export function solveSearch<State, Move>(
  problem: SearchProblem<State, Move>,
  initial: State,
  limits: SearchLimits = {},
): SearchResult<Move> {
  const maxNodes = limits.maxNodes ?? 200_000;
  const now = limits.now ?? defaultNow;
  const timed = limits.maxMillis !== undefined;
  const deadline = timed ? now() + (limits.maxMillis as number) : Infinity;
  const depthWeight = limits.depthWeight ?? 0;
  const h = problem.heuristic;

  if (problem.isGoal(initial)) return { status: 'solved', moves: [], nodes: 1 };

  const nodes: Node<State, Move>[] = [{ state: initial, parent: -1, move: undefined, depth: 0 }];
  const seen = new Set<string>([problem.canonicalKey(initial)]);
  const heap = new MinHeap();
  let seq = 0;
  heap.push({ priority: 0, seq: seq++, index: 0 });

  const rebuild = (index: number): Move[] => {
    const out: Move[] = [];
    for (let i = index; i > 0; i = (nodes[i] as Node<State, Move>).parent) {
      out.push((nodes[i] as Node<State, Move>).move as Move);
    }
    return out.reverse();
  };

  let expanded = 0;
  for (;;) {
    const entry = heap.pop();
    if (entry === undefined) return { status: 'unsolvable', moves: [], nodes: nodes.length };
    if ((++expanded & 127) === 0 && timed && now() > deadline) {
      return { status: 'limit', moves: [], nodes: nodes.length };
    }
    const node = nodes[entry.index] as Node<State, Move>;
    for (const move of problem.legalMoves(node.state)) {
      const next = problem.apply(node.state, move);
      const key = problem.canonicalKey(next);
      if (seen.has(key)) continue;
      if (nodes.length >= maxNodes) return { status: 'limit', moves: [], nodes: nodes.length };
      seen.add(key);
      const index = nodes.length;
      nodes.push({ state: next, parent: entry.index, move, depth: node.depth + 1 });
      if (problem.isGoal(next))
        return { status: 'solved', moves: rebuild(index), nodes: nodes.length };
      const priority = (h ? h(next) : 0) + depthWeight * (node.depth + 1);
      heap.push({ priority, seq: seq++, index });
    }
  }
}
