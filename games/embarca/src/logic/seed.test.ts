import { describe, expect, it } from 'vitest';
import { mixSeed } from './seed';

describe('mixSeed', () => {
  it('variação 0 devolve o número da fase', () => {
    expect(mixSeed(5, 0)).toBe(5);
  });

  it('variações diferentes dão sementes diferentes', () => {
    expect(mixSeed(5, 1)).not.toBe(mixSeed(5, 0));
    expect(mixSeed(5, 1)).not.toBe(mixSeed(5, 2));
  });

  it('é determinística e fica em 32 bits sem sinal', () => {
    expect(mixSeed(123, 7)).toBe(mixSeed(123, 7));
    for (let l = 1; l <= 50; l++) {
      for (let v = 0; v < 8; v++) {
        const s = mixSeed(l, v);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(2 ** 32);
      }
    }
  });

  it('não há colisões entre fases 1..50 e variações 0..7', () => {
    const seen = new Set<number>();
    for (let l = 1; l <= 50; l++) for (let v = 0; v < 8; v++) seen.add(mixSeed(l, v));
    expect(seen.size).toBe(400);
  });
});
