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

/** Velocidade média do voo até a vaga (unidades por segundo) e limites da duração. */
export const FLIGHT_SPEED = 16;
export const MIN_FLIGHT_DURATION = 0.6;
export const MAX_FLIGHT_DURATION = 1.5;
export const BOARD_DURATION = 0.22;
export const BOARD_STAGGER = 0.06;
/** O escalonamento dos embarques nunca passa disto (em segundos). */
const MAX_STAGGER = 0.6;
export const DEPART_DURATION = 0.4;
/** Velocidade da batida na ida (unidades por segundo); a volta é mais rápida. */
export const BUMP_SPEED = 14;
export const BUMP_RETURN_FACTOR = 1.8;
export const MIN_BUMP_FORWARD = 0.18;
export const MIN_BUMP_BACK = 0.22;
export const SHAKE_DURATION = 0.25;
/** Direção do veículo estacionado: de frente para a fila de passageiros (para baixo na tela). */
export const PARKED_HEADING = -Math.PI / 2;

/** Quanto o veículo anda em linha reta ao longo da seta antes de começar a curva (unidades). */
const TAKEOFF = 1.2;
/** Folga além da borda do tabuleiro usada para limitar a decolagem (unidades). */
const EXIT_MARGIN = 0.3;
/** Passo do voo (unidades), raio mínimo da curva e ponto da linha da vaga que ele persegue. */
const STEP = 0.12;
const RADIUS = 1;
const MIN_LOOKAHEAD = 1.5;
const LOOKAHEAD_PER_OFFSET = 0.8;
const MAX_FLIGHT_STEPS = 900;
/** Distância (unidades) acima da vaga do portão, e desalinhamento aceito para descer. */
const GATE_ABOVE = 1.6;
const ALIGNED = 0.1;
/** Desalinhamento máximo aceito ao chegar na altura da vaga (o pouso corrige o resto). */
const LANDING_OFFSET = 0.5;
/** Pontos do pouso e distância (unidades) da altura da vaga a partir da qual ele começa. */
const LANDING_SAMPLES = 8;
/** O voo para um passo antes da altura da vaga: nunca passa dela e volta. */
const ARRIVED = STEP;

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
      /** Até onde o veículo vai antes de bater (unidades): o contato de verdade. */
      forward: number;
      /** Tempo da ida; o resto de `duration` é a volta. */
      forwardDuration: number;
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

/** Distância, a partir de `from` na direção `dir`, até sair da caixa do tabuleiro (com folga). */
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

/**
 * Voo até a vaga com **raio de curva mínimo**, como um carro de verdade: a cada passo o veículo
 * vira em direção a um ponto da linha vertical da vaga, um pouco à frente, sem passar da
 * curvatura máxima. Uma meia-volta sai como um arco largo (nunca como um rebote) e a chegada é
 * sempre de cima, descendo pela linha da vaga, de frente para a fila.
 */
function fly(from: WorldPoint, fromHeading: number, slot: WorldPoint): PathPoint[] {
  const out: PathPoint[] = [];
  const gate = slot.z - GATE_ABOVE;
  let x = from.x;
  let z = from.z;
  let h = fromHeading;
  for (let i = 0; i < MAX_FLIGHT_STEPS; i++) {
    // Só termina na altura da vaga se já estiver alinhado com ela.
    if (z >= slot.z - ARRIVED && Math.abs(slot.x - x) <= LANDING_OFFSET) break;
    const dx = slot.x - x;
    const offset = Math.abs(dx);
    // Virar para baixo (raio RADIUS) desloca o carro `RADIUS * (1 + sen h)` na horizontal:
    // começa a descer quando esse deslocamento leva exatamente à linha da vaga.
    const towardLine = Math.sign(Math.cos(h)) === Math.sign(dx) || Math.abs(Math.cos(h)) < 0.3;
    const ready = towardLine && offset <= RADIUS * (1 + Math.sin(h)) + ALIGNED;
    const lookahead = Math.max(MIN_LOOKAHEAD, LOOKAHEAD_PER_OFFSET * offset);
    // Antes de estar pronto, não desce além do portão: primeiro se alinha, depois desce.
    // Se escorregou para baixo do portão, sobe de novo em arco antes de descer alinhado.
    const carrot = { x: slot.x, z: Math.min(ready ? slot.z : gate, z + lookahead) };
    const bearing = Math.atan2(-(carrot.z - z), carrot.x - x);
    h += Math.max(-STEP / RADIUS, Math.min(STEP / RADIUS, wrapAngle(bearing - h)));
    x += Math.cos(h) * STEP;
    z -= Math.sin(h) * STEP;
    out.push({ x, z, heading: h });
  }
  // Pouso: os últimos pontos até a vaga, girando para a direção de estacionado.
  const arrival = h;
  const turn = wrapAngle(PARKED_HEADING - arrival);
  for (let i = 1; i <= LANDING_SAMPLES; i++) {
    const t = i / LANDING_SAMPLES;
    out.push({
      x: x + (slot.x - x) * t,
      z: z + (slot.z - z) * t,
      heading: i === LANDING_SAMPLES ? PARKED_HEADING : arrival + turn * t,
    });
  }
  return out;
}

const wrapAngle = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

const pathLength = (path: readonly PathPoint[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PathPoint;
    const b = path[i] as PathPoint;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
};

/**
 * Plano da jogada `move` aplicada a `before`. Aplicada: decolar ao longo da seta, voar em arco
 * até a vaga (entrando de cima, de frente para a fila), embarcar e partir. Recusada: bater e
 * voltar (caminho bloqueado: vai até o contato de verdade) ou balançar (sem vaga); vazio se o
 * veículo não existe.
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
      const { width, height } = before.level.board;
      const milli = contactDistance(
        before.level,
        move.vehicle,
        result.blockedBy,
        before.onBoard,
        width + height,
      );
      const forward = milli / UNIT;
      const forwardDuration = Math.max(MIN_BUMP_FORWARD, forward / BUMP_SPEED);
      const back = Math.max(MIN_BUMP_BACK, forward / (BUMP_SPEED * BUMP_RETURN_FACTOR));
      return finish([
        {
          kind: 'bump',
          vehicle: move.vehicle,
          forward,
          forwardDuration,
          blockers: [...result.blockedBy],
          duration: forwardDuration + back,
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
  const lead = Math.min(TAKEOFF, distanceToExit(layout, start, dir, half + EXIT_MARGIN));
  const takeoff: WorldPoint = { x: start.x + dir.x * lead, z: start.z + dir.z * lead };
  const slot = layout.slotCenter(result.slot);
  // Voa em um arco só: decola ao longo da seta e entra na vaga por cima, descendo.
  const path: PathPoint[] = [
    { x: start.x, z: start.z, heading },
    { x: takeoff.x, z: takeoff.z, heading },
    ...fly(takeoff, heading, slot),
  ];
  const driveDuration = Math.min(
    MAX_FLIGHT_DURATION,
    Math.max(MIN_FLIGHT_DURATION, pathLength(path) / FLIGHT_SPEED),
  );
  const steps: Step[] = [
    {
      kind: 'drive',
      vehicle: move.vehicle,
      slot: result.slot,
      path,
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
        { x: from.x, z: from.z, heading: PARKED_HEADING },
        { x: offX, z: from.z, heading: 0 },
      ],
      duration: DEPART_DURATION,
      delay: boardEnd.get(`${d.slot}:${d.vehicle}`) ?? driveDuration,
    });
  }
  return finish(steps);
}
