import { PALETTE } from '@recreio/core/puzzle';
import type { VehicleKind } from './types';

/** Curva de dificuldade de uma fase. Depende só do número da fase. */
export interface LevelConfig {
  level: number;
  /** Quantidade de veículos. */
  vehicles: number;
  /** Quantas cores diferentes (todas aparecem quando há veículos suficientes). */
  colors: number;
  /** Pesos (somam 1) dos tipos de veículo. */
  mix: Record<VehicleKind, number>;
  /** Os ângulos dos veículos são múltiplos disto, em graus. */
  angleStep: 90 | 45 | 15 | 1;
  /** Vagas ocupadas ao mesmo tempo, no pico, pela solução plantada (2 a 4). */
  peakTarget: number;
  /** 0..1: tendência de colocar veículos na frente dos que já estão no tabuleiro. */
  blockBias: number;
  /** Teto da fração de partidas aleatórias que vencem (0..1). */
  winRateCap: number;
  board: { width: number; height: number };
}

export function levelConfig(level: number): LevelConfig {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('fase deve ser um inteiro >= 1');
  const vehicles = Math.min(24, 4 + Math.floor(level * 0.4));
  const colors = Math.min(vehicles, PALETTE.length, 2 + Math.floor(level / 6));
  const mix: Record<VehicleKind, number> =
    level <= 3
      ? { car: 1, van: 0, bus: 0 }
      : level <= 10
        ? { car: 0.7, van: 0.3, bus: 0 }
        : { car: 0.5, van: 0.3, bus: 0.2 };
  const angleStep = level <= 6 ? 90 : level <= 20 ? 45 : level <= 50 ? 15 : 1;
  const winRateCap = level <= 5 ? 1 : level <= 20 ? 0.6 : level <= 60 ? 0.35 : 0.15;
  return {
    level,
    vehicles,
    colors,
    mix,
    angleStep,
    peakTarget: Math.min(4, 2 + Math.floor(level / 15)),
    blockBias: Math.min(1, 0.4 + level / 100),
    winRateCap,
    board: { width: 6000, height: 8000 + 150 * vehicles },
  };
}
