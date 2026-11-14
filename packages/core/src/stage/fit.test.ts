import { describe, expect, it } from 'vitest';
import { fitOrthographic, fitPerspective } from './fit';

describe('fitOrthographic', () => {
  it('em tela estreita o limite é a largura', () => {
    const { halfWidth, halfHeight } = fitOrthographic({ width: 10, depth: 4 }, 0.5, 1);
    expect(halfWidth).toBeCloseTo(5);
    expect(halfHeight).toBeCloseTo(10);
  });

  it('em tela larga o limite é a profundidade', () => {
    const { halfWidth, halfHeight } = fitOrthographic({ width: 4, depth: 10 }, 2, 1);
    expect(halfHeight).toBeCloseTo(5);
    expect(halfWidth).toBeCloseTo(10);
  });

  it('o conteúdo sempre cabe, com a margem', () => {
    for (const aspect of [0.4, 0.46, 0.5, 0.75, 1, 1.6]) {
      const b = { width: 7, depth: 9 };
      const { halfWidth, halfHeight } = fitOrthographic(b, aspect, 1.1);
      expect(halfWidth * 2).toBeGreaterThanOrEqual(b.width * 1.1 - 1e-9);
      expect(halfHeight * 2).toBeGreaterThanOrEqual(b.depth * 1.1 - 1e-9);
      expect(halfWidth / halfHeight).toBeCloseTo(aspect);
    }
  });
});

describe('fitPerspective', () => {
  it('afasta mais a câmera para conteúdos maiores', () => {
    const a = fitPerspective({ width: 6, depth: 6 }, 0.5, 50, 60);
    const b = fitPerspective({ width: 12, depth: 12 }, 0.5, 50, 60);
    expect(b).toBeCloseTo(a * 2);
  });

  it('telas mais estreitas exigem mais distância pela largura', () => {
    const wide = fitPerspective({ width: 10, depth: 2 }, 1, 50, 60);
    const narrow = fitPerspective({ width: 10, depth: 2 }, 0.5, 50, 60);
    expect(narrow).toBeGreaterThan(wide);
  });
});
