import type { Level, Move, MoveRejected, MoveResult, Slot, State } from './types';
import type { Boarding, Departure } from './types';

/** Estado inicial: todos os veículos no tabuleiro, vagas vazias, fila no começo. */
export function createState(level: Level): State {
  return {
    level,
    onBoard: level.vehicles.map((v) => v.id),
    slots: Array.from({ length: level.slotCount }, () => null),
    queueIndex: 0,
    waiting: [],
  };
}

/** O veículo está no tabuleiro, sem obstáculo e sem nenhum bloqueador ainda no tabuleiro. */
export function isFree(state: State, vehicleId: number): boolean {
  if (!state.onBoard.includes(vehicleId)) return false;
  if (state.level.obstructed[vehicleId]) return false;
  const blockers = state.level.blockers[vehicleId] ?? [];
  return blockers.every((b) => !state.onBoard.includes(b));
}

function rejected(
  state: State,
  reason: MoveRejected['reason'],
  blockedBy: readonly number[] = [],
  byObstacle = false,
): MoveRejected {
  return { ok: false, reason, state, blockedBy, byObstacle };
}

/**
 * Manda um veículo sair. Decisão em ordem: veículo desconhecido, caminho bloqueado, sem vaga;
 * senão ele estaciona na vaga livre de menor índice e roda a cascata de embarque. Não altera
 * o estado recebido; em toda recusa devolve esse mesmo objeto.
 */
export function applyMove(state: State, move: Move): MoveResult {
  const id = move.vehicle;
  const { level } = state;
  if (!Number.isInteger(id) || !state.onBoard.includes(id)) {
    return rejected(state, 'unknown-vehicle');
  }
  if (!isFree(state, id)) {
    const blockedBy = (level.blockers[id] ?? []).filter((b) => state.onBoard.includes(b));
    return rejected(state, 'blocked', blockedBy, level.obstructed[id] === true);
  }
  const slotIndex = state.slots.findIndex((s) => s === null);
  if (slotIndex === -1) return rejected(state, 'no-slot');

  const slots: (Slot | null)[] = [...state.slots];
  slots[slotIndex] = { vehicle: id, filled: 0 };
  const boardings: Boarding[] = [];
  const departures: Departure[] = [];
  let queueIndex = state.queueIndex;

  // Cascata: o primeiro da fila embarca no estacionado da mesma cor (menor vaga primeiro).
  while (queueIndex < level.queue.length) {
    const color = level.queue[queueIndex] as number;
    const target = slots.findIndex((s) => {
      if (s === null) return false;
      const v = level.vehicles[s.vehicle];
      return v !== undefined && v.color === color && s.filled < v.seats;
    });
    if (target === -1) break;
    const slot = slots[target] as Slot;
    const vehicle = level.vehicles[slot.vehicle];
    const filled = slot.filled + 1;
    boardings.push({ slot: target, vehicle: slot.vehicle, passenger: queueIndex, color });
    queueIndex++;
    if (vehicle !== undefined && filled === vehicle.seats) {
      departures.push({ slot: target, vehicle: slot.vehicle });
      slots[target] = null;
    } else {
      slots[target] = { vehicle: slot.vehicle, filled };
    }
  }

  return {
    ok: true,
    state: {
      level,
      onBoard: state.onBoard.filter((v) => v !== id),
      slots,
      queueIndex,
      waiting: state.waiting,
    },
    move: { vehicle: id },
    slot: slotIndex,
    boardings,
    departures,
    revealed: level.vehicles[id]?.hidden === true,
  };
}

/** Veículos livres para sair, em ordem de id, e só se houver vaga livre. */
export function legalMoves(state: State): Move[] {
  if (!state.slots.some((s) => s === null)) return [];
  return state.onBoard.filter((id) => isFree(state, id)).map((vehicle) => ({ vehicle }));
}

/** Vitória: ninguém no tabuleiro nem esperando, e a fila inteira embarcou. */
export function isWin(state: State): boolean {
  return (
    state.onBoard.length === 0 &&
    state.waiting.length === 0 &&
    state.queueIndex === state.level.queue.length
  );
}

/** Sem saída: não venceu e não há nenhuma jogada possível. */
export function isStuck(state: State): boolean {
  return !isWin(state) && legalMoves(state).length === 0;
}

/** Power-up "vaga extra": uma vaga vazia a mais no fim. */
export function addSlot(state: State): State {
  return { ...state, slots: [...state.slots, null] };
}

/**
 * Cor que o jogador pode ver: a de um veículo misterioso só aparece depois que ele
 * estaciona. `null` = escondida (ou veículo inexistente).
 */
export function visibleColor(state: State, vehicleId: number): number | null {
  const v = state.level.vehicles[vehicleId];
  if (v === undefined) return null;
  if (!v.hidden) return v.color;
  return state.slots.some((s) => s?.vehicle === vehicleId) ? v.color : null;
}
