import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './events';
import { PALETTE, paletteColor } from './palette';
import { createRng } from './rng';
import { easing, Tweens } from './tween';

describe('Emitter', () => {
  it('entrega payloads e permite cancelar a inscrição', () => {
    const e = new Emitter<{ a: number }>();
    const fn = vi.fn();
    const off = e.on('a', fn);
    e.emit('a', 1);
    off();
    e.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('tolera listener que se remove durante a emissão', () => {
    const e = new Emitter<{ a: number }>();
    const second = vi.fn();
    const off = e.on('a', () => off());
    e.on('a', second);
    e.emit('a', 1);
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('createRng', () => {
  it('é determinístico pela semente', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it('sementes diferentes dão sequências diferentes', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('next fica em [0,1) e int respeita os limites', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = r.int(3, 6);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(6);
    }
  });

  it('shuffle preserva os elementos e não altera a entrada', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = createRng(9).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
    expect(createRng(9).shuffle(input)).toEqual(out);
  });
});

describe('easing', () => {
  it('todas começam em 0 e terminam em 1', () => {
    for (const fn of Object.values(easing)) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
});

describe('Tweens', () => {
  it('avança com update e chama onComplete no fim', () => {
    const tweens = new Tweens();
    const values: number[] = [];
    const done = vi.fn();
    tweens.add({ duration: 1, onUpdate: (v) => values.push(v), onComplete: done });
    tweens.update(0.5);
    expect(values.at(-1)).toBeCloseTo(0.5);
    expect(done).not.toHaveBeenCalled();
    tweens.update(0.6);
    expect(values.at(-1)).toBe(1);
    expect(done).toHaveBeenCalledOnce();
    expect(tweens.size).toBe(0);
  });

  it('respeita o atraso', () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();
    tweens.add({ duration: 1, delay: 1, onUpdate });
    tweens.update(0.9);
    expect(onUpdate).not.toHaveBeenCalled();
    tweens.update(0.6);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('cancel salta para o valor final por padrão', () => {
    const tweens = new Tweens();
    let last = -1;
    const h = tweens.add({ duration: 1, onUpdate: (v) => (last = v) });
    tweens.update(0.2);
    h.cancel();
    expect(last).toBe(1);
    expect(tweens.size).toBe(0);
  });

  it('cancel(false) não altera o valor e resolve a promessa', async () => {
    const tweens = new Tweens();
    let last = -1;
    const h = tweens.add({ duration: 1, onUpdate: (v) => (last = v) });
    tweens.update(0.2);
    h.cancel(false);
    await h.finished;
    expect(last).toBeCloseTo(0.2);
  });

  it('dispose descarta sem chamar onComplete e resolve finished', async () => {
    const tweens = new Tweens();
    const done = vi.fn();
    const h = tweens.add({ duration: 1, onUpdate: () => {}, onComplete: done });
    tweens.dispose();
    await h.finished;
    expect(done).not.toHaveBeenCalled();
    expect(tweens.size).toBe(0);
  });

  it('clear remove todos', () => {
    const tweens = new Tweens();
    tweens.add({ duration: 1, onUpdate: () => {} });
    tweens.add({ duration: 2, onUpdate: () => {} });
    tweens.clear();
    expect(tweens.size).toBe(0);
  });
});

describe('PALETTE', () => {
  it('tem 14 cores, com ids, hex e símbolos únicos', () => {
    expect(PALETTE).toHaveLength(14);
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(14);
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(14);
    expect(new Set(PALETTE.map((c) => c.symbol)).size).toBe(14);
  });

  it('quaisquer duas cores ficam bem afastadas (distância RGB mínima)', () => {
    const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255] as const;
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        const [r1, g1, b1] = rgb(PALETTE[i]!.hex);
        const [r2, g2, b2] = rgb(PALETTE[j]!.hex);
        const d = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
        expect(d, PALETTE[i]!.id + ' x ' + PALETTE[j]!.id).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('paletteColor dá a volta nos índices', () => {
    expect(paletteColor(14)).toBe(PALETTE[0]);
    expect(paletteColor(-1)).toBe(PALETTE[13]);
  });
});
