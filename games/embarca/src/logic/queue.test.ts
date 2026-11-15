import { createRng } from '@recreio/core/puzzle';
import { describe, expect, it } from 'vitest';
import { levelConfig, type LevelConfig } from './config';
import { playOrder } from './difficulty';
import { createLevel, VEHICLE_SPECS } from './level';
import { placeVehicles, type PlacedVehicle } from './placement';
import { buildColorsAndQueue, type ColorPlan } from './queue';

const LEVELS = [1, 10, 30, 100];
const SEEDS = [1, 2, 3, 4, 5];

function plan(config: LevelConfig, placed: PlacedVehicle[], seed: number): ColorPlan {
  const p = buildColorsAndQueue(placed, config, createRng(seed + 100));
  if (p === null) throw new Error(`nível ${config.level}, semente ${seed}: sem plano`);
  return p;
}

function levelFor(config: LevelConfig, placed: PlacedVehicle[], p: ColorPlan) {
  return createLevel({
    board: config.board,
    vehicles: placed.map((v, i) => ({ ...v, color: p.colors[i] as number })),
    queue: p.queue,
  });
}

describe('buildColorsAndQueue', () => {
  for (const n of LEVELS) {
    const config = levelConfig(n);
    describe(`fase ${n}`, () => {
      for (const seed of SEEDS) {
        it(`semente ${seed}: a ordem plantada vence no motor real, dentro do pico`, () => {
          const placed = placeVehicles(config, createRng(seed)) as PlacedVehicle[];
          expect(placed).not.toBeNull();
          const p = plan(config, placed, seed);
          const level = levelFor(config, placed, p); // createLevel valida assentos × passageiros
          const order = placed.map((_, i) => i);
          const outcome = playOrder(level, order);
          expect(outcome).toMatchObject({ won: true, applied: config.vehicles });
          expect(p.peakParked).toBeLessThanOrEqual(config.peakTarget);
          if (config.vehicles >= config.peakTarget) expect(p.peakParked).toBe(config.peakTarget);
          // O pico real pode ser menor que o simulado: na fila completa, passageiros liberados
          // depois embarcam assim que já há um estacionado da cor deles.
          expect(outcome.peakParked).toBeLessThanOrEqual(p.peakParked);
          expect(outcome.peakParked).toBeGreaterThanOrEqual(1);
          const seats = placed.reduce((acc, v) => acc + VEHICLE_SPECS[v.kind].seats, 0);
          expect(p.queue).toHaveLength(seats);
          if (config.vehicles >= config.colors) {
            expect(new Set(p.colors).size).toBe(config.colors);
          }
        });
      }

      it('é determinístico', () => {
        const placed = placeVehicles(config, createRng(3)) as PlacedVehicle[];
        expect(plan(config, placed, 3)).toEqual(plan(config, placed, 3));
      });
    });
  }

  it('dois da mesma cor estacionados ao mesmo tempo: o plano ainda vence e respeita o pico', () => {
    // 3 carros e 2 cores: duas cores iguais são inevitáveis.
    const config: LevelConfig = {
      ...levelConfig(1),
      vehicles: 3,
      colors: 2,
      peakTarget: 3,
      board: { width: 6000, height: 8600 },
    };
    const placed: PlacedVehicle[] = [0, 1, 2].map((i) => ({
      kind: 'car',
      cx: 1000,
      cy: 1000 + 1500 * i,
      angle: 0,
    }));
    for (let seed = 1; seed <= 10; seed++) {
      const p = plan(config, placed, seed);
      const level = levelFor(config, placed, p);
      expect(playOrder(level, [0, 1, 2])).toMatchObject({ won: true, applied: 3 });
      expect(p.peakParked).toBeLessThanOrEqual(3);
    }
  });
});
