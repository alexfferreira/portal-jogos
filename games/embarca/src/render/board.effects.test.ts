import { BufferGeometry } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addSlot, applyMove, createState, type MoveApplied, type State } from '../logic';
import { level as buildLevel, scenarioLevel, veh } from '../logic/testkit';
import { Board } from './board';
import { FakeStage, vehicleGroupsOf } from './fakeStage';
import { computeLayout } from './layout';
import { planMove } from './plan';

afterEach(() => vi.restoreAllMocks());

const scenario = scenarioLevel();

function setup(level = scenario) {
  const stage = new FakeStage();
  const sounds: string[] = [];
  const board = new Board({ stage, quality: 'high', sfx: (name) => sounds.push(name) });
  const state = createState(level);
  board.setLevel(level, state);
  return { stage, board, state, sounds };
}

const apply = (state: State, vehicle: number): MoveApplied => {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`recusada: ${r.reason}`);
  return r;
};

/** O grupo-raiz do tabuleiro é o primeiro filho da cena. */
const rootCount = (stage: FakeStage): number => stage.scene.children[0]?.children.length ?? 0;

describe('Board: dica e mãozinha', () => {
  it('setHint mostra o anel e setHint(null) esconde', () => {
    const { board } = setup();
    expect(board.hasHint).toBe(false);
    board.setHint(2);
    expect(board.hasHint).toBe(true);
    board.setHint(null);
    expect(board.hasHint).toBe(false);
  });

  it('qualquer mudança de estado apaga a dica', () => {
    const { board, state } = setup();
    board.setHint(1);
    const r = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r, r.state, () => {});
    expect(board.hasHint).toBe(false);
    board.finishAnimations();
    board.setHint(0);
    board.setState(createState(scenario));
    expect(board.hasHint).toBe(false);
  });

  it('a dica sobrevive a uma jogada recusada (bate e volta), na animação e depois dela', () => {
    const { board, state, stage } = setup();
    board.setHint(3); // van livre
    const r = applyMove(state, { vehicle: 0 }); // o carro 0 está bloqueado pelo 1
    if (r.ok) throw new Error('deveria recusar');
    board.playMove(state, { vehicle: 0 }, r, state, () => {});
    stage.tweens.update(0.1);
    expect(board.hasHint).toBe(true); // durante a batida
    board.finishAnimations();
    expect(board.hasHint).toBe(true); // e depois dela
    const layout = computeLayout(scenario);
    const v = scenario.vehicles[3]!;
    const w = layout.toWorld(v.cx, v.cy);
    const ring = stage.scene.getObjectByName('hint-ring')!;
    expect(ring.position.x).toBeCloseTo(w.x);
    expect(ring.position.z).toBeCloseTo(w.z);
  });

  it('a dica sobrevive também a um veículo que não existe', () => {
    const { board, state } = setup();
    board.setHint(3);
    const r = applyMove(state, { vehicle: 99 });
    if (r.ok) throw new Error('deveria recusar');
    board.playMove(state, { vehicle: 99 }, r, state, () => {});
    board.finishAnimations();
    expect(board.hasHint).toBe(true);
  });

  it('o anel fica no centro do veículo da dica', () => {
    const { board, stage } = setup();
    board.setHint(2);
    const layout = computeLayout(scenario);
    const v = scenario.vehicles[2]!;
    const w = layout.toWorld(v.cx, v.cy);
    const ring = stage.scene.getObjectByName('hint-ring')!;
    expect(ring.visible).toBe(true);
    expect(ring.position.x).toBeCloseTo(w.x);
    expect(ring.position.z).toBeCloseTo(w.z);
  });

  it('a mãozinha aponta para o veículo, anima com o tempo e some com setHand(null)', () => {
    const { board, stage } = setup();
    board.setHand(2);
    const hand = stage.scene.getObjectByName('hand')!;
    const layout = computeLayout(scenario);
    const v = scenario.vehicles[2]!;
    const w = layout.toWorld(v.cx, v.cy);
    stage.frame(0.5);
    expect(hand.visible).toBe(true);
    expect(hand.position.x).toBeCloseTo(w.x);
    expect(hand.position.z).toBeCloseTo(w.z);
    const before = hand.scale.x;
    stage.frame(0.4);
    expect(hand.scale.x).not.toBeCloseTo(before);
    board.setHand(null);
    expect(hand.visible).toBe(false);
  });
});

describe('Board: confete', () => {
  it('celebrate adiciona o confete e ele sai da cena sozinho', () => {
    const { board, stage } = setup();
    const before = rootCount(stage);
    board.celebrate();
    expect(rootCount(stage)).toBe(before + 1);
    for (let t = 0; t < 2.6; t += 0.1) stage.frame(0.1);
    expect(rootCount(stage)).toBe(before);
  });

  it('hasConfetti acompanha a vida do confete', () => {
    const { board, stage } = setup();
    expect(board.hasConfetti).toBe(false);
    board.celebrate();
    expect(board.hasConfetti).toBe(true);
    for (let t = 0; t < 2.6; t += 0.1) stage.frame(0.1);
    expect(board.hasConfetti).toBe(false);
  });

  it('celebrate seguido de setLevel ou dispose não deixa objetos nem lança', () => {
    const a = setup();
    const before = rootCount(a.stage);
    a.board.celebrate();
    a.board.setLevel(scenario, createState(scenario));
    expect(rootCount(a.stage)).toBe(before);
    const b = setup();
    b.board.celebrate();
    expect(() => b.board.dispose()).not.toThrow();
    expect(b.stage.scene.children).toHaveLength(0);
  });
});

describe('Board: sons', () => {
  it('estacionar e partir tocam click e depois complete, cada um uma vez', () => {
    const { board, state, sounds } = setup();
    const r = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r, r.state, () => {});
    board.finishAnimations();
    expect(sounds).toEqual(['click', 'complete']);
  });

  it('a batida toca error só no impacto, uma vez', () => {
    const far = buildLevel(
      [veh('car', 0, 1000, 1000, 0), veh('car', 0, 9000, 1000, 0)],
      Array<number>(8).fill(0),
    );
    const { board, state, stage, sounds } = setup(far);
    const r = applyMove(state, { vehicle: 0 });
    if (r.ok) throw new Error('deveria recusar');
    const step = planMove(state, { vehicle: 0 }, r, computeLayout(far)).steps[0]!;
    if (step.kind !== 'bump') throw new Error('esperava uma batida');
    board.playMove(state, { vehicle: 0 }, r, state, () => {});
    stage.tweens.update(step.forwardDuration * 0.9);
    expect(sounds).toEqual([]);
    stage.tweens.update(step.forwardDuration * 0.2);
    expect(sounds).toEqual(['error']);
    stage.run(board);
    expect(sounds).toEqual(['error']);
  });

  it('sem vaga toca error uma vez', () => {
    const l = buildLevel(
      [veh('car', 0, 1000, 1000, 0), veh('car', 1, 1000, 3000, 0)],
      [...Array<number>(4).fill(1), ...Array<number>(4).fill(0)],
      { slotCount: 1 },
    );
    const { board, state, sounds } = setup(l);
    const first = apply(state, 0);
    board.playMove(state, { vehicle: 0 }, first, first.state, () => {});
    board.finishAnimations();
    sounds.length = 0;
    const r = applyMove(first.state, { vehicle: 1 });
    if (r.ok) throw new Error('deveria recusar');
    board.playMove(first.state, { vehicle: 1 }, r, first.state, () => {});
    board.finishAnimations();
    expect(sounds).toEqual(['error']);
  });
});

describe('Board: vaga extra', () => {
  it('setState com 5 vagas reconstrói a cena e com 4 volta ao normal', () => {
    const { board, state, stage } = setup();
    expect(board.slotCount).toBe(4);
    const calls = stage.boundsCalls.length;
    board.setState(addSlot(state));
    expect(board.slotCount).toBe(5);
    expect(stage.boundsCalls.length).toBeGreaterThan(calls);
    expect(board.viewString()).toBe('b:0,1,2,3,4,5|s:-,-,-,-,-|q:0');
    board.setState(state);
    expect(board.slotCount).toBe(4);
    expect(board.viewString()).toBe('b:0,1,2,3,4,5|s:-,-,-,-|q:0');
  });

  it('os veículos continuam nas posições certas depois de reconstruir', () => {
    const { board, state, stage } = setup();
    board.setState(addSlot(state));
    const layout = computeLayout(scenario, 5);
    for (const g of vehicleGroupsOf(stage.scene)) {
      const v = scenario.vehicles[g.userData.vehicleId as number]!;
      const w = layout.toWorld(v.cx, v.cy);
      expect(g.position.x).toBeCloseTo(w.x);
      expect(g.position.z).toBeCloseTo(w.z);
    }
  });

  it('dispose libera os efeitos e a cena fica vazia', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const { board, stage } = setup();
    board.setHint(1);
    board.setHand(2);
    board.celebrate();
    board.dispose();
    expect(geo).toHaveBeenCalled();
    expect(stage.scene.children).toHaveLength(0);
    expect(() => board.dispose()).not.toThrow();
  });
});
