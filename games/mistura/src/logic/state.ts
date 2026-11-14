import type { Move, MoveResult, Revealed, State, Tube, Unit } from './types';

/** Entrada de `createState`: número = cor visível; objeto permite `hidden`. */
export type UnitInput = number | { color: number; hidden?: boolean };

/**
 * Cria um estado válido. O topo de cada tubo é sempre revelado (invariante:
 * o jogador sempre vê a cor do topo). Lança `RangeError` se algum tubo exceder a capacidade.
 */
export function createState(capacity: number, tubes: readonly (readonly UnitInput[])[]): State {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('capacidade deve ser um inteiro >= 1');
  }
  const built = tubes.map((tube, i) => {
    if (tube.length > capacity) throw new RangeError(`tubo ${i} excede a capacidade`);
    const units: Unit[] = tube.map((u) =>
      typeof u === 'number'
        ? { color: u, hidden: false }
        : { color: u.color, hidden: u.hidden === true },
    );
    return revealTop(units);
  });
  return { capacity, tubes: built };
}

function revealTop(units: Unit[]): Unit[] {
  const last = units.length - 1;
  const top = units[last];
  if (top && top.hidden) units[last] = { color: top.color, hidden: false };
  return units;
}

export function topUnit(tube: Tube): Unit | undefined {
  return tube[tube.length - 1];
}

/**
 * Bloco do topo: unidades consecutivas visíveis de mesma cor, contadas do topo.
 * Para no primeiro "?" (o jogador não sabe a cor dele). Tubo vazio: `count` 0.
 */
export function topBlock(tube: Tube): { color: number; count: number } {
  const top = topUnit(tube);
  if (!top || top.hidden) return { color: -1, count: 0 };
  let count = 0;
  for (let i = tube.length - 1; i >= 0; i--) {
    const u = tube[i] as Unit;
    if (u.hidden || u.color !== top.color) break;
    count++;
  }
  return { color: top.color, count };
}

/** Todas as unidades com a mesma cor (e nenhuma oculta); tubo vazio não conta. */
export function isPure(tube: Tube): boolean {
  const first = tube[0];
  if (!first) return false;
  return tube.every((u) => !u.hidden && u.color === first.color);
}

/** Tubo cheio com uma única cor (a cor real, ignorando "?"). */
export function isComplete(tube: Tube, capacity: number): boolean {
  if (tube.length !== capacity) return false;
  const first = tube[0] as Unit;
  return tube.every((u) => u.color === first.color);
}

export function isValidMove(state: State, move: Move): boolean {
  return applyMove(state, move).ok;
}

/**
 * Aplica uma jogada sem alterar o estado recebido. Transfere o máximo possível do
 * bloco do topo da origem, limitado ao espaço livre do destino.
 * Jogada inválida devolve `{ ok: false, reason, state }`.
 */
export function applyMove(state: State, move: Move): MoveResult {
  const { from, to } = move;
  const { tubes, capacity } = state;
  const reject = (reason: Extract<MoveResult, { ok: false }>['reason']): MoveResult => ({
    ok: false,
    reason,
    state,
  });
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= tubes.length ||
    to >= tubes.length
  ) {
    return reject('invalid-index');
  }
  if (from === to) return reject('same-tube');
  const src = tubes[from] as Tube;
  const dst = tubes[to] as Tube;
  if (src.length === 0) return reject('empty-source');
  const block = topBlock(src);
  if (block.count === 0) return reject('hidden-top');
  if (dst.length >= capacity) return reject('full-destination');
  const dstTop = topUnit(dst);
  if (dstTop && dstTop.color !== block.color) return reject('color-mismatch');

  const moved = Math.min(block.count, capacity - dst.length);
  const revealed: Revealed[] = [];

  const newSrc: Unit[] = src.slice(0, src.length - moved);
  const exposed = newSrc[newSrc.length - 1];
  if (exposed && exposed.hidden) {
    newSrc[newSrc.length - 1] = { color: exposed.color, hidden: false };
    revealed.push({ tube: from, index: newSrc.length - 1, color: exposed.color });
  }

  let newDst: Unit[] = [...dst, ...src.slice(src.length - moved)];
  let completed: number | null = null;
  if (isComplete(newDst, capacity)) {
    completed = to;
    // Tubo completo revela tudo: a cor já é conhecida por inteiro.
    newDst = newDst.map((u, index) => {
      if (!u.hidden) return u;
      revealed.push({ tube: to, index, color: u.color });
      return { color: u.color, hidden: false };
    });
  }

  const newTubes = tubes.slice();
  newTubes[from] = newSrc;
  newTubes[to] = newDst;
  return {
    ok: true,
    state: { capacity, tubes: newTubes },
    move: { from, to },
    moved,
    color: block.color,
    revealed,
    completed,
  };
}

/** Todas as jogadas válidas, em ordem (origem, destino) crescente. */
export function legalMoves(state: State): Move[] {
  const out: Move[] = [];
  const n = state.tubes.length;
  for (let from = 0; from < n; from++) {
    for (let to = 0; to < n; to++) {
      if (from !== to && applyMove(state, { from, to }).ok) out.push({ from, to });
    }
  }
  return out;
}

/** Vitória: todo tubo está vazio ou cheio com uma única cor. */
export function isWin(state: State): boolean {
  return state.tubes.every((t) => t.length === 0 || isComplete(t, state.capacity));
}

/** Sem saída: não venceu e não há nenhuma jogada válida. */
export function isStuck(state: State): boolean {
  return !isWin(state) && legalMoves(state).length === 0;
}

/** Power-up "tubo extra": novo estado com um tubo vazio no fim. */
export function addEmptyTube(state: State): State {
  return { capacity: state.capacity, tubes: [...state.tubes, []] };
}
