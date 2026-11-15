/**
 * Fila de passageiros: uma `InstancedMesh` de cápsulas (uma chamada de desenho para toda a fila)
 * com cor por instância. Quem já embarcou fica escondido (escala 0). Para a animação de
 * embarque existe uma cápsula avulsa reutilizável (`flyer`).
 */
import { createToyMaterial, paletteColor, type Quality } from '@recreio/core';
import {
  CapsuleGeometry,
  Color,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  type BufferGeometry,
} from 'three';
import type { Layout } from './layout';

const RADIUS = 0.12;
const BODY = 0.16;
/** Altura do centro da cápsula (de pé no chão). */
const CENTER_Y = RADIUS + BODY / 2;

export class QueueView {
  readonly object = new Group();
  readonly mesh: InstancedMesh;
  private readonly geometry: BufferGeometry;
  private readonly baseMaterial: Material;
  private readonly flyerMaterials = new Map<number, Material>();
  private readonly freeFlyers: Mesh[] = [];
  private readonly allFlyers: Mesh[] = [];
  private readonly matrix = new Matrix4();
  private disposed = false;

  constructor(
    private readonly layout: Layout,
    private readonly colors: readonly number[],
    private readonly quality: Quality,
  ) {
    this.geometry = new CapsuleGeometry(RADIUS, BODY, 4, 8);
    this.baseMaterial = createToyMaterial(0xffffff, quality);
    this.mesh = new InstancedMesh(this.geometry, this.baseMaterial, colors.length);
    const color = new Color();
    colors.forEach((c, i) => {
      color.setHex(paletteColor(c).hex);
      this.mesh.setColorAt(i, color);
    });
    this.setProgress(0);
    this.object.add(this.mesh);
  }

  /** Esconde os passageiros `< queueIndex` (já embarcaram) e mostra os demais. */
  setProgress(queueIndex: number): void {
    for (let i = 0; i < this.colors.length; i++) {
      const p = this.layout.queuePoint(i);
      const s = i < queueIndex ? 0 : 1;
      this.matrix.makeScale(s, s, s).setPosition(p.x, CENTER_Y, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private material(hex: number): Material {
    let m = this.flyerMaterials.get(hex);
    if (m === undefined) {
      m = createToyMaterial(hex, this.quality);
      this.flyerMaterials.set(hex, m);
    }
    return m;
  }

  /** Cápsula avulsa com a cor do passageiro, para o voo até o veículo. */
  flyer(passenger: number): Mesh {
    const hex = paletteColor(this.colors[passenger] ?? 0).hex;
    const reused = this.freeFlyers.pop();
    const m = reused ?? new Mesh(this.geometry, this.material(hex));
    m.material = this.material(hex);
    m.visible = true;
    if (reused === undefined) {
      this.allFlyers.push(m);
      this.object.add(m);
    }
    return m;
  }

  recycleFlyer(m: Mesh): void {
    m.visible = false;
    this.freeFlyers.push(m);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.allFlyers) this.object.remove(m);
    this.object.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.baseMaterial.dispose();
    for (const m of this.flyerMaterials.values()) m.dispose();
    this.flyerMaterials.clear();
    this.allFlyers.length = 0;
    this.freeFlyers.length = 0;
  }
}
