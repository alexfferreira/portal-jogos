import { BufferGeometry, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createState, type MoveApplied, type MoveRejected, type State } from '../logic';
import { level as buildLevel, scenarioLevel, veh } from '../logic/testkit';
import { Board } from './board';
import { FakeStage, vehicleGroupsOf } from './fakeStage';
import { computeLayout } from './layout';
import { PARKED_HEADING, planMove } from './plan';

afterEach(() => vi.restoreAllMocks());

const scenario = scenarioLevel();

function setup(level = scenario) {
  const stage = new FakeStage();
  const layouts: { id: number }[][] = [];
  const sounds: string[] = [];
  const board = new Board({
    stage,
    quality: 'high',
    onLayout: (boxes) => layouts.push(boxes),
    sfx: (name) => sounds.push(name),
  });
  const state = createState(level);
  board.setLevel(level, state);
  return { stage, board, state, layouts, sounds };
}

const apply = (state: State, vehicle: number): MoveApplied => {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`recusada: ${r.reason}`);
  return r;
};

const vehicleGroups = (root: Object3D): Object3D[] => vehicleGroupsOf(root);

describe('Board: montagem', () => {
  it('setLevel cria um veículo por id e enquadra o conteúdo', () => {
    const { stage } = setup();
    const layout = computeLayout(scenario);
    expect(vehicleGroups(stage.scene)).toHaveLength(6);
    expect(stage.boundsCalls.at(-1)).toEqual({ width: layout.width, depth: layout.depth });
  });

  it('setState coloca cada veículo no centro do mundo com a direção certa', () => {
    const { stage } = setup();
    const layout = computeLayout(scenario);
    for (const g of vehicleGroups(stage.scene)) {
      const v = scenario.vehicles[g.userData.vehicleId as number]!;
      const w = layout.toWorld(v.cx, v.cy);
      expect(g.position.x).toBeCloseTo(w.x);
      expect(g.position.z).toBeCloseTo(w.z);
      expect(g.rotation.y).toBeCloseTo((v.angle * Math.PI) / 180);
      expect(g.visible).toBe(true);
    }
    expect(setup().board.viewString()).toBe('b:0,1,2,3,4,5|s:-,-,-,-|q:0');
  });
});

describe('Board: jogadas', () => {
  it('foco 1: terminar a animação na hora deixa o visual igual ao estado, e onDone vem uma vez', () => {
    const { board, state } = setup();
    const r = apply(state, 1);
    const onDone = vi.fn();
    board.playMove(state, { vehicle: 1 }, r, r.state, onDone);
    expect(board.animating).toBe(true);
    expect(board.viewString()).toBe('b:0,1,2,3,4,5|s:-,-,-,-|q:0');
    board.finishAnimations();
    expect(board.animating).toBe(false);
    expect(board.viewString()).toBe('b:0,2,3,4,5|s:-,-,-,-|q:4');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rodando o relógio até o fim o resultado é o mesmo', () => {
    const { board, state, stage } = setup();
    const r = apply(state, 1);
    const onDone = vi.fn();
    board.playMove(state, { vehicle: 1 }, r, r.state, onDone);
    stage.run(board);
    expect(board.viewString()).toBe('b:0,2,3,4,5|s:-,-,-,-|q:4');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(board.animating).toBe(false);
  });

  it('interromper e jogar de novo não corrompe o visual', () => {
    const { board, state } = setup();
    const first = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, first, first.state, () => {});
    board.finishAnimations(); // o toque seguinte termina a animação antes de valer
    const second = apply(first.state, 0);
    board.playMove(first.state, { vehicle: 0 }, second, second.state, () => {});
    board.finishAnimations();
    expect(board.viewString()).toBe('b:2,3,4,5|s:-,-,-,-|q:8');
  });

  it('durante o deslocamento o veículo passa por cima dos outros e termina no chão', () => {
    const { board, state, stage } = setup();
    const r = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r, r.state, () => {});
    const group = vehicleGroups(stage.scene).find((g) => g.userData.vehicleId === 1)!;
    let maxY = 0;
    for (let t = 0; board.animating && t < 20; t += 0.05) {
      stage.tweens.update(0.05);
      maxY = Math.max(maxY, group.position.y);
    }
    // Mais alto que o ônibus (~0,8): nenhum veículo atravessa o outro.
    expect(maxY).toBeGreaterThanOrEqual(0.9);
    expect(board.animating).toBe(false);
  });

  it('um veículo que estaciona sem embarque fica na vaga com os assentos vazios', () => {
    const { board, state, stage } = setup();
    const r = apply(state, 4); // ônibus: a fila começa em cor 0, ninguém embarca
    board.playMove(state, { vehicle: 4 }, r, r.state, () => {});
    board.finishAnimations();
    expect(board.viewString()).toBe('b:0,1,2,3,5|s:4,-,-,-|q:0');
    // Estacionado de frente para a fila de passageiros (para baixo na tela).
    const bus = vehicleGroups(stage.scene).find((g) => g.userData.vehicleId === 4)!;
    expect(bus.rotation.y).toBeCloseTo(PARKED_HEADING);
  });

  it('bater e voltar com o bloqueador longe: chega ao contato antes de voltar', () => {
    const far = buildLevel(
      [veh('car', 0, 1000, 1000, 0), veh('car', 0, 9000, 1000, 0)],
      Array<number>(8).fill(0),
    );
    const { board, state, stage } = setup(far);
    const r = applyMove(state, { vehicle: 0 });
    if (r.ok) throw new Error('deveria recusar');
    const step = planMove(state, { vehicle: 0 }, r, computeLayout(far)).steps[0]!;
    if (step.kind !== 'bump') throw new Error('esperava uma batida');
    expect(step.forward).toBeGreaterThan(5); // bem mais que o antigo teto de 1,2
    const group = vehicleGroups(stage.scene).find((g) => g.userData.vehicleId === 0)!;
    const home = group.position.clone();
    board.playMove(state, { vehicle: 0 }, r, state, () => {});
    stage.tweens.update(step.forwardDuration); // o instante do impacto
    expect(group.position.distanceTo(home)).toBeGreaterThan(step.forward - 0.05);
    stage.run(board);
    expect(group.position.distanceTo(home)).toBeLessThan(1e-6);
  });

  it('bater e voltar: o veículo volta ao lugar e o visual não muda', () => {
    const { board, state, stage } = setup();
    const r = applyMove(state, { vehicle: 0 });
    if (r.ok) throw new Error('deveria recusar');
    const rejected: MoveRejected = r;
    const before = board.viewString();
    const group = vehicleGroups(stage.scene).find((g) => g.userData.vehicleId === 0)!;
    const home = group.position.clone();
    const onDone = vi.fn();
    board.playMove(state, { vehicle: 0 }, rejected, state, onDone);
    stage.tweens.update(0.15); // meio da batida: o veículo andou
    expect(group.position.distanceTo(home)).toBeGreaterThan(0.01);
    stage.run(board);
    expect(group.position.distanceTo(home)).toBeLessThan(1e-6);
    expect(board.viewString()).toBe(before);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('Board: picking', () => {
  it('pick acerta o centro do veículo e devolve null num canto vazio', () => {
    const { board } = setup();
    const boxes = board.screenBoxes();
    expect(boxes).toHaveLength(6);
    const b = boxes.find((x) => x.id === 2)!;
    expect(board.pick(b.x + b.w / 2, b.y + b.h / 2)).toBe(2);
    expect(board.pick(2, 2)).toBeNull();
  });

  it('depois que o veículo sai, o toque nele não escolhe mais', () => {
    const { board, state } = setup();
    const before = board.screenBoxes().find((x) => x.id === 1)!;
    const r = apply(state, 1);
    board.playMove(state, { vehicle: 1 }, r, r.state, () => {});
    board.finishAnimations();
    expect(board.pick(before.x + before.w / 2, before.y + before.h / 2)).not.toBe(1);
  });
});

describe('Board: troca de fase e limpeza', () => {
  it('foco 5: setLevel descarta o onDone da fase antiga e mostra a nova', () => {
    const { board, state, stage } = setup();
    const r = apply(state, 1);
    const onDone = vi.fn();
    board.playMove(state, { vehicle: 1 }, r, r.state, onDone);
    const other = buildLevel(
      [veh('car', 0, 1000, 1000, 0), veh('car', 1, 1000, 3000, 0)],
      [...Array<number>(4).fill(0), ...Array<number>(4).fill(1)],
    );
    board.setLevel(other, createState(other));
    stage.run(board);
    stage.tweens.update(5);
    expect(onDone).not.toHaveBeenCalled();
    expect(board.animating).toBe(false);
    expect(board.viewString()).toBe('b:0,1|s:-,-,-,-|q:0');
    expect(vehicleGroups(stage.scene)).toHaveLength(2);
  });

  it('dispose duas vezes não lança e libera as geometrias', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const { board, stage } = setup();
    board.dispose();
    expect(geo).toHaveBeenCalled();
    expect(stage.scene.children).toHaveLength(0);
    expect(() => board.dispose()).not.toThrow();
  });

  it('onLayout republica os retângulos quando o canvas muda de tamanho', () => {
    const { stage, layouts } = setup();
    const n = layouts.length;
    stage.resize(800, 390);
    expect(layouts.length).toBeGreaterThan(n);
  });
});
