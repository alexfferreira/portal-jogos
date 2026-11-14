import { describe, expect, it } from 'vitest';
import { solveSearch, type SearchProblem } from './solver';
import { UndoStack } from './undo';

describe('UndoStack', () => {
  it('começa vazia', () => {
    const u = new UndoStack<number>();
    expect(u.canUndo()).toBe(false);
    expect(u.undo()).toBeUndefined();
    expect(u.size).toBe(0);
  });

  it('devolve estados em ordem inversa', () => {
    const u = new UndoStack<string>();
    u.push('a');
    u.push('b');
    expect(u.peek()).toBe('b');
    expect(u.undo()).toBe('b');
    expect(u.undo()).toBe('a');
    expect(u.canUndo()).toBe(false);
  });

  it('respeita o limite descartando o mais antigo', () => {
    const u = new UndoStack<number>(2);
    u.push(1);
    u.push(2);
    u.push(3);
    expect(u.size).toBe(2);
    expect(u.undo()).toBe(3);
    expect(u.undo()).toBe(2);
    expect(u.undo()).toBeUndefined();
  });

  it('clear esvazia e limite inválido lança', () => {
    const u = new UndoStack<number>();
    u.push(1);
    u.clear();
    expect(u.canUndo()).toBe(false);
    expect(() => new UndoStack(0)).toThrow(RangeError);
  });
});

/** Puzzle de brinquedo: chegar a `target` a partir de 0 com +1, +3, ×2 (estado = número). */
function toy(target: number, cap = 1000): SearchProblem<number, string> {
  return {
    legalMoves: (n) => (n > cap ? [] : ['+1', '+3', 'x2']),
    apply: (n, m) => (m === '+1' ? n + 1 : m === '+3' ? n + 3 : n * 2),
    isGoal: (n) => n === target,
    canonicalKey: (n) => String(n),
    heuristic: (n) => Math.abs(target - n),
  };
}

function replay(start: number, moves: string[]): number {
  const p = toy(0);
  return moves.reduce((n, m) => p.apply(n, m), start);
}

describe('solveSearch', () => {
  it('estado inicial já resolvido', () => {
    expect(solveSearch(toy(0), 0)).toEqual({ status: 'solved', moves: [], nodes: 1 });
  });

  it('acha uma sequência válida', () => {
    const r = solveSearch(toy(37), 1);
    expect(r.status).toBe('solved');
    expect(replay(1, r.moves)).toBe(37);
  });

  it('funciona sem heurística (DFS)', () => {
    const p = { ...toy(11), heuristic: undefined };
    const r = solveSearch(p, 1);
    expect(r.status).toBe('solved');
    expect(replay(1, r.moves)).toBe(11);
  });

  it('prova que é insolúvel quando esgota o espaço', () => {
    const finite: SearchProblem<number, number> = {
      legalMoves: (n) => (n < 5 ? [1] : []),
      apply: (n, m) => n + m,
      isGoal: (n) => n === 99,
      canonicalKey: String,
    };
    const r = solveSearch(finite, 0);
    expect(r.status).toBe('unsolvable');
    expect(r.moves).toEqual([]);
  });

  it('memoiza estados canônicos (não repete)', () => {
    let calls = 0;
    const p: SearchProblem<number, number> = {
      legalMoves: () => [1, -1],
      apply: (n, m) => {
        calls++;
        return n + m;
      },
      isGoal: () => false,
      canonicalKey: (n) => String(Math.abs(n)),
    };
    // espaço canônico: |n| em 0..3 limitado por legalMoves? Sem limite seria infinito;
    // aqui o limite de nós interrompe.
    const r = solveSearch(p, 0, { maxNodes: 20 });
    expect(r.status).toBe('limit');
    expect(r.nodes).toBeLessThanOrEqual(20);
    expect(calls).toBeLessThan(80);
  });

  it('respeita o limite de nós', () => {
    const r = solveSearch(toy(999_999, 1_000_000), 1, { maxNodes: 50, depthWeight: 1 });
    expect(r.status).toBe('limit');
    expect(r.nodes).toBeLessThanOrEqual(50);
  });

  it('respeita o limite de tempo com relógio injetado', () => {
    let t = 0;
    const now = (): number => (t += 10);
    const r = solveSearch(toy(999_999, 1_000_000), 1, { maxMillis: 100, now, maxNodes: 1e9 });
    expect(r.status).toBe('limit');
  });

  it('com depthWeight alto encontra caminho curto', () => {
    const r = solveSearch(toy(8), 1, { depthWeight: 100 });
    expect(r.status).toBe('solved');
    expect(r.moves.length).toBeLessThanOrEqual(3);
  });
});
