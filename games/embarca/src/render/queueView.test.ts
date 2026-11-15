import { paletteColor } from '@recreio/core';
import { BufferGeometry, Color, Material, MeshStandardMaterial, Matrix4, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioLevel } from '../logic/testkit';
import { computeLayout } from './layout';
import { QueueView } from './queueView';

const level = scenarioLevel();
const layout = computeLayout(level);

afterEach(() => vi.restoreAllMocks());

function scaleOf(view: QueueView, i: number): number {
  const m = new Matrix4();
  view.mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixScale(m).x;
}

function positionOf(view: QueueView, i: number): Vector3 {
  const m = new Matrix4();
  view.mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixPosition(m);
}

describe('QueueView', () => {
  it('cada passageiro fica no ponto da fila do layout', () => {
    const view = new QueueView(layout, level.queue, 'high');
    for (const i of [0, 1, layout.queue.cols, level.queue.length - 1]) {
      const p = positionOf(view, i);
      expect(p.x).toBeCloseTo(layout.queuePoint(i).x);
      expect(p.z).toBeCloseTo(layout.queuePoint(i).z);
    }
    expect(view.mesh.count).toBe(level.queue.length);
    view.dispose();
  });

  it('cada instância tem a cor do passageiro na paleta', () => {
    const view = new QueueView(layout, level.queue, 'high');
    const c = new Color();
    for (const i of [0, 7, 8, 19, 20, 39]) {
      view.mesh.getColorAt(i, c);
      expect(c.getHex()).toBe(new Color(paletteColor(level.queue[i] as number).hex).getHex());
    }
    view.dispose();
  });

  it('setProgress esconde os que já embarcaram e restaura ao voltar', () => {
    const view = new QueueView(layout, level.queue, 'high');
    view.setProgress(5);
    for (let i = 0; i < 5; i++) expect(scaleOf(view, i)).toBeCloseTo(0);
    for (let i = 5; i < 8; i++) expect(scaleOf(view, i)).toBeCloseTo(1);
    view.setProgress(0);
    for (let i = 0; i < 8; i++) expect(scaleOf(view, i)).toBeCloseTo(1);
    view.dispose();
  });

  it('o voo de embarque usa a cor do passageiro e pode ser reciclado', () => {
    const view = new QueueView(layout, level.queue, 'high');
    const f = view.flyer(3);
    expect((f.material as MeshStandardMaterial).color.getHex()).toBe(
      new Color(paletteColor(level.queue[3] as number).hex).getHex(),
    );
    view.recycleFlyer(f);
    expect(f.visible).toBe(false);
    expect(view.flyer(3)).toBe(f);
    view.dispose();
  });

  it('dispose libera geometria e material e é idempotente', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mat = vi.spyOn(Material.prototype, 'dispose');
    const view = new QueueView(layout, level.queue, 'high');
    view.flyer(0);
    view.dispose();
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    const calls = geo.mock.calls.length + mat.mock.calls.length;
    expect(() => view.dispose()).not.toThrow();
    expect(geo.mock.calls.length + mat.mock.calls.length).toBe(calls);
  });
});
