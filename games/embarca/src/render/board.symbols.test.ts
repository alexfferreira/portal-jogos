import { BufferGeometry, MeshBasicMaterial, PlaneGeometry, Texture, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createState, type MoveApplied, type State } from '../logic';
import { level as buildLevel, scenarioLevel, veh } from '../logic/testkit';
import { Board } from './board';
import { FakeStage } from './fakeStage';
import { vehicleSymbolSpot, type SymbolAtlas } from './symbols';

afterEach(() => vi.restoreAllMocks());

const scenario = scenarioLevel();

/** Atlas falso (sem canvas): um plano por símbolo, como o real, e contagem de liberações. */
function fakeAtlas(log: { created: number; disposed: number }): SymbolAtlas {
  log.created++;
  const geometries = Array.from({ length: 15 }, () =>
    new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
  );
  const texture = new Texture();
  const material = new MeshBasicMaterial();
  return {
    geometries,
    texture,
    material,
    dispose() {
      log.disposed++;
      for (const g of geometries) g.dispose();
      texture.dispose();
      material.dispose();
    },
  };
}

function setup(level = scenario) {
  const stage = new FakeStage();
  const log = { created: 0, disposed: 0 };
  const board = new Board({ stage, quality: 'high', atlas: () => fakeAtlas(log) });
  const state = createState(level);
  board.setLevel(level, state);
  return { stage, board, state, log };
}

const apply = (state: State, vehicle: number): MoveApplied => {
  const r = applyMove(state, { vehicle });
  if (!r.ok) throw new Error(`recusada: ${r.reason}`);
  return r;
};

const symbolMeshes = (root: Object3D): Object3D[] => {
  const out: Object3D[] = [];
  root.traverse((o) => {
    if (o.name === 'symbol') out.push(o);
  });
  return out;
};

describe('Board: modo daltônico', () => {
  it('desligado não mostra símbolo nenhum', () => {
    const { board, stage } = setup();
    expect(board.visibleSymbols()).toBe(0);
    expect(symbolMeshes(stage.scene)).toHaveLength(0);
  });

  it('ligado mostra um símbolo em cada veículo e em cada passageiro da fila', () => {
    const { board } = setup();
    board.setColorblind(true);
    expect(board.visibleSymbols()).toBe(scenario.vehicles.length + scenario.queue.length);
    board.setColorblind(false);
    expect(board.visibleSymbols()).toBe(0);
  });

  it('os símbolos dos veículos ficam no ponto calculado para o tipo', () => {
    const { board, stage } = setup();
    board.setColorblind(true);
    const spots = new Set(scenario.vehicles.map((v) => vehicleSymbolSpot(v.kind).x.toFixed(4)));
    const onVehicles = symbolMeshes(stage.scene).filter(
      (m) => m.parent?.userData.vehicleId !== undefined,
    );
    expect(onVehicles).toHaveLength(scenario.vehicles.length);
    for (const m of onVehicles) expect(spots.has(m.position.x.toFixed(4))).toBe(true);
  });

  it('o símbolo se mantém em pé: gira ao contrário do veículo', () => {
    const { board, stage } = setup();
    board.setColorblind(true);
    stage.frame(0.016);
    for (const m of symbolMeshes(stage.scene)) {
      const parent = m.parent;
      if (parent?.userData.vehicleId === undefined) continue;
      expect(m.rotation.y).toBeCloseTo(-parent.rotation.y);
    }
  });

  it('depois de uma jogada os símbolos dos que embarcaram e do veículo que partiu somem', () => {
    const { board, state } = setup();
    board.setColorblind(true);
    const r = apply(state, 1); // carro cor 0: embarca 4 passageiros e parte
    board.playMove(state, { vehicle: 1 }, r, r.state, () => {});
    board.finishAnimations();
    expect(board.visibleSymbols()).toBe(5 + 36);
  });

  it('trocar de fase com o modo ligado refaz os símbolos da fase nova', () => {
    const { board } = setup();
    board.setColorblind(true);
    const other = buildLevel(
      [veh('car', 0, 1000, 1000, 0), veh('car', 1, 1000, 3000, 0)],
      [...Array<number>(4).fill(0), ...Array<number>(4).fill(1)],
    );
    board.setLevel(other, createState(other));
    expect(board.visibleSymbols()).toBe(2 + 8);
  });

  it('ligar e desligar várias vezes libera o atlas toda vez e não deixa objetos', () => {
    const { board, stage, log } = setup();
    for (let i = 0; i < 5; i++) {
      board.setColorblind(true);
      board.setColorblind(false);
    }
    expect(log.created).toBe(5);
    expect(log.disposed).toBe(5);
    expect(symbolMeshes(stage.scene)).toHaveLength(0);
    board.setColorblind(true);
    board.dispose();
    expect(log.disposed).toBe(6);
    expect(stage.scene.children).toHaveLength(0);
  });

  it('ligar duas vezes seguidas não cria dois atlas', () => {
    const { board, log } = setup();
    board.setColorblind(true);
    board.setColorblind(true);
    expect(log.created).toBe(1);
  });

  it('sem o atlas (Node sem canvas) ligar o modo não lança e não mostra nada', () => {
    const stage = new FakeStage();
    const board = new Board({ stage, quality: 'high' });
    board.setLevel(scenario, createState(scenario));
    expect(() => board.setColorblind(true)).not.toThrow();
    expect(board.visibleSymbols()).toBe(0);
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    board.dispose();
    expect(geo).toHaveBeenCalled();
  });
});
