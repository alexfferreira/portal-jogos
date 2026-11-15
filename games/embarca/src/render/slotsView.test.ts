import { BufferGeometry, Material, type Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioLevel } from '../logic/testkit';
import { computeLayout } from './layout';
import { SlotsView } from './slotsView';

const level = scenarioLevel();
const layout = computeLayout(level);

afterEach(() => vi.restoreAllMocks());

describe('SlotsView', () => {
  it('uma placa por vaga, no centro da vaga do layout', () => {
    const view = new SlotsView(layout, level, 'high');
    expect(view.plates).toHaveLength(4);
    view.plates.forEach((plate, i) => {
      expect(plate.position.x).toBeCloseTo(layout.slotCenter(i).x);
      expect(plate.position.z).toBeCloseTo(layout.slotCenter(i).z);
    });
    view.dispose();
  });

  it('com o layout de 5 vagas há 5 placas', () => {
    const view = new SlotsView(computeLayout(level, 5), level, 'high');
    expect(view.plates).toHaveLength(5);
    view.dispose();
  });

  it('mostra os assentos do veículo estacionado, cheios e vazios', () => {
    const view = new SlotsView(layout, level, 'high');
    expect(view.pipSummary().every((p) => p.total === 0)).toBe(true);
    view.setSlots([{ vehicle: 0, filled: 2 }, null, null, null]); // carro: 4 assentos
    expect(view.pipSummary()[0]).toEqual({ slot: 0, filled: 2, total: 4 });
    expect(view.pipSummary()[1]).toEqual({ slot: 1, filled: 0, total: 0 });
    view.setSlots([{ vehicle: 4, filled: 10 }, null, null, null]); // ônibus: 10 assentos
    expect(view.pipSummary()[0]).toEqual({ slot: 0, filled: 10, total: 10 });
    view.setSlots([null, null, null, null]);
    expect(view.pipSummary().every((p) => p.total === 0)).toBe(true);
    view.dispose();
  });

  it('os indicadores ficam dentro da largura da vaga', () => {
    const view = new SlotsView(layout, level, 'high');
    view.setSlots([{ vehicle: 4, filled: 0 }, null, null, null]); // ônibus: o mais largo
    const slot = layout.slots[0]!;
    for (let seat = 0; seat < 10; seat++) {
      const p = view.pipPoint(0, seat);
      expect(Math.abs(p.x - slot.x)).toBeLessThanOrEqual(slot.width / 2);
    }
    view.dispose();
  });

  it('os indicadores ficam acima do teto do maior veículo (não somem sob a carroceria)', () => {
    const view = new SlotsView(layout, level, 'high');
    view.setSlots([{ vehicle: 4, filled: 3 }, null, null, null]); // ônibus
    const visible: number[] = [];
    view.object.traverse((o) => {
      if (o.visible && o.type === 'Mesh' && !view.plates.includes(o as Mesh))
        visible.push(o.position.y);
    });
    expect(visible).toHaveLength(10);
    for (const y of visible) expect(y).toBeGreaterThanOrEqual(0.9);
    view.dispose();
  });

  it('dispose libera tudo e é idempotente', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mat = vi.spyOn(Material.prototype, 'dispose');
    const view = new SlotsView(layout, level, 'high');
    view.setSlots([{ vehicle: 0, filled: 1 }, null, null, null]);
    view.dispose();
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    const calls = geo.mock.calls.length + mat.mock.calls.length;
    expect(() => view.dispose()).not.toThrow();
    expect(geo.mock.calls.length + mat.mock.calls.length).toBe(calls);
  });
});
