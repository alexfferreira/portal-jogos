import { describe, expect, it } from 'vitest';
import { formatState, parseState } from './notation';
import { consumePowerUp, createPowerUps, Session } from './session';

describe('PowerUps', () => {
  it('começa com 5/1/1 e consome sem alterar o original', () => {
    const p = createPowerUps();
    expect(p).toEqual({ undo: 5, extraTube: 1, hint: 1 });
    const q = consumePowerUp(p, 'hint');
    expect(q).toEqual({ undo: 5, extraTube: 1, hint: 0 });
    expect(p.hint).toBe(1);
    expect(consumePowerUp(q as typeof p, 'hint')).toBeNull();
  });
});

describe('Session', () => {
  const start = () => new Session(parseState('0 1 | 1 0 | ', 2));

  it('só jogadas válidas entram no histórico', () => {
    const s = start();
    expect(s.move({ from: 0, to: 0 }).ok).toBe(false);
    expect(s.canUndo).toBe(false);
    expect(s.move({ from: 0, to: 2 }).ok).toBe(true);
    expect(s.canUndo).toBe(true);
  });

  it('desfazer restaura o estado e gasta carga', () => {
    const s = start();
    const before = s.state;
    s.move({ from: 0, to: 2 });
    const r = s.undo();
    expect(r.ok).toBe(true);
    expect(formatState(s.state)).toBe(formatState(before));
    expect(s.remaining.undo).toBe(4);
  });

  it('desfazer sem histórico não gasta carga', () => {
    const s = start();
    expect(s.undo()).toEqual({ ok: false, reason: 'empty' });
    expect(s.remaining.undo).toBe(5);
  });

  it('limita a 5 desfazeres por fase', () => {
    const s = new Session(parseState('0 0 0 | ', 4));
    for (let i = 0; i < 6; i++) {
      s.move({ from: 0, to: 1 });
      s.move({ from: 1, to: 0 });
    }
    for (let i = 0; i < 5; i++) expect(s.undo().ok).toBe(true);
    expect(s.undo()).toEqual({ ok: false, reason: 'none-left' });
    expect(s.canUndo).toBe(true);
  });

  it('tubo extra: 1 por fase, e sobrevive ao desfazer', () => {
    const s = start();
    s.move({ from: 0, to: 2 });
    expect(s.addTube().ok).toBe(true);
    expect(s.state.tubes).toHaveLength(4);
    expect(s.addTube()).toEqual({ ok: false, reason: 'none-left' });
    s.undo();
    expect(s.state.tubes).toHaveLength(4);
    expect(s.state.tubes[0]).toHaveLength(2);
  });

  it('dica: 1 por fase', () => {
    const s = start();
    expect(s.spendHint()).toBe(true);
    expect(s.spendHint()).toBe(false);
  });

  it('detecta vitória e sem saída', () => {
    const w = new Session(parseState('0 | 0 | ', 2));
    expect(w.won).toBe(false);
    w.move({ from: 0, to: 1 });
    expect(w.won).toBe(true);
    const stuck = new Session(parseState('0 1 | 1 0', 2));
    expect(stuck.stuck).toBe(true);
    stuck.addTube();
    expect(stuck.stuck).toBe(false);
  });

  it('reiniciar volta ao início e devolve as cargas', () => {
    const s = start();
    s.move({ from: 0, to: 2 });
    s.undo();
    s.addTube();
    s.restart();
    expect(formatState(s.state)).toBe('0 1 | 1 0 | ');
    expect(s.remaining).toEqual({ undo: 5, extraTube: 1, hint: 1 });
    expect(s.canUndo).toBe(false);
  });

  it('desfazer devolve as unidades reocultadas', () => {
    const s = new Session(parseState('2? 3? 1 | | ', 4));
    const m = s.move({ from: 0, to: 1 });
    expect(m.ok && m.revealed).toEqual([{ tube: 0, index: 1, color: 3 }]);
    expect(s.state.tubes[0]?.[1]?.hidden).toBe(false);
    const u = s.undo();
    expect(u.ok && u.rehidden).toEqual([{ tube: 0, index: 1, color: 3 }]);
    expect(s.state.tubes[0]?.[1]?.hidden).toBe(true);
    expect(s.state.tubes[0]?.[0]?.hidden).toBe(true);
  });

  it('desfazer jogada sem revelação não reoculta nada', () => {
    const s = new Session(parseState('0 1 | | ', 4));
    s.move({ from: 0, to: 1 });
    const u = s.undo();
    expect(u.ok && u.rehidden).toEqual([]);
  });

  it('desfazer jogada que completou tubo reoculta as unidades reveladas por ela', () => {
    const s = new Session(parseState('1? 1? | 1', 3));
    s.move({ from: 1, to: 0 });
    expect(s.state.tubes[0]?.every((x) => !x.hidden)).toBe(true);
    const u = s.undo();
    expect(u.ok && u.rehidden).toEqual([{ tube: 0, index: 0, color: 1 }]);
    expect(s.state.tubes[0]?.[0]?.hidden).toBe(true);
  });

  it('desfazer depois do tubo extra preenchido mantém o tubo, agora vazio', () => {
    const s = new Session(parseState('0 1 | 1 0 | ', 2));
    s.addTube();
    s.move({ from: 0, to: 3 });
    expect(s.state.tubes[3]).toHaveLength(1);
    s.undo();
    expect(s.state.tubes).toHaveLength(4);
    expect(s.state.tubes[3]).toHaveLength(0);
    expect(formatState(s.state)).toBe('0 1 | 1 0 |  | ');
  });
});
