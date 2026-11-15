import { Box3, BufferGeometry, Material, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_SPECS, type Vehicle, type VehicleKind } from '../logic';
import { createVehicleView, placeVehicle, setVehicleHeading, VehicleAssets } from './vehicleView';

const vehicle = (kind: VehicleKind, color = 0, angle = 0, id = 0): Vehicle => ({
  id,
  kind,
  seats: VEHICLE_SPECS[kind].seats,
  color,
  hidden: false,
  cx: 0,
  cy: 0,
  angle,
});

afterEach(() => vi.restoreAllMocks());

describe('createVehicleView', () => {
  for (const kind of ['car', 'van', 'bus'] as const) {
    it(`${kind}: comprimento e largura seguem as medidas da lógica`, () => {
      const assets = new VehicleAssets();
      const view = createVehicleView(assets, vehicle(kind), 'high');
      const size = new Box3().setFromObject(view).getSize(new Vector3());
      expect(size.x).toBeCloseTo(VEHICLE_SPECS[kind].length / 1000, 1);
      expect(size.z).toBeCloseTo(VEHICLE_SPECS[kind].width / 1000, 1);
      expect(view.userData.vehicleId).toBe(0);
      expect(view.userData.kind).toBe(kind);
      assets.dispose();
    });
  }

  it('guarda o id do veículo no userData', () => {
    const assets = new VehicleAssets();
    expect(createVehicleView(assets, vehicle('van', 2, 0, 7), 'high').userData.vehicleId).toBe(7);
    assets.dispose();
  });

  it('a orientação segue a direção de avanço (cos a, −sin a) em XZ', () => {
    const assets = new VehicleAssets();
    const east = createVehicleView(assets, vehicle('car', 0, 0), 'high');
    const north = createVehicleView(assets, vehicle('car', 0, 90), 'high');
    const ahead = (g: typeof east) => new Vector3(1, 0, 0).applyEuler(g.rotation);
    expect(ahead(east).x).toBeCloseTo(1);
    expect(ahead(east).z).toBeCloseTo(0);
    expect(ahead(north).x).toBeCloseTo(0);
    expect(ahead(north).z).toBeCloseTo(-1);
    assets.dispose();
  });
});

describe('VehicleAssets', () => {
  it('compartilha geometrias e materiais entre veículos', () => {
    const assets = new VehicleAssets();
    createVehicleView(assets, vehicle('car'), 'high');
    createVehicleView(assets, vehicle('van'), 'high');
    const before = { ...assets.stats };
    for (let i = 0; i < 10; i++) createVehicleView(assets, vehicle('car', 0, 0, i), 'high');
    for (let i = 0; i < 4; i++) createVehicleView(assets, vehicle('van', 0, 0, i), 'high');
    expect(assets.stats).toEqual(before);
    createVehicleView(assets, vehicle('car', 3), 'high'); // cor nova: só acrescenta material
    expect(assets.stats.geometries).toBe(before.geometries);
    expect(assets.stats.materials).toBeGreaterThan(before.materials);
    assets.dispose();
  });

  it('o mesmo material para a mesma cor', () => {
    const assets = new VehicleAssets();
    expect(assets.material(0xe53935, 'high')).toBe(assets.material(0xe53935, 'high'));
    expect(assets.material(0xe53935, 'high')).not.toBe(assets.material(0x1e63e0, 'high'));
    assets.dispose();
  });

  it('dispose libera tudo e pode ser chamado duas vezes', () => {
    const geo = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mat = vi.spyOn(Material.prototype, 'dispose');
    const assets = new VehicleAssets();
    createVehicleView(assets, vehicle('car'), 'high');
    createVehicleView(assets, vehicle('bus', 4), 'low');
    const { geometries, materials } = assets.stats;
    expect(geometries).toBeGreaterThan(0);
    assets.dispose();
    expect(geo.mock.calls.length).toBeGreaterThanOrEqual(geometries);
    expect(mat.mock.calls.length).toBeGreaterThanOrEqual(materials);
    const callsAfter = geo.mock.calls.length + mat.mock.calls.length;
    expect(() => assets.dispose()).not.toThrow();
    expect(geo.mock.calls.length + mat.mock.calls.length).toBe(callsAfter);
  });
});

describe('placeVehicle / setVehicleHeading', () => {
  it('posiciona em (x, lift, z) e define a rotação', () => {
    const assets = new VehicleAssets();
    const view = createVehicleView(assets, vehicle('car'), 'high');
    placeVehicle(view, { x: 1.5, z: -2 }, Math.PI / 2, 0.2);
    expect(view.position.x).toBeCloseTo(1.5);
    expect(view.position.y).toBeCloseTo(0.2);
    expect(view.position.z).toBeCloseTo(-2);
    expect(view.rotation.y).toBeCloseTo(Math.PI / 2);
    setVehicleHeading(view, 0);
    expect(view.rotation.y).toBe(0);
    assets.dispose();
  });
});
