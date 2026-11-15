import { describe, expect, it } from 'vitest';
import { rectsOverlap, sweepRect, type Rect } from './geometry';

const r = (cx: number, cy: number, hl: number, hw: number, angle: number): Rect => ({
  cx,
  cy,
  hl,
  hw,
  angle,
});

/** Pares usados também no teste de simetria. */
const pairs: [string, Rect, Rect, boolean][] = [
  ['alinhados e separados', r(0, 0, 600, 300, 0), r(2000, 0, 600, 300, 0), false],
  [
    'encostados pela frente (bordas em x=600)',
    r(0, 0, 600, 300, 0),
    r(1200, 0, 600, 300, 0),
    false,
  ],
  ['1 milésimo de sobreposição', r(0, 0, 600, 300, 0), r(1199, 0, 600, 300, 0), true],
  ['encostados na lateral', r(0, 0, 600, 300, 0), r(0, 600, 600, 300, 0), false],
  ['girado 90° sobrepõe', r(0, 0, 600, 300, 90), r(0, 800, 600, 300, 0), true],
  ['girado 90° separado', r(0, 0, 600, 300, 90), r(0, 1200, 600, 300, 0), false],
  ['45° paralelos distantes', r(0, 0, 600, 300, 45), r(900, 900, 600, 300, 45), false],
  ['45° sobre um alinhado', r(0, 0, 600, 300, 45), r(300, 300, 600, 300, 0), true],
];

describe('rectsOverlap', () => {
  for (const [name, a, b, expected] of pairs) {
    it(`${name} → ${expected}`, () => {
      expect(rectsOverlap(a, b)).toBe(expected);
    });
    it(`${name}: é simétrico`, () => {
      expect(rectsOverlap(b, a)).toBe(expected);
    });
  }
});

describe('sweepRect', () => {
  it('varre para +x com ângulo 0', () => {
    expect(sweepRect(r(1000, 1000, 600, 300, 0), 4000)).toEqual(r(3000, 1000, 2600, 300, 0));
  });

  it('varre para +y com ângulo 90', () => {
    expect(sweepRect(r(1000, 1000, 600, 300, 90), 4000)).toEqual(r(1000, 3000, 2600, 300, 90));
  });

  it('bloqueia à frente, não atrás e não na faixa vizinha com folga', () => {
    const swept = sweepRect(r(1000, 1000, 600, 300, 0), 10000);
    expect(rectsOverlap(swept, r(5000, 1000, 600, 300, 0))).toBe(true);
    expect(rectsOverlap(swept, r(-2000, 1000, 600, 300, 0))).toBe(false);
    expect(rectsOverlap(swept, r(5000, 1700, 600, 300, 0))).toBe(false);
  });
});
