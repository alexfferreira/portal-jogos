import type { Rng } from '@recreio/core/puzzle';
import type { LevelConfig } from './config';
import { rectsOverlap, type Rect } from './geometry';
import { sweepFor, VEHICLE_SPECS } from './level';
import { cos, sin, TRIG_SCALE } from './trig';
import type { VehicleKind } from './types';

/** Folga mínima entre veículos e da borda do tabuleiro (milésimos). A lógica exige >= 5. */
export const CLEARANCE = 40;

/** Quantos candidatos válidos comparar antes de escolher (quando há viés de bloqueio). */
const CANDIDATES = 24;

export interface PlacedVehicle {
  kind: VehicleKind;
  cx: number;
  cy: number;
  angle: number;
}

interface Placed {
  rect: Rect;
  /** Retângulo inflado em `CLEARANCE`: a folga é checada nos dois sentidos (nos cantos a
   * inflação não é simétrica). */
  inflated: Rect;
  swept: Rect;
}

function rectOf(kind: VehicleKind, cx: number, cy: number, angle: number, inflate = 0): Rect {
  const spec = VEHICLE_SPECS[kind];
  return { cx, cy, hl: spec.length / 2 + inflate, hw: spec.width / 2 + inflate, angle };
}

/** Sorteia os tipos segundo os pesos de `config.mix` (cumulativo, na ordem car, van, bus). */
function drawKinds(config: LevelConfig, rng: Rng): VehicleKind[] {
  const order: VehicleKind[] = ['car', 'van', 'bus'];
  const usable = order.filter((k) => config.mix[k] > 0);
  const last = usable[usable.length - 1] as VehicleKind;
  return Array.from({ length: config.vehicles }, () => {
    const r = rng.next();
    let acc = 0;
    for (const k of usable) {
      acc += config.mix[k];
      if (r < acc) return k;
    }
    return last;
  });
}

/**
 * Coloca os veículos por construção reversa e devolve-os na **ordem de saída plantada** (o
 * índice `i` sai na posição `i`). Do último para o primeiro, cada candidato precisa: caber no
 * tabuleiro com margem, manter a folga dos já colocados e ter o caminho livre de todos eles
 * (os já colocados saem depois). Veículos colocados depois podem ficar no caminho dos
 * anteriores, e é isso que cria as dependências da fase. Devolve `null` se algum não couber.
 */
/** Reinícios da colocação inteira antes de desistir (cada um sorteia tipos e posições novos). */
const RESTARTS = 8;

export function placeVehicles(
  config: LevelConfig,
  rng: Rng,
  options: { attemptsPerVehicle?: number } = {},
): PlacedVehicle[] | null {
  for (let restart = 0; restart < RESTARTS; restart++) {
    const result = placeOnce(config, rng, options.attemptsPerVehicle ?? 3000);
    if (result !== null) return result;
  }
  return null;
}

function placeOnce(config: LevelConfig, rng: Rng, attempts: number): PlacedVehicle[] | null {
  const { board } = config;
  const kinds = drawKinds(config, rng);
  const result: PlacedVehicle[] = new Array<PlacedVehicle>(kinds.length);
  const placed: Placed[] = [];
  const maxStep = Math.floor(359 / config.angleStep);

  for (let i = kinds.length - 1; i >= 0; i--) {
    const kind = kinds[i] as VehicleKind;
    const spec = VEHICLE_SPECS[kind];
    const valid: {
      vehicle: PlacedVehicle;
      rect: Rect;
      inflated: Rect;
      swept: Rect;
      score: number;
    }[] = [];

    for (let t = 0; t < attempts && valid.length < CANDIDATES; t++) {
      const angle = config.angleStep * rng.int(0, maxStep);
      const c = Math.abs(cos(angle));
      const s = Math.abs(sin(angle));
      const ex = Math.ceil(((spec.length / 2) * c + (spec.width / 2) * s) / TRIG_SCALE);
      const ey = Math.ceil(((spec.length / 2) * s + (spec.width / 2) * c) / TRIG_SCALE);
      const minX = CLEARANCE + ex;
      const maxX = board.width - CLEARANCE - ex;
      const minY = CLEARANCE + ey;
      const maxY = board.height - CLEARANCE - ey;
      if (minX > maxX || minY > maxY) continue;
      const cx = rng.int(minX, maxX);
      const cy = rng.int(minY, maxY);

      const rect = rectOf(kind, cx, cy, angle);
      const inflated = rectOf(kind, cx, cy, angle, CLEARANCE);
      const swept = sweepFor(board, kind, cx, cy, angle);
      if (
        placed.some(
          (p) =>
            rectsOverlap(inflated, p.rect) ||
            rectsOverlap(p.inflated, rect) ||
            rectsOverlap(swept, p.rect),
        )
      ) {
        continue;
      }
      const score = placed.filter((p) => rectsOverlap(p.swept, rect)).length;
      valid.push({ vehicle: { kind, cx, cy, angle }, rect, inflated, swept, score });
    }

    if (valid.length === 0) return null;
    let chosen = valid[0] as (typeof valid)[number];
    if (rng.next() < config.blockBias) {
      for (const v of valid) if (v.score > chosen.score) chosen = v;
    }
    result[i] = chosen.vehicle;
    placed.push({ rect: chosen.rect, inflated: chosen.inflated, swept: chosen.swept });
  }
  return result;
}
