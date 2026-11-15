/**
 * Layout do mundo e picking por toque. Funções PURAS (sem Three, sem DOM): decidem onde cada
 * coisa fica no mundo e qual veículo um toque em pixels escolheu.
 *
 * Mundo: 1 unidade = 1000 milésimos da lógica. A câmera `ortho-top` do `core` olha de cima com
 * `up = −Z`, então o `y` da lógica (que sobe) vira `−Z`: `Z = cz − (y − H/2)/1000`.
 * De cima para baixo na tela: tabuleiro, vagas, fila de passageiros; tudo centrado em (0, 0).
 */
import {
  cos,
  rectsOverlap,
  sin,
  TRIG_SCALE,
  VEHICLE_SPECS,
  type Level,
  type Rect,
  type Vehicle,
} from '../logic';

/** Milésimos da lógica por unidade do mundo. */
export const UNIT = 1000;
/** Altura da linha de vagas (cabe um ônibus de 2,4 de comprimento em pé). */
export const SLOT_HEIGHT = 2.6;
/** Distância entre passageiros da fila. */
export const QUEUE_SPACING = 0.26;
/** Raio (px) em volta do toque em que um veículo ainda conta como tocado (alvo de 44 px). */
export const PICK_RADIUS_PX = 22;

const BOARD_SLOT_GAP = 0.5;
const SLOT_QUEUE_GAP = 0.4;
const SIDE_MARGIN = 0.3;
const QUEUE_SIDE_PAD = 0.2;
const QUEUE_PAD = 0.15;

export interface WorldPoint {
  x: number;
  z: number;
}

export interface Layout {
  /** Largura e profundidade do conteúdo (para `stage.setBounds`). */
  width: number;
  depth: number;
  board: { cx: number; cz: number; width: number; depth: number };
  slots: { x: number; z: number; width: number }[];
  queue: { x0: number; z0: number; cols: number; rows: number; count: number };
  toWorld(x: number, y: number): WorldPoint;
  slotCenter(index: number): WorldPoint;
  queuePoint(index: number): WorldPoint;
}

export function computeLayout(level: Level, slotCount: number = level.slotCount): Layout {
  const bw = level.board.width;
  const bh = level.board.height;
  const W = bw / UNIT;
  const H = bh / UNIT;

  const count = level.queue.length;
  const cols = Math.max(1, Math.floor((W - 2 * QUEUE_SIDE_PAD) / QUEUE_SPACING));
  const rows = Math.max(1, Math.ceil(count / cols));
  const queueHeight = rows * QUEUE_SPACING + 2 * QUEUE_PAD;

  const depth = H + BOARD_SLOT_GAP + SLOT_HEIGHT + SLOT_QUEUE_GAP + queueHeight;
  const top = -depth / 2;
  const boardCz = top + H / 2;
  const slotCz = top + H + BOARD_SLOT_GAP + SLOT_HEIGHT / 2;
  const queueTop = top + H + BOARD_SLOT_GAP + SLOT_HEIGHT + SLOT_QUEUE_GAP;

  const cellWidth = W / slotCount;
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    x: -W / 2 + (i + 0.5) * cellWidth,
    z: slotCz,
    width: cellWidth,
  }));

  const queue = {
    x0: -W / 2 + QUEUE_SIDE_PAD + QUEUE_SPACING / 2,
    z0: queueTop + QUEUE_PAD + QUEUE_SPACING / 2,
    cols,
    rows,
    count,
  };

  return {
    width: W + 2 * SIDE_MARGIN,
    depth,
    board: { cx: 0, cz: boardCz, width: W, depth: H },
    slots,
    queue,
    toWorld: (x, y) => ({ x: (x - bw / 2) / UNIT, z: boardCz - (y - bh / 2) / UNIT }),
    slotCenter: (index) => {
      const s = slots[index];
      if (s === undefined) throw new RangeError(`vaga ${index} não existe`);
      return { x: s.x, z: s.z };
    },
    queuePoint: (index) => ({
      x: queue.x0 + (index % cols) * QUEUE_SPACING,
      z: queue.z0 + Math.floor(index / cols) * QUEUE_SPACING,
    }),
  };
}

export interface PickView {
  /** Tamanho do canvas em px. */
  width: number;
  height: number;
  /** Meio-frustum da câmera em unidades do mundo. */
  halfWidth: number;
  halfHeight: number;
}

/**
 * Distância (unidades do mundo) do ponto do tabuleiro (x, y em milésimos) ao retângulo do
 * veículo, e a distância dele ao centro; 0 se o ponto está dentro.
 */
function distanceToVehicle(v: Vehicle, x: number, y: number): { rect: number; center: number } {
  const spec = VEHICLE_SPECS[v.kind];
  const dx = x - v.cx;
  const dy = y - v.cy;
  const u = (dx * cos(v.angle) + dy * sin(v.angle)) / TRIG_SCALE;
  const w = (-dx * sin(v.angle) + dy * cos(v.angle)) / TRIG_SCALE;
  const du = Math.max(Math.abs(u) - spec.length / 2, 0);
  const dw = Math.max(Math.abs(w) - spec.width / 2, 0);
  return { rect: Math.hypot(du, dw) / UNIT, center: Math.hypot(dx, dy) / UNIT };
}

/**
 * Qual veículo um toque em (px, py) escolhe. Dentro do retângulo de um veículo no tabuleiro
 * vale ele; fora de todos, vale o de retângulo mais próximo do toque, a até `PICK_RADIUS_PX`;
 * empate, o de centro mais próximo e depois o mais embaixo na tela. `null` se nenhum.
 */
export function pickVehicle(
  level: Level,
  onBoard: readonly number[],
  layout: Layout,
  view: PickView,
  px: number,
  py: number,
): number | null {
  // Pixel → mundo (a câmera olha o centro do conteúdo; tela para baixo = +Z).
  const worldX = (px / view.width - 0.5) * 2 * view.halfWidth;
  const worldZ = (py / view.height - 0.5) * 2 * view.halfHeight;
  // Mundo → tabuleiro (milésimos).
  const x = worldX * UNIT + level.board.width / 2;
  const y = level.board.height / 2 - (worldZ - layout.board.cz) * UNIT;
  const pxPerUnit = view.width / (2 * view.halfWidth);

  // Fora de todos: vale quem está mais perto do dedo (distância ao retângulo); só no empate,
  // o de centro mais próximo e depois o mais embaixo na tela.
  let best: { id: number; rect: number; center: number; z: number } | null = null;
  const EPS = 1e-9;
  for (const id of onBoard) {
    const v = level.vehicles[id];
    if (v === undefined) continue;
    const d = distanceToVehicle(v, x, y);
    if (d.rect * pxPerUnit > PICK_RADIUS_PX) continue;
    if (d.rect === 0) return id;
    const z = layout.toWorld(v.cx, v.cy).z;
    const better =
      best === null ||
      d.rect < best.rect - EPS ||
      (Math.abs(d.rect - best.rect) <= EPS &&
        (d.center < best.center - EPS || (Math.abs(d.center - best.center) <= EPS && z > best.z)));
    if (better) best = { id, rect: d.rect, center: d.center, z };
  }
  return best === null ? null : best.id;
}

/**
 * Maior deslocamento inteiro (milésimos, 0..`maxTravel`) ao longo da seta antes de o
 * retângulo do veículo tocar um bloqueador ainda no tabuleiro ou um obstáculo.
 */
export function contactDistance(
  level: Level,
  vehicleId: number,
  blockers: readonly number[],
  onBoard: readonly number[],
  maxTravel: number,
): number {
  const v = level.vehicles[vehicleId];
  if (v === undefined) return 0;
  const spec = VEHICLE_SPECS[v.kind];
  const base: Rect = {
    cx: v.cx,
    cy: v.cy,
    hl: spec.length / 2,
    hw: spec.width / 2,
    angle: v.angle,
  };
  const others: Rect[] = [];
  for (const id of blockers) {
    const b = level.vehicles[id];
    if (b === undefined || !onBoard.includes(id)) continue;
    const s = VEHICLE_SPECS[b.kind];
    others.push({ cx: b.cx, cy: b.cy, hl: s.length / 2, hw: s.width / 2, angle: b.angle });
  }
  for (const o of level.obstacles) {
    others.push({ cx: o.cx, cy: o.cy, hl: o.w / 2, hw: o.h / 2, angle: o.angle });
  }
  const overlapsAt = (d: number): boolean => {
    const moved: Rect = {
      ...base,
      cx: base.cx + Math.round((d * cos(v.angle)) / TRIG_SCALE),
      cy: base.cy + Math.round((d * sin(v.angle)) / TRIG_SCALE),
    };
    return others.some((r) => rectsOverlap(moved, r));
  };
  // Varre em passos curtos (menores que qualquer veículo) até o primeiro contato: depois de
  // atravessar um bloqueador a sobreposição some, então não dá para bissectar direto.
  if (overlapsAt(0)) return 0;
  const STEP = 100;
  let lo = 0;
  let hi = -1;
  for (let d = STEP; d < maxTravel + STEP; d += STEP) {
    const at = Math.min(d, maxTravel);
    if (overlapsAt(at)) {
      hi = at;
      break;
    }
    lo = at;
    if (at === maxTravel) break;
  }
  if (hi === -1) return maxTravel;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (overlapsAt(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}
