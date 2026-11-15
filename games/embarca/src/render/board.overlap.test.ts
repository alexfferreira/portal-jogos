import { Matrix4, type InstancedMesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createState, type MoveApplied, type State } from '../logic';
import { scenarioLevel } from '../logic/testkit';
import { Board } from './board';
import { FakeStage, vehicleGroupsOf } from './fakeStage';

afterEach(() => vi.restoreAllMocks());

const scenario = scenarioLevel();

function setup() {
  const stage = new FakeStage();
  const board = new Board({ stage, quality: 'high' });
  const state = createState(scenario);
  board.setLevel(scenario, state);
  return { stage, board, state };
}

const apply = (state: State, vehicle: number): MoveApplied => {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`recusada: ${r.reason}`);
  return r;
};

const groupOf = (stage: FakeStage, id: number) =>
  vehicleGroupsOf(stage.scene).find((g) => g.userData.vehicleId === id)!;

/**
 * No cenário, o carro 1 sai primeiro (embarca 4 e parte) e só depois o carro 0 fica livre:
 * a segunda jogada é tocada com a primeira ainda no meio do voo.
 */
describe('Board: jogada nova com a anterior ainda animando', () => {
  it('o veículo que ainda voa NÃO some: a animação dele continua', () => {
    const { board, state, stage } = setup();
    const r1 = apply(state, 1);
    const r2 = apply(r1.state, 0);
    const done1 = vi.fn();
    const done2 = vi.fn();
    board.playMove(state, { vehicle: 1 }, r1, r1.state, done1);
    stage.tweens.update(0.3); // o carro 1 em pleno voo
    const a = groupOf(stage, 1);
    expect(a.visible).toBe(true);
    const mid = a.position.clone();

    board.playMove(r1.state, { vehicle: 0 }, r2, r2.state, done2);
    expect(a.visible).toBe(true); // antes sumia: o toque saltava a animação para o fim
    expect(board.animating).toBe(true);
    expect(done1).not.toHaveBeenCalled();
    stage.tweens.update(0.05);
    expect(a.position.distanceTo(mid)).toBeGreaterThan(0); // continua se movendo

    stage.run(board);
    expect(done1).toHaveBeenCalledTimes(1);
    expect(done2).toHaveBeenCalledTimes(1);
    expect(board.animating).toBe(false);
    expect(board.viewString()).toBe('b:2,3,4,5|s:-,-,-,-|q:8');
  });

  it('o visual só é reconciliado quando todas as animações terminam', () => {
    const { board, state, stage } = setup();
    const r1 = apply(state, 1);
    const r2 = apply(r1.state, 0);
    board.playMove(state, { vehicle: 1 }, r1, r1.state, () => {});
    stage.tweens.update(0.3);
    board.playMove(r1.state, { vehicle: 0 }, r2, r2.state, () => {});
    // Enquanto algo anima, o texto do visual ainda é o do estado anterior às jogadas.
    expect(board.viewString()).toBe('b:0,1,2,3,4,5|s:-,-,-,-|q:0');
    stage.run(board);
    expect(board.viewString()).toBe('b:2,3,4,5|s:-,-,-,-|q:8');
  });

  it('uma jogada recusada (veículo inexistente) não estoura a animação em curso', () => {
    const { board, state, stage } = setup();
    const r1 = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r1, r1.state, () => {});
    stage.tweens.update(0.3);
    const bad = applyMove(r1.state, { vehicle: 99 });
    if (bad.ok) throw new Error('deveria recusar');
    const onDone = vi.fn();
    board.playMove(r1.state, { vehicle: 99 }, bad, r1.state, onDone);
    expect(groupOf(stage, 1).visible).toBe(true);
    expect(board.animating).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    stage.run(board);
    expect(board.viewString()).toBe('b:0,2,3,4,5|s:-,-,-,-|q:4');
  });

  it('o toque usa o estado lógico: o veículo que já saiu não pode ser escolhido', () => {
    const { board, state, stage } = setup();
    const r1 = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r1, r1.state, () => {});
    stage.tweens.update(0.3);
    const box = board.screenBoxes().find((b) => b.id === 1)!;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    expect(board.pick(cx, cy)).toBe(1); // o visual ainda o mostra no tabuleiro
    expect(board.pick(cx, cy, r1.state.onBoard)).not.toBe(1); // a lógica já o tirou
  });

  it('a fila nunca "volta" quando as animações se sobrepõem', () => {
    const { board, state, stage } = setup();
    const r1 = apply(state, 1);
    const r2 = apply(r1.state, 0);
    board.playMove(state, { vehicle: 1 }, r1, r1.state, () => {});
    stage.tweens.update(0.3);
    board.playMove(r1.state, { vehicle: 0 }, r2, r2.state, () => {});
    let hidden = 0;
    const queueMesh = stage.scene.getObjectByName('queue-passengers');
    const count = () => {
      const m = queueMesh as InstancedMesh;
      const t = new Matrix4();
      let n = 0;
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, t);
        if (Math.abs(t.elements[0] as number) < 1e-9) n++;
      }
      return n;
    };
    for (let t = 0; board.animating && t < 10; t += 0.05) {
      stage.frame(0.05);
      const now = count();
      expect(now).toBeGreaterThanOrEqual(hidden);
      hidden = now;
    }
  });
});
