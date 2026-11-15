import { PALETTE } from '@recreio/core/puzzle';
import { describe, expect, it } from 'vitest';
import { levelConfig } from './config';

describe('levelConfig', () => {
  it('fase 1: poucos carros, ângulos retos, sem teto de dificuldade', () => {
    const c = levelConfig(1);
    expect(c).toMatchObject({
      level: 1,
      vehicles: 4,
      colors: 2,
      mix: { car: 1, van: 0, bus: 0 },
      angleStep: 90,
      peakTarget: 2,
      winRateCap: 1,
      board: { width: 6000, height: 8600 },
    });
    expect(c.blockBias).toBeCloseTo(0.41);
  });

  it('fase 30: meio da curva', () => {
    const c = levelConfig(30);
    expect(c).toMatchObject({
      vehicles: 16,
      colors: 7,
      mix: { car: 0.5, van: 0.3, bus: 0.2 },
      angleStep: 15,
      peakTarget: 4,
      winRateCap: 0.35,
      board: { width: 6000, height: 10400 },
    });
    expect(c.blockBias).toBeCloseTo(0.7);
  });

  it('fase 200: teto da curva', () => {
    expect(levelConfig(200)).toMatchObject({
      vehicles: 20,
      colors: PALETTE.length,
      angleStep: 1,
      peakTarget: 4,
      blockBias: 1,
      winRateCap: 0.15,
    });
  });

  it('a curva é coerente em todas as fases de 1 a 200', () => {
    let previous = 0;
    for (let l = 1; l <= 200; l++) {
      const c = levelConfig(l);
      expect(c.vehicles).toBeGreaterThanOrEqual(previous);
      previous = c.vehicles;
      expect(c.colors).toBeLessThanOrEqual(c.vehicles);
      expect(c.colors).toBeLessThanOrEqual(PALETTE.length);
      expect(c.mix.car + c.mix.van + c.mix.bus).toBeCloseTo(1);
      expect(c.peakTarget).toBeGreaterThanOrEqual(2);
      expect(c.peakTarget).toBeLessThanOrEqual(4);
    }
  });

  it('fase inválida lança RangeError', () => {
    expect(() => levelConfig(0)).toThrow(RangeError);
    expect(() => levelConfig(1.5)).toThrow(RangeError);
    expect(() => levelConfig(-3)).toThrow(RangeError);
  });
});
