import { describe, expect, it } from 'vitest';
import { POWERUPS_PER_LEVEL, Session } from './session';
import { createState } from './state';
import { level, veh } from './testkit';

const rep = (color: number, n: number): number[] => Array<number>(n).fill(color);

/** Carros em faixas livres, todos a 0°, em x=1000. */
const cars = (...colors: number[]) => colors.map((c, i) => veh('car', c, 1000, 1000 + 1500 * i, 0));

/** Uma vaga só: o carro 0 (cor 0) estaciona sem embarcar e o carro 1 fica sem vaga. */
const oneSlot = () =>
  new Session(level(cars(0, 1), [...rep(1, 4), ...rep(0, 4)], { slotCount: 1 }));

describe('Session: power-ups', () => {
  it('cargas iniciais: desfazer 5, vaga extra 1, dica 1', () => {
    expect(POWERUPS_PER_LEVEL).toEqual({ undo: 5, extraSlot: 1, hint: 1 });
    expect(oneSlot().remaining).toEqual({ undo: 5, extraSlot: 1, hint: 1 });
  });

  it('spendHint gasta a única carga', () => {
    const s = oneSlot();
    expect(s.spendHint()).toBe(true);
    expect(s.spendHint()).toBe(false);
    expect(s.remaining.hint).toBe(0);
  });
});

describe('Session: desfazer', () => {
  it('devolve o estado anterior e gasta uma carga', () => {
    const s = new Session(level(cars(0, 1), [...rep(0, 4), ...rep(1, 4)]));
    const initial = s.state;
    expect(s.canUndo).toBe(false);
    expect(s.move({ vehicle: 0 }).ok).toBe(true);
    expect(s.canUndo).toBe(true);
    const out = s.undo();
    expect(out.ok).toBe(true);
    expect(s.state).toEqual(initial);
    expect(s.remaining.undo).toBe(4);
  });

  it('sem histórico: "empty" e não gasta carga', () => {
    const s = oneSlot();
    expect(s.undo()).toEqual({ ok: false, reason: 'empty' });
    expect(s.remaining.undo).toBe(5);
  });

  it('na sexta tentativa as cargas acabaram: "none-left"', () => {
    const colors = [0, 1, 2, 3, 4, 5];
    const queue = colors.flatMap((c) => rep(c, 4));
    const s = new Session(level(cars(...colors), queue));
    for (let id = 0; id < 6; id++) expect(s.move({ vehicle: id }).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(s.undo().ok).toBe(true);
    expect(s.canUndo).toBe(true);
    expect(s.undo()).toEqual({ ok: false, reason: 'none-left' });
    expect(s.remaining.undo).toBe(0);
  });

  it('mantém a vaga extra adicionada depois da jogada desfeita', () => {
    const s = oneSlot();
    expect(s.move({ vehicle: 0 }).ok).toBe(true);
    expect(s.addSlot().ok).toBe(true);
    expect(s.state.slots).toHaveLength(2);
    expect(s.undo().ok).toBe(true);
    expect(s.state.slots).toEqual([null, null]);
    expect(s.state.onBoard).toEqual([0, 1]);
  });
});

describe('Session: batidas', () => {
  it('bloqueado: conta batida, não entra no histórico e não gasta nada', () => {
    const s = new Session(
      level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], rep(0, 8)),
    );
    const before = s.state;
    const r = s.move({ vehicle: 0 });
    expect(r).toMatchObject({ ok: false, reason: 'blocked' });
    expect(s.bumps).toBe(1);
    expect(s.canUndo).toBe(false);
    expect(s.state).toBe(before);
    expect(s.remaining).toEqual(POWERUPS_PER_LEVEL);
  });

  it('sem vaga também conta batida', () => {
    const s = oneSlot();
    s.move({ vehicle: 0 });
    expect(s.move({ vehicle: 1 })).toMatchObject({ ok: false, reason: 'no-slot' });
    expect(s.bumps).toBe(1);
  });

  it('veículo desconhecido não conta', () => {
    const s = oneSlot();
    expect(s.move({ vehicle: 99 })).toMatchObject({ ok: false, reason: 'unknown-vehicle' });
    expect(s.bumps).toBe(0);
  });
});

describe('Session: vaga extra', () => {
  it('abre a jogada recusada e só existe uma carga por fase', () => {
    const s = oneSlot();
    s.move({ vehicle: 0 });
    expect(s.move({ vehicle: 1 }).ok).toBe(false);
    const out = s.addSlot();
    expect(out.ok).toBe(true);
    expect(s.state.slots).toHaveLength(2);
    expect(s.remaining.extraSlot).toBe(0);
    expect(s.addSlot()).toEqual({ ok: false, reason: 'none-left' });
    expect(s.state.slots).toHaveLength(2);
    expect(s.move({ vehicle: 1 }).ok).toBe(true);
  });
});

describe('Session: reiniciar e estado', () => {
  it('restart volta ao início, zera batidas e devolve as cargas', () => {
    const s = oneSlot();
    const initial = s.state;
    s.move({ vehicle: 0 });
    s.move({ vehicle: 1 });
    s.addSlot();
    s.undo();
    s.spendHint();
    expect(s.restart()).toEqual(initial);
    expect(s.state).toEqual(initial);
    expect(s.bumps).toBe(0);
    expect(s.canUndo).toBe(false);
    expect(s.remaining).toEqual(POWERUPS_PER_LEVEL);
  });

  it('won e stuck acompanham isWin e isStuck', () => {
    const win = new Session(level(cars(0), rep(0, 4)));
    expect(win.won).toBe(false);
    win.move({ vehicle: 0 });
    expect(win.won).toBe(true);
    expect(win.stuck).toBe(false);

    const stuck = oneSlot();
    stuck.move({ vehicle: 0 });
    expect(stuck.won).toBe(false);
    expect(stuck.stuck).toBe(true);
  });

  it('o estado inicial da sessão é o createState da fase', () => {
    const l = level(cars(0), rep(0, 4));
    expect(new Session(l).state).toEqual(createState(l));
  });
});
