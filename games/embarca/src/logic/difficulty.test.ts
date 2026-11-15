import { describe, expect, it } from 'vitest';
import { playOrder, randomPlayoutWinRate } from './difficulty';
import { level, scenarioLevel, veh } from './testkit';

describe('playOrder', () => {
  it('ordem vencedora: vence, sem recusas, e cada veículo parte na hora (pico 1)', () => {
    expect(playOrder(scenarioLevel(), [1, 0, 3, 2, 4, 5])).toEqual({
      won: true,
      stuck: false,
      applied: 6,
      peakParked: 1,
    });
  });

  it('ordem que trava: sem saída com as 4 vagas ocupadas (pico 4)', () => {
    expect(playOrder(scenarioLevel(), [4, 5, 3, 2])).toEqual({
      won: false,
      stuck: true,
      applied: 4,
      peakParked: 4,
    });
  });

  it('para na primeira recusa', () => {
    expect(playOrder(scenarioLevel(), [0, 1])).toEqual({
      won: false,
      stuck: false,
      applied: 0,
      peakParked: 0,
    });
  });
});

describe('randomPlayoutWinRate', () => {
  it('na fase do cenário nem todas as partidas vencem nem todas perdem', () => {
    const rate = randomPlayoutWinRate(scenarioLevel(), 1, 200);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });

  it('é determinístico e depende da semente', () => {
    const l = scenarioLevel();
    expect(randomPlayoutWinRate(l, 1, 200)).toBe(randomPlayoutWinRate(l, 1, 200));
    const rates = [1, 2, 3, 4, 5].map((seed) => randomPlayoutWinRate(l, seed, 200));
    expect(new Set(rates).size).toBeGreaterThan(1);
  });

  it('um carro sozinho sempre vence', () => {
    const l = level([veh('car', 0, 1000, 1000, 0)], [0, 0, 0, 0]);
    expect(randomPlayoutWinRate(l, 1, 50)).toBe(1);
  });
});
