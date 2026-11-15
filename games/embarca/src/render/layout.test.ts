import { fitOrthographic } from '@recreio/core';
import { describe, expect, it } from 'vitest';
import { createState } from '../logic';
import { level, scenarioLevel, veh } from '../logic/testkit';
import {
  computeLayout,
  contactDistance,
  pickVehicle,
  PICK_RADIUS_PX,
  QUEUE_SPACING,
  type Layout,
  type PickView,
} from './layout';

const scenario = scenarioLevel();
const layout = computeLayout(scenario);
const eight = Array<number>(8).fill(0);

/** Visão do canvas em px com o meio-frustum que a câmera `ortho-top` usaria. */
function viewFor(l: Layout, width: number, height: number): PickView {
  const { halfWidth, halfHeight } = fitOrthographic(
    { width: l.width, depth: l.depth },
    width / height,
  );
  return { width, height, halfWidth, halfHeight };
}

/** Pixel em que um ponto do mundo (X, Z) aparece na tela. */
function toPx(view: PickView, x: number, z: number): [number, number] {
  return [
    (x / (2 * view.halfWidth) + 0.5) * view.width,
    (z / (2 * view.halfHeight) + 0.5) * view.height,
  ];
}

describe('computeLayout', () => {
  it('mapeia o tabuleiro para o mundo, com y da lógica subindo na tela', () => {
    expect(layout.width).toBeCloseTo(10.6);
    const c = layout.toWorld(5000, 5000);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(layout.board.cz);
    expect(layout.toWorld(0, 10000).x).toBeCloseTo(-5);
    expect(layout.toWorld(10000, 0).x).toBeCloseTo(5);
    const a = layout.toWorld(3000, 3000);
    const b = layout.toWorld(3000, 4000);
    expect(a.z - b.z).toBeCloseTo(1);
  });

  it('empilha tabuleiro, vagas e fila dentro do enquadramento, sem sobrepor', () => {
    const half = layout.depth / 2;
    const boardTop = layout.board.cz - layout.board.depth / 2;
    const boardBottom = layout.board.cz + layout.board.depth / 2;
    expect(boardTop).toBeGreaterThanOrEqual(-half - 1e-9);
    expect(layout.slots).toHaveLength(4);
    for (const s of layout.slots) {
      expect(s.z - 1.3).toBeGreaterThanOrEqual(boardBottom);
      expect(s.z + 1.3).toBeLessThanOrEqual(half + 1e-9);
    }
    const slotBottom = (layout.slots[0]?.z ?? 0) + 1.3;
    expect(layout.queuePoint(0).z).toBeGreaterThan(slotBottom);
    const last = layout.queuePoint(layout.queue.count - 1);
    expect(last.z).toBeLessThanOrEqual(half + 1e-9);
  });

  it('vagas com larguras iguais, da esquerda para a direita', () => {
    const widths = new Set(layout.slots.map((s) => s.width.toFixed(6)));
    expect(widths.size).toBe(1);
    for (let i = 1; i < layout.slots.length; i++) {
      expect((layout.slots[i]?.x ?? 0) > (layout.slots[i - 1]?.x ?? 0)).toBe(true);
    }
    expect(layout.slotCenter(2)).toEqual({ x: layout.slots[2]?.x, z: layout.slots[2]?.z });
    expect(computeLayout(scenario, 5).slots).toHaveLength(5);
  });

  it('a fila cabe em linhas, da esquerda para a direita e de cima para baixo', () => {
    expect(layout.queue.count).toBe(40);
    expect(layout.queue.cols * layout.queue.rows).toBeGreaterThanOrEqual(40);
    const p0 = layout.queuePoint(0);
    const p1 = layout.queuePoint(1);
    expect(p1.x - p0.x).toBeCloseTo(QUEUE_SPACING);
    expect(p1.z).toBeCloseTo(p0.z);
    const next = layout.queuePoint(layout.queue.cols);
    expect(next.x).toBeCloseTo(p0.x);
    expect(next.z - p0.z).toBeCloseTo(QUEUE_SPACING);
  });
});

describe('pickVehicle', () => {
  const view = viewFor(layout, 390, 800);
  const all = createState(scenario).onBoard;

  const centerPx = (id: number): [number, number] => {
    const v = scenario.vehicles[id]!;
    const w = layout.toWorld(v.cx, v.cy);
    return toPx(view, w.x, w.z);
  };

  it('toque no centro escolhe o veículo', () => {
    for (const id of all) {
      const [px, py] = centerPx(id);
      expect(pickVehicle(scenario, all, layout, view, px, py)).toBe(id);
    }
  });

  it('toque poucos px fora da borda ainda escolhe (raio generoso)', () => {
    // O carro 1 está em (6000,1500) a 0°: a borda direita fica a 600 milésimos do centro.
    const v = scenario.vehicles[1]!;
    const edge = layout.toWorld(v.cx + 600, v.cy);
    const [px, py] = toPx(view, edge.x, edge.z);
    expect(pickVehicle(scenario, all, layout, view, px + 10, py)).toBe(1);
  });

  it('toque a mais de 22 px de todos devolve null', () => {
    expect(PICK_RADIUS_PX).toBe(22);
    const corner = layout.toWorld(300, 9700); // canto vazio do tabuleiro
    const [px, py] = toPx(view, corner.x, corner.z);
    expect(pickVehicle(scenario, all, layout, view, px, py)).toBeNull();
  });

  it('veículo fora do tabuleiro nunca é devolvido', () => {
    const [px, py] = centerPx(0);
    const without = all.filter((id) => id !== 0);
    expect(pickVehicle(scenario, without, layout, view, px, py)).not.toBe(0);
  });

  it('entre dois veículos equidistantes vale o mais à frente (mais embaixo na tela)', () => {
    const l = level([veh('car', 0, 2000, 3500, 0), veh('car', 0, 2000, 4500, 0)], eight);
    const lay = computeLayout(l);
    const v = viewFor(lay, 390, 800);
    const mid = lay.toWorld(2000, 4000);
    const [px, py] = toPx(v, mid.x, mid.z);
    // O de y menor na lógica fica embaixo na tela (z maior): é o carro 0.
    expect(pickVehicle(l, [0, 1], lay, v, px, py)).toBe(0);
  });

  it('perto da ponta de um ônibus vale o ônibus, mesmo com um carro de centro mais próximo', () => {
    // Ônibus (centro 3000, ponta em 4200) e um carro com a traseira a 300 da ponta. O toque
    // em x = 4250 está a 50 do ônibus e a 250 do carro, mas mais perto do centro do carro.
    const l = level(
      [veh('bus', 0, 3000, 5000, 0), veh('car', 1, 5100, 5000, 0)],
      [...Array<number>(10).fill(0), ...Array<number>(4).fill(1)],
    );
    const lay = computeLayout(l);
    const v = viewFor(lay, 390, 800);
    const tap = lay.toWorld(4250, 5000);
    const [px, py] = toPx(v, tap.x, tap.z);
    expect(pickVehicle(l, [0, 1], lay, v, px, py)).toBe(0);
  });

  it('toque nas vagas e na fila devolve null', () => {
    const slot = layout.slotCenter(1);
    const [sx, sy] = toPx(view, slot.x, slot.z);
    expect(pickVehicle(scenario, all, layout, view, sx, sy)).toBeNull();
    const q = layout.queuePoint(3);
    const [qx, qy] = toPx(view, q.x, q.z);
    expect(pickVehicle(scenario, all, layout, view, qx, qy)).toBeNull();
  });

  it('o mesmo ponto do mundo escolhe o mesmo veículo em 390×800 e 800×390', () => {
    const wide = viewFor(layout, 800, 390);
    for (const id of all) {
      const v = scenario.vehicles[id]!;
      const w = layout.toWorld(v.cx, v.cy);
      const [ax, ay] = toPx(view, w.x, w.z);
      const [bx, by] = toPx(wide, w.x, w.z);
      expect(pickVehicle(scenario, all, layout, view, ax, ay)).toBe(id);
      expect(pickVehicle(scenario, all, layout, wide, bx, by)).toBe(id);
    }
  });
});

describe('contactDistance', () => {
  it('de frente com outro carro: contato quando as frentes se encontram', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], eight);
    expect(contactDistance(l, 0, [1], [0, 1], 10000)).toBe(2800);
  });

  it('com obstáculo à frente', () => {
    const l = level([veh('car', 0, 1000, 1000, 0)], [0, 0, 0, 0], {
      obstacles: [{ cx: 5000, cy: 1000, w: 600, h: 600, angle: 0 }],
    });
    expect(contactDistance(l, 0, [], [0], 10000)).toBe(3100);
  });

  it('sem bloqueador devolve o deslocamento máximo, sempre inteiro e dentro de 0..max', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 1000, 3000, 0)], eight);
    expect(contactDistance(l, 0, [], [0, 1], 4000)).toBe(4000);
    const d = contactDistance(scenario, 0, [1], [0, 1, 2, 3, 4, 5], 7777);
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(7777);
  });

  it('ignora bloqueadores que já saíram do tabuleiro', () => {
    const l = level([veh('car', 0, 1000, 1000, 0), veh('car', 0, 5000, 1000, 0)], eight);
    expect(contactDistance(l, 0, [1], [0], 6000)).toBe(6000);
  });
});
