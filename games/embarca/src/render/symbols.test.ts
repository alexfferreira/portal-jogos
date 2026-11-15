import { describe, expect, it } from 'vitest';
import { VEHICLE_SPECS, type VehicleKind } from '../logic';
import { vehicleSymbolSpot, QUEUE_SYMBOL_SIZE, vehicleTops } from './symbols';
import { ARROW_BOX, LOOKS } from './vehicleView';

const kinds: VehicleKind[] = ['car', 'van', 'bus'];

describe('vehicleSymbolSpot', () => {
  for (const kind of kinds) {
    describe(kind, () => {
      const spot = vehicleSymbolSpot(kind);
      const spec = VEHICLE_SPECS[kind];
      const look = LOOKS[kind];
      const length = spec.length / 1000;
      const width = spec.width / 1000;
      const half = spot.size / 2;

      it('tem tamanho legível e cabe dentro do veículo', () => {
        expect(spot.size).toBeGreaterThanOrEqual(0.3);
        expect(Math.abs(spot.x) + half).toBeLessThanOrEqual(length / 2 + 1e-9);
        expect(Math.abs(spot.z) + half).toBeLessThanOrEqual(width / 2 + 1e-9);
      });

      it('não cobre a seta', () => {
        const center = length * look.cabinShift;
        const boxMin = spot.x - half;
        const boxMax = spot.x + half;
        const arrowMin = center + ARROW_BOX.minX;
        const arrowMax = center + ARROW_BOX.maxX;
        const overlapX = boxMin < arrowMax && boxMax > arrowMin;
        const overlapZ =
          spot.z - half < ARROW_BOX.halfWidth && spot.z + half > -ARROW_BOX.halfWidth;
        expect(overlapX && overlapZ).toBe(false);
      });

      it('fica acima da superfície que está embaixo dele', () => {
        const { bodyTop, cabinTop } = vehicleTops(kind);
        const cabinCenter = length * look.cabinShift;
        const cabinHalf = (length * look.cabinLength) / 2;
        const overlapsCabin =
          spot.x - half < cabinCenter + cabinHalf - 1e-9 &&
          spot.x + half > cabinCenter - cabinHalf + 1e-9;
        expect(spot.y).toBeGreaterThan(overlapsCabin ? cabinTop : bodyTop);
      });

      it('se estiver sobre a cabine, cabe inteiro nela (nada paira sobre o capô)', () => {
        const cabinCenter = length * look.cabinShift;
        const cabinHalf = (length * look.cabinLength) / 2;
        const overlapsCabin =
          spot.x - half < cabinCenter + cabinHalf - 1e-9 &&
          spot.x + half > cabinCenter - cabinHalf + 1e-9;
        if (overlapsCabin) {
          expect(spot.x - half).toBeGreaterThanOrEqual(cabinCenter - cabinHalf - 1e-9);
          expect(spot.x + half).toBeLessThanOrEqual(cabinCenter + cabinHalf + 1e-9);
        }
      });
    });
  }

  it('o símbolo da fila é maior que a bolinha do passageiro', () => {
    expect(QUEUE_SYMBOL_SIZE).toBeGreaterThanOrEqual(0.3);
  });
});
