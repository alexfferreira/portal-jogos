/** Helpers só para testes (não é exportado em `index.ts`). */
import { createLevel, type LevelInput, type VehicleInput } from './level';
import type { Level, VehicleKind } from './types';

const rep = (color: number, n: number): number[] => Array<number>(n).fill(color);

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

/**
 * Fase de ponta a ponta usada em vários testes: 2 carros, 2 vans e 2 ônibus, ângulos livres e
 * dois bloqueios. Ordem vencedora `[1,0,3,2,4,5]`; ordem que trava `[4,5,3,2]`.
 */
export function scenarioLevel(): Level {
  return createLevel({
    board: { width: 10000, height: 10000 },
    vehicles: [
      { kind: 'car', color: 0, cx: 1500, cy: 1500, angle: 0 },
      { kind: 'car', color: 0, cx: 6000, cy: 1500, angle: 0 },
      { kind: 'van', color: 1, cx: 2000, cy: 4000, angle: 90 },
      { kind: 'van', color: 1, cx: 2000, cy: 7000, angle: 90 },
      { kind: 'bus', color: 2, cx: 7000, cy: 5000, angle: 135 },
      { kind: 'bus', color: 2, cx: 8500, cy: 8500, angle: 30 },
    ],
    queue: [...rep(0, 8), ...rep(1, 12), ...rep(2, 20)],
  });
}
