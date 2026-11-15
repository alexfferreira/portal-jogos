import { createRng } from '@recreio/core/puzzle';
import { describe, expect, it } from 'vitest';
import { levelConfig, type LevelConfig } from './config';
import { rectsOverlap, type Rect } from './geometry';
import { buildGeometry, VEHICLE_SPECS } from './level';
import { CLEARANCE, placeVehicles, type PlacedVehicle } from './placement';
import { cos, sin, TRIG_SCALE } from './trig';

const LEVELS = [1, 10, 30, 100];
const SEEDS = [1, 2, 3, 4, 5];

const rectOf = (v: PlacedVehicle, inflate = 0): Rect => ({
  cx: v.cx,
  cy: v.cy,
  hl: VEHICLE_SPECS[v.kind].length / 2 + inflate,
  hw: VEHICLE_SPECS[v.kind].width / 2 + inflate,
  angle: v.angle,
});

function corners(v: PlacedVehicle): [number, number][] {
  const r = rectOf(v);
  const ux = cos(v.angle) / TRIG_SCALE;
  const uy = sin(v.angle) / TRIG_SCALE;
  const out: [number, number][] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      out.push([r.cx + a * r.hl * ux - b * r.hw * uy, r.cy + a * r.hl * uy + b * r.hw * ux]);
    }
  }
  return out;
}

function place(config: LevelConfig, seed: number): PlacedVehicle[] {
  const placed = placeVehicles(config, createRng(seed));
  if (placed === null) throw new Error(`nível ${config.level}, semente ${seed}: não coube`);
  return placed;
}

describe('placeVehicles', () => {
  for (const n of LEVELS) {
    const config = levelConfig(n);
    describe(`fase ${n}`, () => {
      it('coloca todos os veículos, dos tipos e ângulos da curva', () => {
        for (const seed of SEEDS) {
          const placed = place(config, seed);
          expect(placed).toHaveLength(config.vehicles);
          for (const v of placed) {
            expect(config.mix[v.kind]).toBeGreaterThan(0);
            expect(v.angle % config.angleStep).toBe(0);
          }
        }
      });

      it('mantém tudo dentro do tabuleiro, com margem', () => {
        for (const seed of SEEDS) {
          for (const v of place(config, seed)) {
            for (const [x, y] of corners(v)) {
              expect(x).toBeGreaterThanOrEqual(CLEARANCE);
              expect(x).toBeLessThanOrEqual(config.board.width - CLEARANCE);
              expect(y).toBeGreaterThanOrEqual(CLEARANCE);
              expect(y).toBeLessThanOrEqual(config.board.height - CLEARANCE);
            }
          }
        }
      });

      it('mantém a folga mínima entre todos os pares', () => {
        for (const seed of SEEDS) {
          const placed = place(config, seed);
          placed.forEach((a, i) =>
            placed.forEach((b, j) => {
              if (i !== j) expect(rectsOverlap(rectOf(a, CLEARANCE), rectOf(b))).toBe(false);
            }),
          );
        }
      });

      it('a ordem plantada é jogável: quem bloqueia o veículo i sai antes dele', () => {
        for (const seed of SEEDS) {
          const placed = place(config, seed);
          const g = buildGeometry({
            board: config.board,
            vehicles: placed.map((v) => ({ ...v, color: 0 })),
          });
          g.blockers.forEach((blockers, i) => {
            expect(
              blockers.every((j) => j < i),
              `fase ${n}, semente ${seed}, veículo ${i}`,
            ).toBe(true);
          });
          expect(g.obstructed.every((o) => !o)).toBe(true);
        }
      });

      it('é determinístico', () => {
        expect(place(config, 3)).toEqual(place(config, 3));
      });
    });
  }

  it('o viés de bloqueio aumenta os bloqueios entre veículos', () => {
    const total = (blockBias: number): number => {
      let sum = 0;
      for (const seed of SEEDS) {
        const config = { ...levelConfig(30), blockBias };
        const placed = place(config, seed);
        const g = buildGeometry({
          board: config.board,
          vehicles: placed.map((v) => ({ ...v, color: 0 })),
        });
        sum += g.blockers.reduce((acc, b) => acc + b.length, 0);
      }
      return sum;
    };
    expect(total(1)).toBeGreaterThan(total(0));
  });

  it('geometria impossível devolve null, sem demorar', () => {
    const config = { ...levelConfig(30), board: { width: 1500, height: 1500 } };
    expect(placeVehicles(config, createRng(1))).toBeNull();
  });
});
