import { describe, expect, it } from 'vitest';
import { formatState, parseState } from './notation';
import {
  addEmptyTube,
  applyMove,
  createState,
  isStuck,
  isWin,
  legalMoves,
  topBlock,
} from './state';
import type { MoveApplied, State } from './types';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

function ok(state: State, from: number, to: number): MoveApplied {
  const r = applyMove(state, { from, to });
  if (!r.ok) throw new Error(`jogada recusada: ${r.reason}`);
  return r;
}

describe('createState / notação', () => {
  it('ida e volta da notação', () => {
    const s = parseState('0 1 2? | 3 | ', 4);
    expect(formatState(s)).toBe('0 1 2 | 3 | ');
    expect(s.tubes).toHaveLength(3);
  });

  it('o topo é sempre revelado', () => {
    const s = parseState('0 1?', 4);
    expect(s.tubes[0]?.[1]?.hidden).toBe(false);
    const t = parseState('0? 1?', 4);
    expect(t.tubes[0]?.[0]?.hidden).toBe(true);
  });

  it('rejeita capacidade inválida e tubo acima da capacidade', () => {
    expect(() => createState(0, [])).toThrow(RangeError);
    expect(() => createState(2, [[0, 0, 0]])).toThrow(RangeError);
    expect(() => parseState('a', 4)).toThrow();
  });

  it('é serializável (JSON ida e volta)', () => {
    const s = parseState('0 1? 2 | 3 ', 4);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('applyMove', () => {
  it('move o bloco inteiro do topo para tubo vazio', () => {
    const s = parseState('0 1 1 | ', 4);
    const r = ok(s, 0, 1);
    expect(formatState(r.state)).toBe('0 | 1 1');
    expect(r.moved).toBe(2);
    expect(r.color).toBe(1);
  });

  it('move sobre mesma cor', () => {
    const s = parseState('0 1 | 2 1', 4);
    expect(formatState(ok(s, 0, 1).state)).toBe('0 | 2 1 1');
  });

  it('move parcialmente por falta de espaço', () => {
    const s = parseState('0 1 1 1 | 2 1 1', 4);
    const r = ok(s, 0, 1);
    expect(r.moved).toBe(1);
    expect(formatState(r.state)).toBe('0 1 1 | 2 1 1 1');
  });

  it('recusa mesma origem e destino', () => {
    const s = parseState('0 | ', 4);
    expect(applyMove(s, { from: 0, to: 0 })).toMatchObject({ ok: false, reason: 'same-tube' });
  });

  it('recusa cores diferentes', () => {
    const s = parseState('0 1 | 2 3', 4);
    expect(applyMove(s, { from: 0, to: 1 })).toMatchObject({ ok: false, reason: 'color-mismatch' });
  });

  it('recusa destino cheio', () => {
    const s = parseState('1 | 1 1 1 1', 4);
    expect(applyMove(s, { from: 0, to: 1 })).toMatchObject({
      ok: false,
      reason: 'full-destination',
    });
  });

  it('recusa origem vazia e índices inválidos', () => {
    const s = parseState(' | 1', 4);
    expect(applyMove(s, { from: 0, to: 1 })).toMatchObject({ ok: false, reason: 'empty-source' });
    expect(applyMove(s, { from: 5, to: 1 })).toMatchObject({ ok: false, reason: 'invalid-index' });
    expect(applyMove(s, { from: 0, to: -1 })).toMatchObject({ ok: false, reason: 'invalid-index' });
    expect(applyMove(s, { from: 0.5, to: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid-index',
    });
  });

  it('jogada recusada devolve o mesmo estado', () => {
    const s = parseState('0 | ', 4);
    expect(applyMove(s, { from: 0, to: 0 }).state).toBe(s);
  });

  it('não altera o estado original (imutável)', () => {
    const s = deepFreeze(parseState('0 1 1 | 2 1? 1 | ', 4));
    const before = JSON.stringify(s);
    const r = ok(s, 0, 2);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.state).not.toBe(s);
    expect(addEmptyTube(s).tubes).toHaveLength(4);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('indica tubo completado', () => {
    const s = parseState('1 | 0 1 1', 4);
    expect(ok(s, 1, 0).completed).toBeNull();
    const t = parseState('1 1 1 | 0 1', 4);
    expect(ok(t, 1, 0).completed).toBe(0);
  });
});

describe('camadas ocultas', () => {
  it('revela a unidade que chega ao topo', () => {
    const s = parseState('2? 3? 1 | ', 4);
    expect(s.tubes[0]?.[1]?.hidden).toBe(true);
    const r = ok(s, 0, 1);
    expect(r.revealed).toEqual([{ tube: 0, index: 1, color: 3 }]);
    expect(r.state.tubes[0]?.[1]).toEqual({ color: 3, hidden: false });
    expect(r.state.tubes[0]?.[0]?.hidden).toBe(true);
  });

  it('o bloco do topo para na primeira unidade oculta', () => {
    const s = parseState('1? 1', 4);
    expect(topBlock(s.tubes[0] ?? [])).toEqual({ color: 1, count: 1 });
  });

  it('bloco movido inclui unidade revelada depois (jogada seguinte)', () => {
    let s = parseState('1? 1 | | ', 4);
    const r = ok(s, 0, 1);
    s = r.state;
    expect(formatState(s)).toBe('1 | 1 | ');
    expect(ok(s, 0, 1).moved).toBe(1);
  });

  it('tubo que se completa revela tudo', () => {
    const s = parseState('1? 1? | 1', 3);
    const r = ok(s, 1, 0);
    expect(r.completed).toBe(0);
    expect(r.state.tubes[0]?.every((u) => !u.hidden)).toBe(true);
    expect(r.revealed.map((x) => x.index)).toEqual([0]);
  });

  it('um "?" no topo seria recusado (estado montado à mão)', () => {
    const raw: State = {
      capacity: 4,
      tubes: [[{ color: 1, hidden: true }], []],
    };
    expect(applyMove(raw, { from: 0, to: 1 })).toMatchObject({ ok: false, reason: 'hidden-top' });
  });
});

describe('legalMoves / isWin / isStuck', () => {
  it('lista jogadas válidas', () => {
    const s = parseState('0 1 | 1 | ', 4);
    const moves = legalMoves(s).map((m) => `${m.from}>${m.to}`);
    expect(moves).toEqual(['0>1', '0>2', '1>0', '1>2']);
  });

  it('vitória: tubos vazios ou cheios de uma cor', () => {
    expect(isWin(parseState('1 1 1 1 | | 2 2 2 2', 4))).toBe(true);
    expect(isWin(parseState('1 1 1 | 1 | 2 2 2 2', 4))).toBe(false);
    expect(isWin(parseState('1 1 1 2 | 2 2 2 1', 4))).toBe(false);
  });

  it('sem saída: sem jogadas e não vencido', () => {
    const s = parseState('0 1 | 1 0', 2);
    expect(legalMoves(s)).toHaveLength(0);
    expect(isStuck(s)).toBe(true);
  });

  it('vencido não é "sem saída"', () => {
    const s = parseState('0 0 | 1 1', 2);
    expect(isWin(s)).toBe(true);
    expect(isStuck(s)).toBe(false);
  });

  it('com jogada disponível não está preso', () => {
    expect(isStuck(parseState('0 1 | 1 0 | ', 2))).toBe(false);
  });

  it('tubo extra adiciona um tubo vazio e destrava', () => {
    const s = parseState('0 1 | 1 0', 2);
    const t = addEmptyTube(s);
    expect(t.tubes).toHaveLength(3);
    expect(t.tubes[2]).toHaveLength(0);
    expect(isStuck(t)).toBe(false);
  });

  it('isStuck considera o tubo extra presente no state', () => {
    const base = parseState('0 1 | 1 0', 2);
    expect(isStuck(base)).toBe(true);
    expect(isStuck(addEmptyTube(base))).toBe(false);
    const full = parseState('0 1 | 1 0 | 0 0', 2);
    expect(isStuck(full)).toBe(true);
  });
});
