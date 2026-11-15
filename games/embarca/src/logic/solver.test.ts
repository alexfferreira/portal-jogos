import { describe, expect, it } from 'vitest';
import { canonicalKey, hint, solve } from './solver';
import { applyMove, createState, isWin } from './state';
import { scenarioLevel } from './testkit';
import type { Move, State } from './types';

function replay(state: State, moves: readonly Move[]): State {
  return moves.reduce((s, m) => {
    const r = applyMove(s, m);
    if (!r.ok) throw new Error(`solução inválida: ${r.reason}`);
    return r.state;
  }, state);
}

const play = (order: number[]): State =>
  replay(
    createState(scenarioLevel()),
    order.map((vehicle) => ({ vehicle })),
  );

describe('solve', () => {
  it('resolve a fase do cenário e a solução vence quando reproduzida', () => {
    const start = createState(scenarioLevel());
    const r = solve(start);
    expect(r.status).toBe('solved');
    expect(isWin(replay(start, r.moves))).toBe(true);
  });

  it('posição sem saída: unsolvable, sem jogadas', () => {
    const r = solve(play([4, 5, 3, 2]));
    expect(r.status).toBe('unsolvable');
    expect(r.moves).toEqual([]);
  });

  it('estado já vencido: solved sem jogadas', () => {
    const r = solve(play([1, 0, 3, 2, 4, 5]));
    expect(r.status).toBe('solved');
    expect(r.moves).toEqual([]);
  });

  it('respeita o limite de nós', () => {
    expect(solve(createState(scenarioLevel()), { maxNodes: 3 }).status).toBe('limit');
  });

  it('é determinístico', () => {
    const start = createState(scenarioLevel());
    expect(solve(start)).toEqual(solve(start));
  });
});

describe('hint', () => {
  it('devolve a primeira jogada da solução e o estado de origem', () => {
    const start = createState(scenarioLevel());
    const h = hint(start);
    expect(h.status).toBe('solved');
    expect(h.move).not.toBeNull();
    expect(h.move).toEqual(h.moves[0]);
    expect(h.state).toBe(start);
  });

  it('sem jogada quando já venceu', () => {
    const h = hint(play([1, 0, 3, 2, 4, 5]));
    expect(h.move).toBeNull();
  });

  it('sem jogada e unsolvable na posição sem saída', () => {
    const h = hint(play([4, 5, 3, 2]));
    expect(h.status).toBe('unsolvable');
    expect(h.move).toBeNull();
  });

  it('funciona a partir de um estado no meio da partida', () => {
    const mid = play([1, 0]);
    const h = hint(mid);
    expect(h.status).toBe('solved');
    expect(isWin(replay(mid, h.moves))).toBe(true);
  });
});

describe('canonicalKey', () => {
  it('é igual para estados iguais e diferente quando só a ordem das vagas muda', () => {
    const s = createState(scenarioLevel());
    const a: State = {
      ...s,
      slots: [{ vehicle: 4, filled: 0 }, { vehicle: 5, filled: 0 }, null, null],
    };
    const b: State = {
      ...s,
      slots: [{ vehicle: 5, filled: 0 }, { vehicle: 4, filled: 0 }, null, null],
    };
    expect(canonicalKey(a)).toBe(canonicalKey({ ...a }));
    expect(canonicalKey(a)).not.toBe(canonicalKey(b));
  });
});
