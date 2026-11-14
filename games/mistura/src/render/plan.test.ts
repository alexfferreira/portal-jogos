import { describe, expect, it } from 'vitest';
import { applyMove, generateLevel, parseState } from '../logic';
import { computeLayout, tubeHeight } from './layout';
import {
  applyPlanToView,
  changedTubes,
  chooseTilt,
  tiltedExtent,
  planPour,
  pourLevels,
  pourPhase,
  viewFromState,
} from './plan';

describe('planPour', () => {
  it('descreve o despejo', () => {
    const before = parseState('0 1 1 | 1 | ', 4);
    const r = applyMove(before, { from: 0, to: 1 });
    if (!r.ok) throw new Error('jogada deveria ser válida');
    const plan = planPour(before, r);
    expect(plan).toMatchObject({ from: 0, to: 1, color: 1, moved: 2, srcCount: 3, dstCount: 1 });
    expect(pourLevels(plan, 0)).toEqual({ src: 3, dst: 1 });
    expect(pourLevels(plan, 1)).toEqual({ src: 1, dst: 3 });
    expect(pourLevels(plan, 0.5)).toEqual({ src: 2, dst: 2 });
  });

  it('reconciliar com o estado lógico equivale a aplicar o plano (soluções de várias fases)', () => {
    for (const level of [1, 2, 30, 45, 100, 260]) {
      const gen = generateLevel(level);
      let state = gen.state;
      let view = viewFromState(state);
      for (const move of gen.solution) {
        const r = applyMove(state, move);
        if (!r.ok) throw new Error('solução inválida');
        view = applyPlanToView(view, planPour(state, r));
        state = r.state;
        expect(view).toEqual(viewFromState(state));
      }
    }
  });

  it('camadas reveladas ficam visíveis e a tampa aponta o tubo completo', () => {
    const before = parseState('0 1? 2 | 2 2 2 | ', 4);
    const r = applyMove(before, { from: 0, to: 1 });
    if (!r.ok) throw new Error('jogada deveria ser válida');
    const plan = planPour(before, r);
    expect(plan.completed).toBe(1);
    expect(plan.revealed).toEqual([{ tube: 0, index: 1, color: 1 }]);
    expect(applyPlanToView(viewFromState(before), plan)[0]?.hidden).toEqual([false, false]);
  });
});

describe('pourPhase', () => {
  it('as fases cobrem 0..1 em ordem', () => {
    expect(pourPhase(0)).toEqual({ approach: 0, flow: 0, back: 0 });
    expect(pourPhase(1)).toEqual({ approach: 1, flow: 1, back: 1 });
    let prev = pourPhase(0);
    for (let i = 1; i <= 100; i++) {
      const p = pourPhase(i / 100);
      expect(p.approach).toBeGreaterThanOrEqual(prev.approach);
      expect(p.flow).toBeGreaterThanOrEqual(prev.flow);
      expect(p.back).toBeGreaterThanOrEqual(prev.back);
      prev = p;
    }
  });
  it('o líquido só escorre depois da aproximação', () => {
    expect(pourPhase(0.2).flow).toBe(0);
    expect(pourPhase(0.5).flow).toBeGreaterThan(0);
    expect(pourPhase(0.5).back).toBe(0);
  });
});

describe('changedTubes', () => {
  it('lista só os tubos que mudaram', () => {
    const a = viewFromState(parseState('0 | 1 | ', 4));
    const b = viewFromState(parseState('0 | 1 1 | ', 4));
    expect(changedTubes(a, b)).toEqual([1]);
    expect(changedTubes(a, [...b, { colors: [], hidden: [] }])).toEqual([1, 3]);
  });
});

describe('chooseTilt', () => {
  const R = 0.5;
  const setup = (count: number, capacity = 4, aspect = 390 / 680) => {
    const layout = computeLayout(count, aspect, capacity);
    const H = tubeHeight(capacity);
    return { layout, H };
  };
  const tiltFor = (count: number, index: number, capacity = 4) => {
    const { layout, H } = setup(count, capacity);
    const pos = layout.tubes[index]!;
    return chooseTilt({ x: pos.x, y: pos.y - H / 2 }, H, R, {
      width: layout.bounds.width,
      height: layout.bounds.height,
    });
  };

  it('destino na coluna da esquerda inclina o corpo para a direita (dir -1)', () => {
    for (const n of [5, 8, 12, 16]) expect(tiltFor(n, 0).dir).toBe(-1);
  });

  it('destino na coluna da direita inclina o corpo para a esquerda (dir 1)', () => {
    for (const n of [5, 8, 12, 16]) {
      const { layout } = setup(n);
      const rightmost = layout.tubes.reduce(
        (best, t, i, all) => (t.x > all[best]!.x ? i : best),
        0,
      );
      expect(tiltFor(n, rightmost).dir).toBe(1);
    }
  });

  it('a escolha cabe nos limites quando 4 ou 5 colunas (centro, bordas e cantos)', () => {
    for (const cols of [4, 5]) {
      const n = cols * 2;
      const { layout, H } = setup(n);
      layout.tubes.forEach((pos, i) => {
        const dst = { x: pos.x, y: pos.y - H / 2 };
        const b = { width: layout.bounds.width, height: layout.bounds.height };
        const c = chooseTilt(dst, H, R, b);
        const ext = tiltedExtent(dst, H, R, c.dir, c.maxTilt);
        expect(ext.maxX, `tubo ${i}`).toBeLessThanOrEqual(b.width / 2 + 0.3);
        expect(ext.minX, `tubo ${i}`).toBeGreaterThanOrEqual(-b.width / 2 - 0.3);
        expect(ext.maxY).toBeLessThanOrEqual(b.height / 2 + 1e-9);
      });
    }
  });

  it('em 3 colunas inclina menos quando precisa, nunca mais que o máximo', () => {
    const wide = tiltFor(10, 2);
    const narrow = tiltFor(5, 1);
    expect(narrow.maxTilt).toBeLessThanOrEqual(wide.maxTilt);
    expect(narrow.maxTilt).toBeGreaterThan(0);
    expect(narrow.maxTilt).toBeLessThanOrEqual((64 * Math.PI) / 180 + 1e-9);
  });

  it('16 tubos: todo destino tem uma escolha com excursão limitada', () => {
    const { layout, H } = setup(16, 5);
    const b = { width: layout.bounds.width, height: layout.bounds.height };
    layout.tubes.forEach((pos) => {
      const c = chooseTilt({ x: pos.x, y: pos.y - H / 2 }, H, R, b);
      expect(Math.abs(c.dir)).toBe(1);
      expect(c.overflow).toBeLessThan(1.2);
    });
  });

  it('empate: escolhe a direção de menor excursão', () => {
    const { layout, H } = setup(5);
    const pos = layout.tubes[1]!;
    const b = { width: layout.bounds.width, height: layout.bounds.height };
    const c = chooseTilt({ x: pos.x, y: pos.y - H / 2 }, H, R, b);
    const other = tiltedExtent({ x: pos.x, y: pos.y - H / 2 }, H, R, -c.dir as 1 | -1, c.maxTilt);
    const mine = tiltedExtent({ x: pos.x, y: pos.y - H / 2 }, H, R, c.dir, c.maxTilt);
    const over = (e: typeof mine) =>
      Math.max(0, e.maxX - b.width / 2, -b.width / 2 - e.minX, e.maxY - b.height / 2);
    expect(over(mine)).toBeLessThanOrEqual(over(other) + 1e-9);
  });
});
