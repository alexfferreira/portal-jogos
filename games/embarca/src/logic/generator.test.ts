import { describe, expect, it } from 'vitest';
import { generateLevel, type GeneratedLevel } from './generator';
import { playOrder } from './difficulty';
import { rectsOverlap, type Rect } from './geometry';
import { VEHICLE_SPECS } from './level';
import { CLEARANCE } from './placement';
import { hint } from './solver';
import type { Vehicle } from './types';

const rectOf = (v: Vehicle, inflate = 0): Rect => ({
  cx: v.cx,
  cy: v.cy,
  hl: VEHICLE_SPECS[v.kind].length / 2 + inflate,
  hw: VEHICLE_SPECS[v.kind].width / 2 + inflate,
  angle: v.angle,
});

describe('generateLevel: as 200 fases', () => {
  it('todas são válidas, vencíveis, com dica e dentro da curva', () => {
    const variations: number[] = [];
    const levels: GeneratedLevel[] = [];
    for (let n = 1; n <= 200; n++) {
      const g = generateLevel(n);
      levels.push(g);
      variations.push(g.variation);
      const { level } = g.state;
      const order = g.solution.map((m) => m.vehicle);

      expect(level.vehicles, `fase ${n}`).toHaveLength(g.config.vehicles);
      expect(g.solution, `fase ${n}`).toHaveLength(g.config.vehicles);
      expect(playOrder(level, order), `fase ${n}`).toMatchObject({
        won: true,
        applied: g.config.vehicles,
      });
      const h = hint(g.state);
      expect(h.status, `fase ${n}: dica`).toBe('solved');
      expect(h.move, `fase ${n}: dica`).not.toBeNull();
      expect(g.winRate, `fase ${n}`).toBeLessThanOrEqual(g.config.winRateCap);
      expect(g.solverNodes, `fase ${n}`).toBeGreaterThan(0);
      expect(g.peakParked, `fase ${n}`).toBeLessThanOrEqual(g.config.peakTarget);
      expect(g.peakParked, `fase ${n}`).toBeGreaterThanOrEqual(1);
      for (const a of level.vehicles) {
        for (const b of level.vehicles) {
          if (a.id !== b.id) {
            expect(rectsTooClose(a, b), `fase ${n}: ${a.id} e ${b.id}`).toBe(false);
          }
        }
      }
    }
    const quick = variations.filter((v) => v < 8).length;
    expect(quick / variations.length).toBeGreaterThanOrEqual(0.95);

    // Os ids não revelam a ordem de saída (foco 5).
    const unsorted = levels
      .filter((g) => g.config.level >= 10)
      .filter((g) => {
        const order = g.solution.map((m) => m.vehicle);
        return order.some((id, i) => i > 0 && id < (order[i - 1] as number));
      });
    expect(
      unsorted.length / levels.filter((g) => g.config.level >= 10).length,
    ).toBeGreaterThanOrEqual(0.8);
  }, 180_000);
});

function rectsTooClose(a: Vehicle, b: Vehicle): boolean {
  return rectsOverlap(rectOf(a, CLEARANCE), rectOf(b));
}

describe('generateLevel: propriedades', () => {
  it('é determinístico, inclusive depois de JSON (foco 4)', () => {
    const g = generateLevel(7);
    expect(generateLevel(7)).toEqual(g);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('fases diferentes dão fases diferentes', () => {
    expect(generateLevel(7).state.level).not.toEqual(generateLevel(8).state.level);
  });

  it('sem variações lança Error citando a fase e o limite, sem laço infinito', () => {
    expect(() => generateLevel(30, { maxVariations: 0 })).toThrow(Error);
    expect(() => generateLevel(30, { maxVariations: 0 })).toThrow(/30.*0/);
    expect(() => generateLevel(30, { maxVariations: 0 })).not.toThrow(RangeError);
  });

  it('fase inválida lança RangeError', () => {
    expect(() => generateLevel(0)).toThrow(RangeError);
    expect(() => generateLevel(1.5)).toThrow(RangeError);
  });
});
