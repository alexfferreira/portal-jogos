import { BufferGeometry, Material, Matrix4, MeshBasicMaterial, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Confetti, Hand, HAND_CYCLE, handPulse, HintRing } from './effects';

afterEach(() => vi.restoreAllMocks());

describe('handPulse', () => {
  it('fica dentro dos limites ao longo de vários ciclos', () => {
    for (let t = 0; t <= 5; t += 0.05) {
      const p = handPulse(t);
      expect(p.press).toBeGreaterThanOrEqual(0.7);
      expect(p.press).toBeLessThanOrEqual(1);
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('é periódico no ciclo da mãozinha', () => {
    for (const t of [0, 0.3, 0.8, 1.1]) {
      expect(handPulse(t + HAND_CYCLE).press).toBeCloseTo(handPulse(t).press);
      expect(handPulse(t + HAND_CYCLE).alpha).toBeCloseTo(handPulse(t).alpha);
    }
  });

  it('aparece, pressiona e some dentro do ciclo', () => {
    const samples = Array.from({ length: 80 }, (_, i) => handPulse((i / 80) * HAND_CYCLE));
    expect(Math.min(...samples.map((s) => s.press))).toBeLessThan(0.9);
    expect(Math.min(...samples.map((s) => s.alpha))).toBe(0);
    expect(Math.max(...samples.map((s) => s.alpha))).toBe(1);
  });
});

describe('Hand', () => {
  it('fica visível com opacidade e some com opacidade zero', () => {
    const hand = new Hand();
    hand.set({ x: 1, z: 2 }, 0.9, 1);
    expect(hand.object.visible).toBe(true);
    expect(hand.object.position.x).toBeCloseTo(1);
    expect(hand.object.position.z).toBeCloseTo(2);
    expect(hand.object.scale.x).toBeCloseTo(0.9);
    hand.set({ x: 1, z: 2 }, 0.9, 0);
    expect(hand.object.visible).toBe(false);
    hand.set({ x: 1, z: 2 }, 1, 1);
    hand.hide();
    expect(hand.object.visible).toBe(false);
    hand.dispose();
  });

  it('dispose libera tudo e é idempotente', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mat = vi.spyOn(Material.prototype, 'dispose');
    const hand = new Hand();
    hand.dispose();
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    const calls = geo.mock.calls.length + mat.mock.calls.length;
    expect(() => hand.dispose()).not.toThrow();
    expect(geo.mock.calls.length + mat.mock.calls.length).toBe(calls);
  });
});

describe('HintRing', () => {
  it('aparece na posição pedida e some com hide', () => {
    const ring = new HintRing();
    expect(ring.object.visible).toBe(false);
    ring.show({ x: 2, z: 3 }, 0.8);
    expect(ring.object.visible).toBe(true);
    expect(ring.object.position.x).toBeCloseTo(2);
    expect(ring.object.position.z).toBeCloseTo(3);
    ring.hide();
    expect(ring.object.visible).toBe(false);
    ring.dispose();
  });

  it('pulsa: a escala muda com o tempo e é sempre positiva', () => {
    const ring = new HintRing();
    ring.show({ x: 0, z: 0 }, 1);
    ring.update(0);
    const a = ring.object.scale.x;
    ring.update(0.4);
    const b = ring.object.scale.x;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).not.toBeCloseTo(b);
    ring.dispose();
  });

  it('dispose é idempotente', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const ring = new HintRing();
    ring.dispose();
    expect(geo).toHaveBeenCalled();
    const calls = geo.mock.calls.length;
    expect(() => ring.dispose()).not.toThrow();
    expect(geo.mock.calls.length).toBe(calls);
  });
});

describe('Confetti', () => {
  const colors = [0xe53935, 0x1e63e0, 0xfdd835];
  const matrixOf = (c: Confetti, i: number): Vector3 => {
    const m = new Matrix4();
    c.mesh.getMatrixAt(i, m);
    return new Vector3().setFromMatrixPosition(m);
  };

  it('começa invisível, aparece no estouro e some sozinho', () => {
    const c = new Confetti(60);
    expect(c.done).toBe(true);
    c.start({ x: 0, z: 0 }, colors);
    expect(c.done).toBe(false);
    expect(c.mesh.visible).toBe(true);
    for (let t = 0; t < 2.3; t += 0.1) c.update(0.1);
    expect(c.done).toBe(true);
    expect(c.mesh.visible).toBe(false);
    c.dispose();
  });

  it('as peças se afastam do centro do estouro', () => {
    const c = new Confetti(40);
    c.start({ x: 1, z: -2 }, colors);
    for (let i = 0; i < 10; i++) c.update(0.05);
    let far = 0;
    for (let i = 0; i < 40; i++) {
      const p = matrixOf(c, i);
      if (Math.hypot(p.x - 1, p.z + 2) > 0.5) far++;
    }
    expect(far).toBeGreaterThan(30);
    c.dispose();
  });

  it('é determinístico: mesmas entradas, mesmas posições', () => {
    const a = new Confetti(30);
    const b = new Confetti(30);
    a.start({ x: 0, z: 0 }, colors);
    b.start({ x: 0, z: 0 }, colors);
    a.update(0.5);
    b.update(0.5);
    for (let i = 0; i < 30; i++)
      expect(matrixOf(a, i).distanceTo(matrixOf(b, i))).toBeLessThan(1e-6);
    a.dispose();
    b.dispose();
  });

  it('dispose libera geometria e material e é idempotente', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mat = vi.spyOn(Material.prototype, 'dispose');
    const c = new Confetti(10);
    c.start({ x: 0, z: 0 }, colors);
    c.dispose();
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    const calls = geo.mock.calls.length + mat.mock.calls.length;
    expect(() => c.dispose()).not.toThrow();
    expect(geo.mock.calls.length + mat.mock.calls.length).toBe(calls);
  });

  it('usa um material sem iluminação (cor por instância)', () => {
    const c = new Confetti(5);
    expect(c.mesh.material).toBeInstanceOf(MeshBasicMaterial);
    c.dispose();
  });
});
