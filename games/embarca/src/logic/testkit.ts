/** Helpers só para testes (não é exportado em `index.ts`). */
import { createLevel, type LevelInput, type VehicleInput } from './level';
import type { Level, VehicleKind } from './types';

export function veh(
  kind: VehicleKind,
  color: number,
  cx: number,
  cy: number,
  angle: number,
  hidden?: boolean,
): VehicleInput {
  return { kind, color, cx, cy, angle, ...(hidden === undefined ? {} : { hidden }) };
}

/** Fase em um tabuleiro 10000×10000 (ou outro, via `extra.board`). */
export function level(
  vehicles: VehicleInput[],
  queue: number[],
  extra: Partial<LevelInput> = {},
): Level {
  return createLevel({ board: { width: 10000, height: 10000 }, ...extra, vehicles, queue });
}
