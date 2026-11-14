/**
 * Geometrias e materiais compartilhados da cena. Tudo é criado uma vez (por montagem ou por
 * capacidade de tubo) e reaproveitado por todos os tubos e unidades.
 */
import { PALETTE, type Quality } from '@recreio/core';
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  LatheGeometry,
  Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three';
import { TUBE, tubeHeight } from './layout';
import { createSymbolAtlas, type SymbolAtlas } from './symbols';
import { createBottomUnitGeometry } from './unitGeometry';

/** Raio do líquido (um pouco menor que o do vidro). */
export const LIQUID_RADIUS = TUBE.radius - 0.075;

/** Geometrias que dependem da capacidade do tubo. */
export interface CapacityAssets {
  capacity: number;
  glass: BufferGeometry;
  highlight: BufferGeometry;
  halo: BufferGeometry;
}

const NEUTRAL = 0x9aa6b8;

export class Assets {
  readonly quality: Quality;
  /** Líquido por cor da PALETTE. */
  readonly liquid: Material[];
  /** Camada oculta ("?"). */
  readonly hiddenUnit: Material;
  readonly glass: Material;
  readonly rim: Material | null;
  readonly highlight: Material;
  readonly shine: Material;
  readonly shadow: MeshBasicMaterial;
  readonly symbolMaterial: MeshBasicMaterial;
  readonly atlas: SymbolAtlas;
  /** Unidade de líquido: com fundo arredondado (base do tubo) e cilíndrica (demais). */
  readonly unitBottom: BufferGeometry;
  readonly unitMid: BufferGeometry;
  /** Disco da superfície do líquido e brilho do topo. */
  readonly surface: BufferGeometry;
  readonly rimGeometry: BufferGeometry | null;
  readonly cap: BufferGeometry;
  readonly stream: BufferGeometry;
  readonly shadowGeometry: PlaneGeometry;
  private readonly shadowTexture: CanvasTexture;
  private perCapacity: CapacityAssets | null = null;
  private disposed = false;

  constructor(quality: Quality) {
    this.quality = quality;
    const high = quality === 'high';
    const radial = high ? 32 : 14;
    const segs = high ? 20 : 12;

    const liquidMaterial = (hex: number): Material => {
      const color = new Color(hex);
      // Um toque de emissão mantém a cor saturada mesmo sob a luz do palco.
      const emissive = color.clone().multiplyScalar(0.18);
      return high
        ? new MeshStandardMaterial({ color, emissive, roughness: 0.32, metalness: 0 })
        : new MeshLambertMaterial({ color, emissive });
    };
    this.liquid = PALETTE.map((p) => liquidMaterial(p.hex));
    this.hiddenUnit = liquidMaterial(NEUTRAL);

    this.glass = high
      ? new MeshStandardMaterial({
          color: 0xe4f4ff,
          roughness: 0.06,
          metalness: 0,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        })
      : new MeshBasicMaterial({
          color: 0xe4f4ff,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        });
    this.rim = high
      ? new MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.15,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      : null;
    this.highlight = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.shine = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });

    // Geometrias de unidade, com a origem na base (a escala em Y cresce para cima).
    const rl = LIQUID_RADIUS;
    const uh = TUBE.unitHeight;
    // Sem tampo no perfil: veja `unitGeometry.ts` (o tampo deixava o segmento de baixo mais claro).
    this.unitBottom = createBottomUnitGeometry(rl, uh, high ? 8 : 5, radial);
    this.unitMid = new CylinderGeometry(rl, rl, uh, radial, 1, false).translate(0, uh / 2, 0);
    // A superfície fecha o topo aberto do segmento; raio igual ao da unidade, sem fresta.
    this.surface = new CircleGeometry(rl, radial).rotateX(-Math.PI / 2);
    this.rimGeometry = high
      ? new TorusGeometry(TUBE.radius - 0.02, 0.034, 6, radial).rotateX(Math.PI / 2)
      : null;

    const capProfile = [
      new Vector2(0, 0),
      new Vector2(0.32, 0),
      new Vector2(0.34, 0.1),
      new Vector2(0.3, 0.2),
      new Vector2(0.18, 0.27),
      new Vector2(0, 0.29),
    ];
    this.cap = new LatheGeometry(capProfile, radial);
    this.stream = new CylinderGeometry(0.075, 0.075, 1, segs > 12 ? 10 : 6, 1, true).translate(
      0,
      0.5,
      0,
    );

    this.atlas = createSymbolAtlas(high ? 128 : 64);
    this.symbolMaterial = new MeshBasicMaterial({
      map: this.atlas.texture,
      transparent: true,
      depthWrite: false,
    });

    // Sombra de contato: mancha radial macia sob cada tubo.
    this.shadowTexture = radialTexture();
    this.shadowGeometry = new PlaneGeometry(1.5, 0.5);
    this.shadow = new MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
  }

  /** Geometrias para uma capacidade (cache de uma; trocar de capacidade libera a anterior). */
  forCapacity(capacity: number): CapacityAssets {
    if (this.perCapacity?.capacity === capacity) return this.perCapacity;
    this.disposeCapacity();
    const high = this.quality === 'high';
    const radial = high ? 32 : 14;
    const R = TUBE.radius;
    const H = tubeHeight(capacity);

    const points: Vector2[] = [];
    const arc = high ? 10 : 6;
    for (let i = 0; i <= arc; i++) {
      const a = -Math.PI / 2 + (i / arc) * (Math.PI / 2);
      points.push(new Vector2(Math.cos(a) * R, R + Math.sin(a) * R));
    }
    points[0] = new Vector2(0, 0);
    points.push(new Vector2(R, H));
    const glass = new LatheGeometry(points, radial);

    const highlight = new PlaneGeometry(0.075, H * 0.72).translate(0, R + (H * 0.72) / 2 - 0.05, 0);

    const w = R * 2 + 0.32;
    const hw = w / 2;
    const top = H + 0.32;
    const shape = new Shape();
    shape.moveTo(-hw, hw - 0.16);
    shape.lineTo(-hw, top - 0.16 - hw);
    shape.absarc(0, top - 0.16 - hw, hw, Math.PI, 0, true);
    shape.lineTo(hw, hw - 0.16);
    shape.absarc(0, hw - 0.16, hw, 0, Math.PI, true);
    const halo = new ShapeGeometry(shape, 10);

    this.perCapacity = { capacity, glass, highlight, halo };
    return this.perCapacity;
  }

  private disposeCapacity(): void {
    if (!this.perCapacity) return;
    this.perCapacity.glass.dispose();
    this.perCapacity.highlight.dispose();
    this.perCapacity.halo.dispose();
    this.perCapacity = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCapacity();
    for (const m of this.liquid) m.dispose();
    for (const m of [
      this.hiddenUnit,
      this.glass,
      this.rim,
      this.highlight,
      this.shine,
      this.shadow,
      this.symbolMaterial,
    ]) {
      m?.dispose();
    }
    for (const g of [
      this.unitBottom,
      this.unitMid,
      this.surface,
      this.rimGeometry,
      this.cap,
      this.stream,
      this.shadowGeometry,
    ]) {
      g?.dispose();
    }
    this.atlas.dispose();
    this.shadowTexture.dispose();
  }
}

/** Textura radial branco → transparente (usada pela sombra de contato e pelo brilho). */
function radialTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(40,60,100,0.9)');
    g.addColorStop(1, 'rgba(40,60,100,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}
