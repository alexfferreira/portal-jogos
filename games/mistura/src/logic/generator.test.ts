import { PALETTE } from '@recreio/core/puzzle';
import { describe, expect, it } from 'vitest';
import { generateLevel, levelConfig, MAX_COLORS, mixSeed } from './generator';
import { applyMove, isComplete, isPure, isWin } from './state';
import type { Move, State } from './types';

function replay(state: State, moves: readonly Move[]): State {
  return moves.reduce((s, m) => {
    const r = applyMove(s, m);
    if (!r.ok) throw new Error(`jogada inválida ${r.reason}`);
    return r.state;
  }, state);
}

describe('levelConfig (curva de dificuldade)', () => {
  it('fases 1-5: 3-4 cores, 2 tubos vazios, capacidade 4, sem ocultas', () => {
    for (let l = 1; l <= 5; l++) {
      const c = levelConfig(l);
      expect(c.colors).toBeGreaterThanOrEqual(3);
      expect(c.colors).toBeLessThanOrEqual(4);
      expect(c).toMatchObject({ emptyTubes: 2, capacity: 4, hidden: false });
    }
  });

  it('até a 30: 5-7 cores; até a 100: 8-10; depois 11-12', () => {
    const inRange = (from: number, to: number, min: number, max: number): boolean => {
      for (let l = from; l <= to; l++) {
        const c = levelConfig(l).colors;
        if (c < min || c > max) return false;
      }
      return true;
    };
    expect(inRange(6, 30, 5, 7)).toBe(true);
    expect(inRange(31, 100, 8, 10)).toBe(true);
    expect(inRange(101, 400, 11, 12)).toBe(true);
  });

  it('nunca excede as cores da paleta', () => {
    expect(MAX_COLORS).toBe(PALETTE.length);
    for (let l = 1; l <= 2000; l += 7)
      expect(levelConfig(l).colors).toBeLessThanOrEqual(PALETTE.length);
  });

  it('camadas ocultas só a partir da fase 40, em parte das fases', () => {
    for (let l = 1; l < 40; l++) expect(levelConfig(l).hidden).toBe(false);
    const flags = Array.from({ length: 200 }, (_, i) => levelConfig(i + 40).hidden);
    expect(flags.some(Boolean)).toBe(true);
    expect(flags.some((f) => !f)).toBe(true);
  });

  it('capacidade 5 só depois da fase 100, ocasionalmente', () => {
    for (let l = 1; l <= 100; l++) expect(levelConfig(l).capacity).toBe(4);
    const caps = Array.from({ length: 200 }, (_, i) => levelConfig(i + 101).capacity);
    expect(caps).toContain(5);
    expect(caps).toContain(4);
  });

  it('é determinístico e rejeita fase inválida', () => {
    expect(levelConfig(77)).toEqual(levelConfig(77));
    expect(() => levelConfig(0)).toThrow(RangeError);
    expect(() => levelConfig(1.5)).toThrow(RangeError);
  });
});

describe('mixSeed', () => {
  it('variação 0 é a própria fase; outras variam', () => {
    expect(mixSeed(10, 0)).toBe(10);
    const seeds = new Set(Array.from({ length: 20 }, (_, k) => mixSeed(10, k)));
    expect(seeds.size).toBe(20);
  });
});

describe('generateLevel', () => {
  it('mesma fase => mesmo resultado; fases diferentes => diferentes', () => {
    const a = generateLevel(12);
    const b = generateLevel(12);
    expect(b).toEqual(a);
    expect(generateLevel(13).state).not.toEqual(a.state);
  });

  it('o estado respeita a configuração (unidades por cor, tubos, vazios)', () => {
    for (const level of [1, 8, 45, 120]) {
      const g = generateLevel(level);
      const { colors, capacity, emptyTubes } = g.config;
      expect(g.state.capacity).toBe(capacity);
      expect(g.state.tubes).toHaveLength(colors + emptyTubes);
      const count = new Map<number, number>();
      for (const t of g.state.tubes) {
        expect(t.length).toBeLessThanOrEqual(capacity);
        for (const u of t) count.set(u.color, (count.get(u.color) ?? 0) + 1);
      }
      expect(count.size).toBe(colors);
      for (const n of count.values()) expect(n).toBe(capacity);
    }
  });

  it('evita estado trivial: sem tubo pré-completo, pronto ou vitorioso', () => {
    for (let level = 1; level <= 200; level++) {
      const { state } = generateLevel(level);
      expect(isWin(state)).toBe(false);
      for (const t of state.tubes) {
        expect(isComplete(t, state.capacity)).toBe(false);
        if (t.length > 1) expect(isPure(t)).toBe(false);
      }
    }
  });

  it('o topo de todo tubo é visível e há ocultas em fases com camadas', () => {
    let found = false;
    for (let level = 40; level <= 120 && !found; level++) {
      const g = generateLevel(level);
      for (const t of g.state.tubes) {
        const top = t[t.length - 1];
        if (top) expect(top.hidden).toBe(false);
        if (t.some((u) => u.hidden)) found = true;
      }
      if (!g.config.hidden) expect(g.state.tubes.flat().some((u) => u.hidden)).toBe(false);
    }
    expect(found).toBe(true);
  });

  it('a solução devolvida resolve a fase e o resultado é serializável', () => {
    const g = generateLevel(50);
    expect(isWin(replay(g.state, g.solution))).toBe(true);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('usa a próxima variação quando o solver não resolve (limite de nós)', () => {
    // Com limite de nós ínfimo nenhuma variação passa: erro explícito.
    expect(() => generateLevel(30, { maxNodes: 2, maxVariations: 3 })).toThrow(/fase 30/);
  });

  it('com orçamento apertado cai em variações seguintes, de forma determinística', () => {
    let found: ReturnType<typeof generateLevel> | null = null;
    for (let level = 1; level <= 200 && !found; level++) {
      try {
        const g = generateLevel(level, { maxNodes: 150, maxVariations: 64 });
        if (g.variation > 0) found = g;
      } catch {
        // nenhuma variação coube no orçamento: tenta a próxima fase
      }
    }
    expect(found).not.toBeNull();
    const again = generateLevel(found!.level, { maxNodes: 150, maxVariations: 64 });
    expect(again).toEqual(found);
    expect(found!.seed).toBe(mixSeed(found!.level, found!.variation));
  });

  it('expõe a variação usada (determinística)', () => {
    const g = generateLevel(7);
    expect(g.variation).toBeGreaterThanOrEqual(0);
    expect(g.seed).toBe(mixSeed(7, g.variation));
  });
});

describe('primeiras 200 fases', () => {
  it('todas resolvíveis sem power-ups, com tempo e nós aceitáveis', () => {
    const times: number[] = [];
    let worst = { level: 0, ms: 0, nodes: 0, variation: 0 };
    let nodesSum = 0;
    let maxVariation = 0;
    const usedVariation: number[] = [];
    let cap5 = 0;
    let hidden101 = 0;
    let hidden40 = 0;
    for (let level = 1; level <= 200; level++) {
      const t0 = performance.now();
      const g = generateLevel(level);
      const ms = performance.now() - t0;
      times.push(ms);
      nodesSum += g.solverNodes;
      maxVariation = Math.max(maxVariation, g.variation);
      if (ms > worst.ms) worst = { level, ms, nodes: g.solverNodes, variation: g.variation };

      // A solução devolvida, reproduzida com as regras reais, vence a fase.
      expect(isWin(replay(g.state, g.solution))).toBe(true);
      if (g.variation > 0) usedVariation.push(level);
      if (level > 100) {
        if (g.state.capacity === 5) cap5++;
        if (g.state.tubes.flat().some((u) => u.hidden)) hidden101++;
      } else if (level >= 40 && g.state.tubes.flat().some((u) => u.hidden)) hidden40++;
    }
    // Nenhuma fase precisou de variação de semente.
    expect(usedVariation).toEqual([]);
    expect(cap5).toBeGreaterThan(0);
    expect(hidden101).toBeGreaterThan(0);
    expect(hidden40).toBeGreaterThan(0);
    expect(hidden40).toBeLessThan(61);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
      `[200 fases] média ${avg.toFixed(1)} ms, pior ${worst.ms.toFixed(1)} ms (fase ${worst.level}, ` +
        `${worst.nodes} nós, variação ${worst.variation}), nós médios ${(nodesSum / 200).toFixed(0)}, ` +
        `maior variação ${maxVariation}`,
    );
    // Teto generoso (máquina de CI lenta); em celular médio a meta é poucos décimos de s.
    expect(worst.ms).toBeLessThan(1500);
    expect(avg).toBeLessThan(300);
  }, 60_000);
});
