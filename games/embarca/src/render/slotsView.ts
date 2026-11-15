/**
 * Vagas de estacionamento: uma placa por vaga e, embaixo, um indicador por assento do veículo
 * estacionado (cheio com a cor do veículo, vazio em cinza).
 */
import { createToyMaterial, paletteColor, type Quality } from '@recreio/core';
import { Group, Material, Mesh, SphereGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Level, Slot } from '../logic';
import { SLOT_HEIGHT, type Layout, type WorldPoint } from './layout';

const PLATE_COLOR = 0xcfd8e3;
const EMPTY_PIP = 0xaab4c0;
const PIP_RADIUS = 0.055;
const MAX_SPACING = 0.14;
/** Distância do indicador à borda de baixo da vaga. */
const PIP_INSET = 0.18;

export class SlotsView {
  readonly object = new Group();
  readonly plates: Mesh[] = [];
  private readonly plateGeometry: BufferGeometry;
  private readonly pipGeometry: BufferGeometry;
  private readonly materials = new Map<number, Material>();
  private readonly pips: Mesh[][] = [];
  private readonly maxSeats: number;
  /** Assentos e ocupados de cada vaga, como no último `setSlots`. */
  private current: { filled: number; total: number; color: number }[] = [];
  private disposed = false;

  constructor(
    private readonly layout: Layout,
    private readonly level: Level,
    private readonly quality: Quality,
  ) {
    const cell = layout.slots[0]?.width ?? 1.5;
    this.plateGeometry = new RoundedBoxGeometry(cell - 0.1, 0.04, SLOT_HEIGHT - 0.2, 2, 0.02);
    this.pipGeometry = new SphereGeometry(PIP_RADIUS, 8, 6);
    this.maxSeats = Math.max(4, ...level.vehicles.map((v) => v.seats));
    layout.slots.forEach((s) => {
      const plate = new Mesh(this.plateGeometry, this.material(PLATE_COLOR));
      plate.position.set(s.x, 0.02, s.z);
      plate.receiveShadow = true;
      this.plates.push(plate);
      this.object.add(plate);
      const row: Mesh[] = [];
      for (let k = 0; k < this.maxSeats; k++) {
        const pip = new Mesh(this.pipGeometry, this.material(EMPTY_PIP));
        pip.visible = false;
        row.push(pip);
        this.object.add(pip);
      }
      this.pips.push(row);
      this.current.push({ filled: 0, total: 0, color: 0 });
    });
  }

  private material(hex: number): Material {
    let m = this.materials.get(hex);
    if (m === undefined) {
      m = createToyMaterial(hex, this.quality);
      this.materials.set(hex, m);
    }
    return m;
  }

  private spacing(slot: number, seats: number): number {
    const width = this.layout.slots[slot]?.width ?? 1.5;
    return Math.min(MAX_SPACING, (width - 0.2) / Math.max(seats, 1));
  }

  /** Posição do indicador do assento `seat` da vaga `slot` (usa os assentos do ocupante atual). */
  pipPoint(slot: number, seat: number): WorldPoint {
    const s = this.layout.slots[slot];
    if (s === undefined) throw new RangeError(`vaga ${slot} não existe`);
    const seats = this.current[slot]?.total || this.maxSeats;
    return {
      x: s.x + (seat - (seats - 1) / 2) * this.spacing(slot, seats),
      z: s.z + SLOT_HEIGHT / 2 - PIP_INSET,
    };
  }

  /** Atualiza as vagas: ocupante, assentos cheios e vazios. */
  setSlots(slots: readonly (Slot | null)[]): void {
    this.layout.slots.forEach((_, i) => {
      const slot = slots[i] ?? null;
      const vehicle = slot === null ? undefined : this.level.vehicles[slot.vehicle];
      const total = vehicle?.seats ?? 0;
      const filled = slot?.filled ?? 0;
      const color = vehicle === undefined ? 0 : paletteColor(vehicle.color).hex;
      this.current[i] = { filled, total, color };
      const row = this.pips[i] ?? [];
      row.forEach((pip, k) => {
        pip.visible = k < total;
        if (k >= total) return;
        pip.material = this.material(k < filled ? color : EMPTY_PIP);
        const p = this.pipPoint(i, k);
        pip.position.set(p.x, PIP_RADIUS, p.z);
      });
    });
  }

  /** Estado dos indicadores de cada vaga (para teste e diagnóstico). */
  pipSummary(): { slot: number; filled: number; total: number }[] {
    return this.current.map((c, slot) => ({ slot, filled: c.filled, total: c.total }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.clear();
    this.plateGeometry.dispose();
    this.pipGeometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.plates.length = 0;
    this.pips.length = 0;
  }
}
