import { describe, expect, it } from 'vitest';
import {
  addSlot,
  applyMove,
  createState,
  isFree,
  isStuck,
  isWin,
  legalMoves,
  visibleColor,
} from './state';
import { level, veh } from './testkit';
import type { MoveApplied, MoveRejected, State } from './types';

/** Joga o veículo e exige que a jogada seja aplicada. */
function play(state: State, vehicle: number): MoveApplied {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`jogada recusada: ${r.reason}`);
  return r;
}

/** Joga o veículo e exige que a jogada seja recusada. */
function reject(state: State, vehicle: number): MoveRejected {
  const r = applyMove(state, { vehicle });
  if (r.ok) throw new Error('a jogada deveria ter sido recusada');
  return r;
}

const rep = (color: number, n: number): number[] => Array<number>(n).fill(color);

/** Carros em faixas livres, todos a 0°, de cima para baixo em x=1000. */
const cars = (...colors: number[]) => colors.map((c, i) => veh('car', c, 1000, 1000 + 2000 * i, 0));

describe('createState', () => {
  it('começa com todos no tabuleiro, vagas vazias e fila no início', () => {
    const s = createState(level(cars(0, 1), [...rep(0, 4), ...rep(1, 4)]));
    expect(s.onBoard).toEqual([0, 1]);
    expect(s.slots).toEqual([null, null, null, null]);
    expect(s.queueIndex).toBe(0);
    expect(s.waiting).toEqual([]);
  });
});

describe('applyMove: estacionar e embarcar', () => {
  const start = () => createState(level(cars(0, 1), [...rep(0, 4), ...rep(1, 4)]));

  it('embarca em cascata e o veículo cheio parte e libera a vaga', () => {
    const r = play(start(), 0);
    expect(r.slot).toBe(0);
    expect(r.boardings).toEqual(
      [0, 1, 2, 3].map((p) => ({ slot: 0, vehicle: 0, passenger: p, color: 0 })),
    );
    expect(r.departures).toEqual([{ slot: 0, vehicle: 0 }]);
    expect(r.state.slots[0]).toBeNull();
    expect(r.state.queueIndex).toBe(4);
    expect(r.state.onBoard).toEqual([1]);
  });

  it('sem passageiro compatível, o veículo espera ocupando a vaga', () => {
    const r = play(start(), 1);
    expect(r.boardings).toEqual([]);
    expect(r.departures).toEqual([]);
    expect(r.state.slots[0]).toEqual({ vehicle: 1, filled: 0 });
    expect(r.state.queueIndex).toBe(0);
  });

  it('estaciona na vaga livre de menor índice', () => {
    const afterFirst = play(start(), 0).state; // o carro 0 parte e a vaga 0 fica livre
    expect(play(afterFirst, 1).slot).toBe(0);
  });

  it('com dois da mesma cor estacionados, embarca primeiro na menor vaga', () => {
    let s = createState(level(cars(0, 0, 1), [...rep(1, 4), ...rep(0, 8)]));
    s = play(s, 0).state;
    s = play(s, 1).state;
    const last = play(s, 2);
    expect(last.boardings.map((b) => [b.color, b.slot])).toEqual([
      ...rep(1, 4).map((c) => [c, 2]),
      ...rep(0, 4).map((c) => [c, 0]),
      ...rep(0, 4).map((c) => [c, 1]),
    ]);
    expect(isWin(last.state)).toBe(true);
  });

  it('cada veículo fica na vaga em que estacionou', () => {
    let s = createState(level(cars(0, 1, 2), [...rep(2, 4), ...rep(0, 4), ...rep(1, 4)]));
    s = play(s, 0).state;
    s = play(s, 1).state;
    expect(s.slots[0]?.vehicle).toBe(0);
    expect(s.slots[1]?.vehicle).toBe(1);
  });
});

describe('vitória e derrota', () => {
  it('vence quando todos partiram e a fila acabou', () => {
    const s = createState(level(cars(0), rep(0, 4)));
    expect(isWin(s)).toBe(false);
    const after = play(s, 0).state;
    expect(isWin(after)).toBe(true);
    expect(isStuck(after)).toBe(false);
  });

  it('sem vaga livre o veículo não sai e a partida trava', () => {
    const s0 = createState(level(cars(0, 1), [...rep(1, 4), ...rep(0, 4)], { slotCount: 1 }));
    const s1 = play(s0, 0).state; // estaciona; a fila começa em cor 1, ninguém embarca
    expect(s1.slots[0]).toEqual({ vehicle: 0, filled: 0 });
    const r = reject(s1, 1);
    expect(r.reason).toBe('no-slot');
    expect(r.state).toBe(s1);
    expect(legalMoves(s1)).toEqual([]);
    expect(isStuck(s1)).toBe(true);
  });

  it('vagas cheias e fila que não combina com ninguém estacionado: sem saída', () => {
    let s = createState(level(cars(0, 0, 1), [...rep(1, 4), ...rep(0, 8)], { slotCount: 2 }));
    s = play(s, 0).state;
    s = play(s, 1).state;
    expect(s.slots.every((slot) => slot !== null)).toBe(true);
    expect(s.onBoard).toEqual([2]);
    expect(isFree(s, 2)).toBe(true);
    expect(legalMoves(s)).toEqual([]);
    expect(isStuck(s)).toBe(true);
  });

  it('um único carro obstruído para sempre: sem jogadas e sem saída', () => {
    const s = createState(
      level(cars(0), rep(0, 4), { obstacles: [{ cx: 5000, cy: 1000, w: 600, h: 600, angle: 0 }] }),
    );
    expect(legalMoves(s)).toEqual([]);
    expect(isStuck(s)).toBe(true);
  });

  it('a vaga extra abre jogadas que "sem vaga" negava', () => {
    const s0 = createState(level(cars(0, 1), [...rep(1, 4), ...rep(0, 4)], { slotCount: 1 }));
    const s1 = play(s0, 0).state;
    expect(reject(s1, 1).reason).toBe('no-slot');
    const s2 = addSlot(s1);
    expect(s2.slots).toHaveLength(2);
    expect(legalMoves(s2)).toEqual([{ vehicle: 1 }]);
    expect(play(s2, 1).slot).toBe(1);
  });
});

describe('applyMove: bloqueios e jogadas inválidas', () => {
  const blocked = () =>
    createState(level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], rep(0, 8)));

  it('bate e volta: recusa com quem bloqueia e devolve o mesmo estado', () => {
    const s = blocked();
    const r = reject(s, 0);
    expect(r).toMatchObject({ reason: 'blocked', blockedBy: [1], byObstacle: false });
    expect(r.state).toBe(s);
    expect(isFree(s, 0)).toBe(false);
    expect(isFree(s, 1)).toBe(true);
    expect(legalMoves(s)).toEqual([{ vehicle: 1 }]);
  });

  it('depois que o bloqueador parte, o veículo fica livre', () => {
    const s = play(blocked(), 1).state;
    expect(isFree(s, 0)).toBe(true);
    expect(play(s, 0).state.onBoard).toEqual([]);
  });

  it('obstáculo fixo bloqueia sem listar veículos', () => {
    const s = createState(
      level(cars(0), rep(0, 4), { obstacles: [{ cx: 5000, cy: 1000, w: 600, h: 600, angle: 0 }] }),
    );
    expect(reject(s, 0)).toMatchObject({ reason: 'blocked', blockedBy: [], byObstacle: true });
    expect(isFree(s, 0)).toBe(false);
  });

  it('veículo que já partiu ou id inexistente: unknown-vehicle com o mesmo estado', () => {
    const won = play(createState(level(cars(0), rep(0, 4))), 0).state;
    expect(isWin(won)).toBe(true);
    for (const id of [0, 99, -1]) {
      const r = reject(won, id);
      expect(r).toMatchObject({ reason: 'unknown-vehicle', blockedBy: [], byObstacle: false });
      expect(r.state).toBe(won);
    }
    expect(isFree(won, 0)).toBe(false);
  });
});

describe('veículo misterioso', () => {
  const mystery = () =>
    createState(
      level(
        [veh('car', 2, 1000, 1000, 0, true), veh('car', 1, 1000, 3000, 0)],
        [...rep(1, 4), ...rep(2, 4)],
      ),
    );

  it('a cor só fica visível depois de estacionar', () => {
    const s = mystery();
    expect(visibleColor(s, 0)).toBeNull();
    expect(visibleColor(s, 1)).toBe(1);
    const r = play(s, 0);
    expect(r.revealed).toBe(true);
    expect(visibleColor(r.state, 0)).toBe(2);
  });

  it('veículo comum não conta como revelado', () => {
    expect(play(mystery(), 1).revealed).toBe(false);
  });
});

describe('imutabilidade e serialização', () => {
  it('applyMove não altera o estado recebido', () => {
    const s = createState(level(cars(0, 1), [...rep(0, 4), ...rep(1, 4)]));
    const before = JSON.stringify(s);
    play(s, 0);
    reject(s, 99);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('o novo estado e o resultado sobrevivem a JSON (Worker)', () => {
    const r = play(createState(level(cars(0, 1), [...rep(0, 4), ...rep(1, 4)])), 0);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
