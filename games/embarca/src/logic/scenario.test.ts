import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createLevel,
  createState,
  isStuck,
  isWin,
  legalMoves,
  type MoveApplied,
  type State,
} from './index';

const rep = (color: number, n: number): number[] => Array<number>(n).fill(color);

/** Fase de ponta a ponta: 2 carros, 2 vans e 2 ônibus, com ângulos livres e dois bloqueios. */
const scenario = () =>
  createLevel({
    board: { width: 10000, height: 10000 },
    vehicles: [
      { kind: 'car', color: 0, cx: 1500, cy: 1500, angle: 0 },
      { kind: 'car', color: 0, cx: 6000, cy: 1500, angle: 0 },
      { kind: 'van', color: 1, cx: 2000, cy: 4000, angle: 90 },
      { kind: 'van', color: 1, cx: 2000, cy: 7000, angle: 90 },
      { kind: 'bus', color: 2, cx: 7000, cy: 5000, angle: 135 },
      { kind: 'bus', color: 2, cx: 8500, cy: 8500, angle: 30 },
    ],
    queue: [...rep(0, 8), ...rep(1, 12), ...rep(2, 20)],
  });

const WINNING = [1, 0, 3, 2, 4, 5];
const LOSING = [4, 5, 3, 2];

function playAll(order: number[], viaJson = false): MoveApplied[] {
  let state: State = createState(scenario());
  const results: MoveApplied[] = [];
  for (const vehicle of order) {
    if (viaJson) state = JSON.parse(JSON.stringify(state)) as State;
    const r = applyMove(state, { vehicle });
    if (!r.ok) throw new Error(`jogada ${vehicle} recusada: ${r.reason}`);
    results.push(r);
    state = r.state;
  }
  return results;
}

describe('cenário de ponta a ponta', () => {
  it('o grafo de bloqueios é o esperado e não há obstruções', () => {
    const l = scenario();
    expect(l.blockers).toEqual([[1], [], [3], [], [], []]);
    expect(l.obstructed).toEqual([false, false, false, false, false, false]);
  });

  it('a ordem vencedora termina em vitória, sem recusas', () => {
    const results = playAll(WINNING);
    expect(isWin(results.at(-1)!.state)).toBe(true);
  });

  it('a ordem perdedora termina sem saída', () => {
    const results = playAll(LOSING);
    const last = results.at(-1)!.state;
    expect(isWin(last)).toBe(false);
    expect(isStuck(last)).toBe(true);
    expect(last.slots.every((s) => s !== null)).toBe(true);
  });

  it('é determinístico, inclusive refazendo o estado por JSON a cada passo', () => {
    const summary = (rs: MoveApplied[]) =>
      rs.map((r) => ({ slot: r.slot, boardings: r.boardings, departures: r.departures }));
    const first = summary(playAll(WINNING));
    expect(summary(playAll(WINNING))).toEqual(first);
    expect(summary(playAll(WINNING, true))).toEqual(first);
  });

  it('explorando todas as sequências existem finais de vitória e de derrota', () => {
    const seen = new Set<string>();
    let wins = 0;
    let stuck = 0;
    const visit = (state: State): void => {
      const key = JSON.stringify([state.onBoard, state.slots, state.queueIndex]);
      if (seen.has(key)) return;
      seen.add(key);
      const moves = legalMoves(state);
      if (moves.length === 0) {
        if (isWin(state)) wins++;
        else if (isStuck(state)) stuck++;
        return;
      }
      for (const move of moves) {
        const r = applyMove(state, move);
        if (r.ok) visit(r.state);
      }
    };
    visit(createState(scenario()));
    expect(wins).toBeGreaterThan(0);
    expect(stuck).toBeGreaterThan(0);
  });
});
