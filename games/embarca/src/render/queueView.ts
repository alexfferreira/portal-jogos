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
import { ATLAS_SIZE, QUEUE_SYMBOL_SIZE, type SymbolAtlas } from './symbols';

const RADIUS = 0.12;
const BODY = 0.16;
/** Altura do centro da cápsula (de pé no chão). */
const CENTER_Y = RADIUS + BODY / 2;
/** Altura dos símbolos do modo daltônico: acima do topo da cápsula. */
const SYMBOL_Y = CENTER_Y + BODY / 2 + RADIUS + 0.05;

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
  private progress = 0;
  /** Símbolos do modo daltônico: um `InstancedMesh` por cor presente na fila. */
  private symbols: { mesh: InstancedMesh; passengers: number[] }[] = [];

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
    this.progress = queueIndex;
    this.placeSymbols();
    for (let i = 0; i < this.colors.length; i++) {
      const p = this.layout.queuePoint(i);
      const s = i < queueIndex ? 0 : 1;
      this.matrix.makeScale(s, s, s).setPosition(p.x, CENTER_Y, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Liga (com o atlas) ou desliga (`null`) os símbolos sobre cada passageiro. */
  setSymbols(atlas: SymbolAtlas | null): void {
    for (const { mesh } of this.symbols) {
      this.object.remove(mesh);
      mesh.dispose(); // só os buffers da instância: geometria e material são do atlas
    }
    this.symbols = [];
    if (atlas === null) return;
    const byColor = new Map<number, number[]>();
    this.colors.forEach((c, i) => byColor.set(c, [...(byColor.get(c) ?? []), i]));
    for (const [color, passengers] of byColor) {
      const geometry = atlas.geometries[color] ?? atlas.geometries[0];
      if (geometry === undefined) continue;
      const mesh = new InstancedMesh(geometry, atlas.material, passengers.length);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.object.add(mesh);
      this.symbols.push({ mesh, passengers });
    }
    this.placeSymbols();
  }

  /** Quantos símbolos estão visíveis (passageiros que ainda não embarcaram). */
  get visibleSymbols(): number {
    return this.symbols.reduce(
      (n, s) => n + s.passengers.filter((p) => p >= this.progress).length,
      0,
    );
  }

  private placeSymbols(): void {
    const scale = QUEUE_SYMBOL_SIZE / ATLAS_SIZE;
    for (const { mesh, passengers } of this.symbols) {
      passengers.forEach((p, k) => {
        const at = this.layout.queuePoint(p);
        const s = p < this.progress ? 0 : scale;
        this.matrix.makeScale(s, s, s).setPosition(at.x, SYMBOL_Y, at.z);
        mesh.setMatrixAt(k, this.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
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
    this.setSymbols(null);
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
