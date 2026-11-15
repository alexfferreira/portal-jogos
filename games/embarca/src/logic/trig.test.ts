import { describe, expect, it } from 'vitest';
import { cos, normalizeAngle, sin, TRIG_SCALE } from './trig';

describe('sin/cos inteiros', () => {
  it('escala é 10000', () => {
    expect(TRIG_SCALE).toBe(10000);
  });

  it('valores exatos dos ângulos notáveis do seno', () => {
    expect(sin(0)).toBe(0);
    expect(sin(30)).toBe(5000);
    expect(sin(45)).toBe(7071);
    expect(sin(60)).toBe(8660);
    expect(sin(90)).toBe(10000);
    expect(sin(180)).toBe(0);
    expect(sin(270)).toBe(-10000);
  });

  it('valores exatos dos ângulos notáveis do cosseno', () => {
    expect(cos(0)).toBe(10000);
    expect(cos(60)).toBe(5000);
    expect(cos(90)).toBe(0);
    expect(cos(180)).toBe(-10000);
    expect(cos(270)).toBe(0);
  });

  it('o vetor (cos, sin) tem comprimento ~1 em todos os 360 graus', () => {
    for (let d = 0; d < 360; d++) {
      expect(Math.abs(sin(d) ** 2 + cos(d) ** 2 - 1e8)).toBeLessThanOrEqual(20000);
    }
  });

  it('devolve só inteiros', () => {
    for (let d = 0; d < 360; d++) {
      expect(Number.isInteger(sin(d))).toBe(true);
      expect(Number.isInteger(cos(d))).toBe(true);
    }
  });

  it('normaliza ângulos negativos e acima de 360 internamente', () => {
    expect(sin(-90)).toBe(sin(270));
    expect(cos(450)).toBe(cos(90));
  });
});

describe('normalizeAngle', () => {
  it('leva qualquer inteiro para 0..359', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(0)).toBe(0);
  });
});
