import { describe, expect, it } from 'vitest';
import { parseState } from './notation';
import { canonicalKey, hint, searchMoves, solve } from './solver';
import { applyMove, isWin } from './state';
import type { Move, State } from './types';

function replay(state: State, moves: readonly Move[]): State {
  return moves.reduce((s, m) => {
    const r = applyMove(s, m);
    if (!r.ok) throw new Error(`solução inválida: ${r.reason}`);
    return r.state;
  }, state);
}

describe('canonicalKey', () => {
  it('ignora a ordem dos tubos', () => {
    expect(canonicalKey(parseState('0 1 | 2 | ', 4))).toBe(
      canonicalKey(parseState(' | 2 | 0 1', 4)),
    );
  });
  it('distingue camadas ocultas', () => {
    expect(canonicalKey(parseState('0? 1 | ', 4))).not.toBe(canonicalKey(parseState('0 1 | ', 4)));
  });
});

describe('searchMoves', () => {
  it('poda mover tubo puro para vazio e de tubo completo', () => {
    const s = parseState('0 0 | | 1 1 1 1', 4);
    expect(searchMoves(s)).toEqual([]);
  });
  it('entre puros da mesma cor só vai do menor para o maior', () => {
    const s = parseState('0 | 0 0', 4);
    expect(searchMoves(s)).toEqual([{ from: 0, to: 1 }]);
  });
});

describe('solve', () => {
  it('estado já vencido: zero jogadas', () => {
    const r = solve(parseState('0 0 | 1 1 | ', 2));
    expect(r).toMatchObject({ status: 'solved', moves: [] });
  });

  it('resolve um caso pequeno e a solução é válida', () => {
    const s = parseState('0 1 0 1 | 1 0 1 0 | | ', 4);
    const r = solve(s);
    expect(r.status).toBe('solved');
    expect(isWin(replay(s, r.moves))).toBe(true);
  });

  it('resolve com camadas ocultas respeitando as regras reais', () => {
    const s = parseState('0? 1? 0 | 1? 0? 1 | | ', 3);
    const r = solve(s);
    expect(r.status).toBe('solved');
    expect(isWin(replay(s, r.moves))).toBe(true);
  });

  it('prova que um estado sem saída é insolúvel', () => {
    expect(solve(parseState('0 1 | 1 0', 2)).status).toBe('unsolvable');
  });

  it('devolve unsolvable num estado impossível (cor sem unidades suficientes)', () => {
    const s = parseState('0 1 | 0 | ', 2);
    expect(solve(s)).toMatchObject({ status: 'unsolvable', moves: [] });
  });

  it('respeita o limite de nós', () => {
    const s = parseState('0 1 2 3 | 3 2 1 0 | 1 3 0 2 | 2 0 3 1 | | ', 4);
    expect(solve(s, { maxNodes: 3 }).status).toBe('limit');
  });
});

describe('hint', () => {
  it('devolve uma jogada que leva à solução', () => {
    const s = parseState('0 1 | 1 0 | ', 2);
    const h = hint(s);
    expect(h.status).toBe('solved');
    expect(h.move).toEqual(h.moves[0]);
    expect(h.state).toBe(s);
    expect(isWin(replay(s, h.moves))).toBe(true);
  });
  it('sem jogada quando já venceu ou não há saída', () => {
    expect(hint(parseState('0 0 | 1 1', 2)).move).toBeNull();
    expect(hint(parseState('0 1 | 1 0', 2))).toMatchObject({ status: 'unsolvable', move: null });
  });
});
