/**
 * Veículos 3D procedurais, estilo "brinquedo": corpo e cabine de cantos arredondados, rodas e
 * uma seta no teto. As geometrias e os materiais são compartilhados entre os veículos pela
 * `VehicleAssets` (uma só liberação no `dispose`).
 */
import { createToyMaterial, paletteColor, type Quality } from '@recreio/core';
import {
  BufferGeometry,
  CylinderGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  Shape,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VEHICLE_SPECS, type Vehicle, type VehicleKind } from '../logic';
import { UNIT, type WorldPoint } from './layout';

interface Look {
  /** Altura do corpo e da cabine. */
  body: number;
  cabin: number;
  /** Fração do comprimento ocupada pela cabine e seu deslocamento (fração do comprimento). */
  cabinLength: number;
  cabinShift: number;
  /** Posições das rodas ao longo do comprimento (fração do comprimento). */
  axles: number[];
}

const LOOKS: Record<VehicleKind, Look> = {
  car: { body: 0.28, cabin: 0.2, cabinLength: 0.5, cabinShift: -0.06, axles: [-0.3, 0.3] },
  van: { body: 0.38, cabin: 0.22, cabinLength: 0.6, cabinShift: -0.1, axles: [-0.3, 0.3] },
  bus: { body: 0.5, cabin: 0.2, cabinLength: 0.9, cabinShift: 0, axles: [-0.32, 0, 0.32] },
};

const WHEEL_RADIUS = 0.1;
const WHEEL_WIDTH = 0.08;
const DARK = 0x2f3640;
const LIGHT = 0xffffff;

/** Fábrica com cache de geometrias e materiais compartilhados. */
export class VehicleAssets {
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly materials = new Map<string, Material>();

  get stats(): { geometries: number; materials: number } {
    return { geometries: this.geometries.size, materials: this.materials.size };
  }

  private geometry(key: string, make: () => BufferGeometry): BufferGeometry {
    let g = this.geometries.get(key);
    if (g === undefined) {
      g = make();
      this.geometries.set(key, g);
    }
    return g;
  }

  body(kind: VehicleKind): BufferGeometry {
    const spec = VEHICLE_SPECS[kind];
    return this.geometry(
      `body:${kind}`,
      () => new RoundedBoxGeometry(spec.length / UNIT, LOOKS[kind].body, spec.width / UNIT, 3, 0.1),
    );
  }

  cabin(kind: VehicleKind): BufferGeometry {
    const spec = VEHICLE_SPECS[kind];
    const look = LOOKS[kind];
    return this.geometry(
      `cabin:${kind}`,
      () =>
        new RoundedBoxGeometry(
          (spec.length / UNIT) * look.cabinLength,
          look.cabin,
          (spec.width / UNIT) * 0.86,
          3,
          0.08,
        ),
    );
  }

  wheel(): BufferGeometry {
    return this.geometry('wheel', () => {
      const g = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14);
      g.rotateX(Math.PI / 2); // eixo da roda ao longo de Z
      return g;
    });
  }

  /** Seta achatada apontando para +X. */
  arrow(): BufferGeometry {
    return this.geometry('arrow', () => {
      const s = new Shape();
      s.moveTo(-0.22, -0.07);
      s.lineTo(0.04, -0.07);
      s.lineTo(0.04, -0.15);
      s.lineTo(0.26, 0);
      s.lineTo(0.04, 0.15);
      s.lineTo(0.04, 0.07);
      s.lineTo(-0.22, 0.07);
      s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); // deita a seta no plano XZ
      return g;
    });
  }

  material(hex: number, quality: Quality): Material {
    const key = `${hex}:${quality}`;
    let m = this.materials.get(key);
    if (m === undefined) {
      m = createToyMaterial(hex, quality);
      this.materials.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

/** Mistura da cor com branco (cabine mais clara que o corpo). */
function lighter(hex: number, amount: number): number {
  return new Color(hex).lerp(new Color(0xffffff), amount).getHex();
}

function mesh(geometry: BufferGeometry, material: Material, shadow = true): Mesh {
  const m = new Mesh(geometry, material);
  m.castShadow = shadow;
  return m;
}

/**
 * Cria o veículo: corpo (comprimento ao longo de +X local), cabine, rodas e a seta no teto.
 * `rotation.y = vehicle.angle` (em radianos): o eixo local +X aponta para `(cos a, −sin a)`
 * em (X, Z), a direção de avanço do veículo.
 */
export function createVehicleView(
  assets: VehicleAssets,
  vehicle: Vehicle,
  quality: Quality,
): Group {
  const spec = VEHICLE_SPECS[vehicle.kind];
  const look = LOOKS[vehicle.kind];
  const length = spec.length / UNIT;
  const width = spec.width / UNIT;
  const hex = paletteColor(vehicle.color).hex;
  const group = new Group();
  group.userData.vehicleId = vehicle.id;
  group.userData.kind = vehicle.kind;

  const bodyY = WHEEL_RADIUS + look.body / 2 - 0.03;
  const body = mesh(assets.body(vehicle.kind), assets.material(hex, quality));
  body.position.y = bodyY;
  group.add(body);

  const cabinY = bodyY + look.body / 2 + look.cabin / 2 - 0.03;
  const cabin = mesh(assets.cabin(vehicle.kind), assets.material(lighter(hex, 0.3), quality));
  cabin.position.set(length * look.cabinShift, cabinY, 0);
  group.add(cabin);

  for (const axle of look.axles) {
    for (const side of [-1, 1]) {
      const wheel = mesh(assets.wheel(), assets.material(DARK, quality));
      wheel.position.set(length * axle, WHEEL_RADIUS, side * (width / 2 - 0.05));
      group.add(wheel);
    }
  }

  const arrow = mesh(assets.arrow(), assets.material(LIGHT, quality), false);
  arrow.position.set(length * look.cabinShift, cabinY + look.cabin / 2 + 0.005, 0);
  group.add(arrow);

  group.rotation.y = (vehicle.angle * Math.PI) / 180;
  return group;
}

/** Define a direção do veículo (`rotation.y`, mesma convenção do `heading` do plano). */
export function setVehicleHeading(group: Group, heading: number): void {
  group.rotation.y = heading;
}

/** Posiciona o veículo no mundo (com altura opcional) e define a direção. */
export function placeVehicle(group: Group, p: WorldPoint, heading: number, lift = 0): void {
  group.position.set(p.x, lift, p.z);
  group.rotation.y = heading;
}
