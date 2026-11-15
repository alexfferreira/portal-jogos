/**
 * Plano de animação de uma jogada. PURO (sem Three, sem DOM): descreve o que animar e quando;
 * o `Board` só executa. Convenção de `heading`: ângulo da lógica em radianos, anti-horário na
 * tela (é o `rotation.y` do veículo); a direção de avanço no mundo é `(cos h, −sin h)` em (X, Z).
 */
import {
  VEHICLE_SPECS,
  type Move,
  type MoveApplied,
  type MoveRejected,
  type State,
} from '../logic';
import { contactDistance, UNIT, type Layout, type WorldPoint } from './layout';

/** Velocidade na perna reta (unidades por segundo). */
export const DRIVE_SPEED = 12;
export const PARK_DURATION = 0.45;
export const BOARD_DURATION = 0.22;
export const BOARD_STAGGER = 0.06;
/** O escalonamento dos embarques nunca passa disto (em segundos). */
const MAX_STAGGER = 0.6;
export const DEPART_DURATION = 0.4;
export const BUMP_DURATION = 0.3;
export const SHAKE_DURATION = 0.25;
/** Quanto o veículo avança, no máximo, numa batida (unidades). */
export const MAX_BUMP_TRAVEL = 1.2;

const MIN_LEG_DURATION = 0.25;
/** Folga além da borda do tabuleiro em que a perna reta termina (unidades). */
const EXIT_MARGIN = 0.3;
const CURVE_SAMPLES = 12;
const UP = Math.PI / 2;

export interface PathPoint {
  x: number;
  z: number;
  heading: number;
}

export type Step =
  | {
      kind: 'drive';
      vehicle: number;
      /** Vaga em que o veículo estaciona. */
      slot: number;
      path: PathPoint[];
      duration: number;
      delay: number;
    }
  | {
      kind: 'board';
      passenger: number;
      vehicle: number;
      slot: number;
      from: WorldPoint;
      to: WorldPoint;
      duration: number;
      delay: number;
    }
  | {
      kind: 'depart';
      vehicle: number;
      slot: number;
      path: PathPoint[];
      duration: number;
      delay: number;
    }
  | {
      kind: 'bump';
      vehicle: number;
      forward: number;
      blockers: number[];
      duration: number;
      delay: number;
    }
  | { kind: 'shake'; vehicle: number; duration: number; delay: number };

export interface MovePlan {
  steps: Step[];
  /** Fim da última etapa, em segundos. */
  total: number;
}

const finish = (steps: Step[]): MovePlan => ({
  steps,
  total: steps.reduce((acc, s) => Math.max(acc, s.delay + s.duration), 0),
});

/** Distância, a partir de `from` na direção `dir`, até sair da caixa (com folga). */
function distanceToExit(
  layout: Layout,
  from: WorldPoint,
  dir: { x: number; z: number },
  margin: number,
): number {
  const b = layout.board;
  const limits = {
    minX: b.cx - b.width / 2 - margin,
    maxX: b.cx + b.width / 2 + margin,
    minZ: b.cz - b.depth / 2 - margin,
    maxZ: b.cz + b.depth / 2 + margin,
  };
  const axis = (pos: number, d: number, lo: number, hi: number): number => {
    if (d > 1e-9) return (hi - pos) / d;
    if (d < -1e-9) return (lo - pos) / d;
    return Infinity;
  };
  return Math.max(
    0,
    Math.min(
      axis(from.x, dir.x, limits.minX, limits.maxX),
      axis(from.z, dir.z, limits.minZ, limits.maxZ),
    ),
  );
}

/** Curva cúbica de Bézier amostrada, com o `heading` dado pela tangente. */
function bezier(p0: WorldPoint, p1: WorldPoint, p2: WorldPoint, p3: WorldPoint): PathPoint[] {
  const at = (t: number): WorldPoint => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    };
  };
  const out: PathPoint[] = [];
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const p = at(t);
    const q = at(Math.min(1, t + 0.01));
    const back = at(Math.max(0, t - 0.01));
    const heading = Math.atan2(-(q.z - back.z), q.x - back.x);
    out.push({ x: p.x, z: p.z, heading });
  }
  // O último ponto é exatamente o centro da vaga, de frente para cima na tela.
  out[out.length - 1] = { x: p3.x, z: p3.z, heading: UP };
  return out;
}

/**
 * Plano da jogada `move` aplicada a `before`. Aplicada: sair, estacionar, embarcar e partir.
 * Recusada: bater e voltar (caminho bloqueado) ou balançar (sem vaga); vazio se o veículo
 * não existe.
 */
export function planMove(
  before: State,
  move: Move,
  result: MoveApplied | MoveRejected,
  layout: Layout,
): MovePlan {
  const vehicle = before.level.vehicles[move.vehicle];
  if (vehicle === undefined) return finish([]);

  if (!result.ok) {
    if (result.reason === 'blocked') {
      const maxMilli = Math.round(MAX_BUMP_TRAVEL * UNIT);
      const milli = contactDistance(
        before.level,
        move.vehicle,
        result.blockedBy,
        before.onBoard,
        maxMilli,
      );
      return finish([
        {
          kind: 'bump',
          vehicle: move.vehicle,
          forward: Math.min(milli / UNIT, MAX_BUMP_TRAVEL),
          blockers: [...result.blockedBy],
          duration: BUMP_DURATION,
          delay: 0,
        },
      ]);
    }
    if (result.reason === 'no-slot') {
      return finish([{ kind: 'shake', vehicle: move.vehicle, duration: SHAKE_DURATION, delay: 0 }]);
    }
    return finish([]);
  }

  const heading = (vehicle.angle * Math.PI) / 180;
  const dir = { x: Math.cos(heading), z: -Math.sin(heading) };
  const start = layout.toWorld(vehicle.cx, vehicle.cy);
  const half = VEHICLE_SPECS[vehicle.kind].length / 2 / UNIT;
  const leg = distanceToExit(layout, start, dir, half + EXIT_MARGIN);
  const exit: WorldPoint = { x: start.x + dir.x * leg, z: start.z + dir.z * leg };
  const slot = layout.slotCenter(result.slot);
  const curve = bezier(
    exit,
    { x: exit.x + dir.x * 2, z: exit.z + dir.z * 2 },
    { x: slot.x, z: slot.z + 1.5 },
    slot,
  );
  const driveDuration = Math.max(MIN_LEG_DURATION, leg / DRIVE_SPEED) + PARK_DURATION;
  const steps: Step[] = [
    {
      kind: 'drive',
      vehicle: move.vehicle,
      slot: result.slot,
      path: [{ x: start.x, z: start.z, heading }, { x: exit.x, z: exit.z, heading }, ...curve],
      duration: driveDuration,
      delay: 0,
    },
  ];

  const boardEnd = new Map<string, number>();
  result.boardings.forEach((b, i) => {
    const delay = driveDuration + Math.min(i * BOARD_STAGGER, MAX_STAGGER);
    steps.push({
      kind: 'board',
      passenger: b.passenger,
      vehicle: b.vehicle,
      slot: b.slot,
      from: layout.queuePoint(b.passenger),
      to: layout.slotCenter(b.slot),
      duration: BOARD_DURATION,
      delay,
    });
    const key = `${b.slot}:${b.vehicle}`;
    boardEnd.set(key, Math.max(boardEnd.get(key) ?? 0, delay + BOARD_DURATION));
  });

  const offX = layout.width / 2 + 3;
  for (const d of result.departures) {
    const from = layout.slotCenter(d.slot);
    steps.push({
      kind: 'depart',
      vehicle: d.vehicle,
      slot: d.slot,
      path: [
        { x: from.x, z: from.z, heading: UP },
        { x: offX, z: from.z, heading: 0 },
      ],
      duration: DEPART_DURATION,
      delay: boardEnd.get(`${d.slot}:${d.vehicle}`) ?? driveDuration,
    });
  }
  return finish(steps);
}
