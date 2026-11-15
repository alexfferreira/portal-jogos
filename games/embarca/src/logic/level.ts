import { rectsOverlap, sweepRect, type Rect } from './geometry';
import { normalizeAngle } from './trig';
import type { Level, Obstacle, Vehicle, VehicleKind } from './types';

/** Dimensões (milésimos) e assentos de cada tipo; `length` é ao longo da seta. Fixas. */
export const VEHICLE_SPECS: Record<VehicleKind, { seats: number; length: number; width: number }> =
  {
    car: { seats: 4, length: 1200, width: 600 },
    van: { seats: 6, length: 1600, width: 700 },
    bus: { seats: 10, length: 2400, width: 800 },
  };

export const DEFAULT_SLOT_COUNT = 4;

export interface VehicleInput {
  kind: VehicleKind;
  color: number;
  cx: number;
  cy: number;
  angle: number;
  hidden?: boolean;
}

export interface LevelInput {
  board: { width: number; height: number };
  vehicles: readonly VehicleInput[];
  obstacles?: readonly Obstacle[];
  queue: readonly number[];
  slotCount?: number;
}

function requireInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${what} deve ser um número inteiro`);
}

function vehicleRect(v: Vehicle): Rect {
  const spec = VEHICLE_SPECS[v.kind];
  return { cx: v.cx, cy: v.cy, hl: spec.length / 2, hw: spec.width / 2, angle: v.angle };
}

function obstacleRect(o: Obstacle): Rect {
  return { cx: o.cx, cy: o.cy, hl: o.w / 2, hw: o.h / 2, angle: o.angle };
}

/**
 * Cria e valida a fase. Calcula, uma vez, o grafo "quem bloqueia quem": como sair um veículo
 * não move os outros, o caminho de cada um só depende de quem ainda está no tabuleiro.
 * Lança `RangeError` para fase inválida.
 */
export function createLevel(input: LevelInput): Level {
  const { width, height } = input.board;
  requireInteger(width, 'largura do tabuleiro');
  requireInteger(height, 'altura do tabuleiro');
  if (width < 1 || height < 1)
    throw new RangeError('o tabuleiro precisa ter largura e altura >= 1');
  if (input.vehicles.length === 0) throw new RangeError('a fase precisa de ao menos um veículo');
  const slotCount = input.slotCount ?? DEFAULT_SLOT_COUNT;
  requireInteger(slotCount, 'número de vagas');
  if (slotCount < 1) throw new RangeError('a fase precisa de ao menos uma vaga');
  input.queue.forEach((c) => requireInteger(c, 'cor de passageiro'));

  const vehicles: Vehicle[] = input.vehicles.map((v, id) => {
    requireInteger(v.color, `cor do veículo ${id}`);
    requireInteger(v.cx, `cx do veículo ${id}`);
    requireInteger(v.cy, `cy do veículo ${id}`);
    requireInteger(v.angle, `ângulo do veículo ${id}`);
    if (v.cx < 0 || v.cx > width || v.cy < 0 || v.cy > height) {
      throw new RangeError(`o veículo ${id} está com o centro fora do tabuleiro`);
    }
    return {
      id,
      kind: v.kind,
      seats: VEHICLE_SPECS[v.kind].seats,
      color: v.color,
      hidden: v.hidden === true,
      cx: v.cx,
      cy: v.cy,
      angle: normalizeAngle(v.angle),
    };
  });

  const obstacles: Obstacle[] = (input.obstacles ?? []).map((o, i) => {
    for (const [k, n] of Object.entries(o)) requireInteger(n, `${k} do obstáculo ${i}`);
    if (o.w < 1 || o.h < 1) throw new RangeError(`o obstáculo ${i} precisa de w e h >= 1`);
    return { ...o, angle: normalizeAngle(o.angle) };
  });

  const seatsByColor = new Map<number, number>();
  for (const v of vehicles) seatsByColor.set(v.color, (seatsByColor.get(v.color) ?? 0) + v.seats);
  const passengersByColor = new Map<number, number>();
  for (const c of input.queue) passengersByColor.set(c, (passengersByColor.get(c) ?? 0) + 1);
  for (const color of new Set([...seatsByColor.keys(), ...passengersByColor.keys()])) {
    const seats = seatsByColor.get(color) ?? 0;
    const passengers = passengersByColor.get(color) ?? 0;
    if (seats !== passengers) {
      throw new RangeError(`cor ${color}: ${seats} assentos para ${passengers} passageiros`);
    }
  }

  const rects = vehicles.map(vehicleRect);
  const obstacleRects = obstacles.map(obstacleRect);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i] as Rect, rects[j] as Rect)) {
        throw new RangeError(`os veículos ${i} e ${j} se sobrepõem no início`);
      }
    }
    obstacleRects.forEach((o, k) => {
      if (rectsOverlap(rects[i] as Rect, o)) {
        throw new RangeError(`o veículo ${i} se sobrepõe ao obstáculo ${k} no início`);
      }
    });
  }

  const blockers: number[][] = [];
  const obstructed: boolean[] = [];
  vehicles.forEach((v, i) => {
    const raw = width + height + VEHICLE_SPECS[v.kind].length;
    const swept = sweepRect(rects[i] as Rect, raw + (raw % 2));
    blockers.push(rects.flatMap((r, j) => (j !== i && rectsOverlap(swept, r) ? [j] : [])));
    obstructed.push(obstacleRects.some((o) => rectsOverlap(swept, o)));
  });

  return {
    board: { width, height },
    vehicles,
    obstacles,
    queue: [...input.queue],
    slotCount,
    blockers,
    obstructed,
  };
}
