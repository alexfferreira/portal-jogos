import { describe, expect, it } from 'vitest';
import { computeLayout, pickTube, touchSizePx, tubeHeight, type Rect } from './layout';

describe('computeLayout', () => {
  it('posiciona todos os tubos, sem sobreposição, dentro dos limites', () => {
    for (const capacity of [4, 5]) {
      for (let n = 1; n <= 20; n++) {
        const l = computeLayout(n, 390 / 680, capacity);
        expect(l.tubes).toHaveLength(n);
        const keys = new Set(l.tubes.map((t) => `${t.x.toFixed(3)},${t.y.toFixed(3)}`));
        expect(keys.size).toBe(n);
        for (const t of l.tubes) {
          expect(Math.abs(t.x) + 0.5).toBeLessThanOrEqual(l.bounds.width / 2 + 1e-9);
          expect(t.y + tubeHeight(capacity) / 2).toBeLessThanOrEqual(l.bounds.height / 2 + 1e-9);
          expect(t.y - tubeHeight(capacity) / 2).toBeGreaterThanOrEqual(
            -l.bounds.height / 2 - 1e-9,
          );
        }
      }
    }
  });

  it('usa 2 ou mais fileiras em fases grandes e uma só em telas largas e poucos tubos', () => {
    expect(computeLayout(16, 390 / 680, 4).rows).toBeGreaterThanOrEqual(2);
    expect(computeLayout(3, 3, 4).rows).toBe(1);
  });

  it('área de toque >= 44 px em 390x640 até 18 tubos (capacidade 4 e 5)', () => {
    for (const capacity of [4, 5]) {
      for (let n = 3; n <= 18; n++) {
        const l = computeLayout(n, 390 / 640, capacity);
        expect(touchSizePx(l, 390, 640), `${n} tubos, cap ${capacity}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('área de toque >= 44 px em palco pequeno (360x480) com 16 tubos', () => {
    for (const capacity of [4, 5]) {
      const l = computeLayout(16, 360 / 480, capacity);
      expect(touchSizePx(l, 360, 480), `cap ${capacity}`).toBeGreaterThanOrEqual(44);
    }
  });

  it('funciona em outras proporções retrato', () => {
    for (const aspect of [0.4, 0.46, 0.56, 0.75]) {
      const l = computeLayout(17, aspect, 5);
      expect(l.tubes).toHaveLength(17);
      expect(touchSizePx(l, 360, 360 / aspect)).toBeGreaterThanOrEqual(40);
    }
  });

  it('centraliza cada fileira', () => {
    const l = computeLayout(5, 390 / 680, 4);
    const rows = new Map<number, number[]>();
    for (const t of l.tubes) rows.set(t.y, [...(rows.get(t.y) ?? []), t.x]);
    for (const xs of rows.values()) expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
});

describe('pickTube', () => {
  const rects: Rect[] = [
    { x: 50, y: 50, w: 60, h: 100 },
    { x: 110, y: 50, w: 60, h: 100 },
  ];
  it('acha o tubo tocado', () => {
    expect(pickTube(rects, 40, 50)).toBe(0);
    expect(pickTube(rects, 120, 80)).toBe(1);
  });
  it('na sobreposição vence o centro mais próximo', () => {
    expect(pickTube(rects, 75, 50)).toBe(0);
    expect(pickTube(rects, 85, 50)).toBe(1);
  });
  it('fora de todos devolve null', () => {
    expect(pickTube(rects, 300, 50)).toBeNull();
    expect(pickTube(rects, 50, 200)).toBeNull();
  });
});
