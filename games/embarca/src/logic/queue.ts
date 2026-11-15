import type { Rng } from '@recreio/core/puzzle';
import type { LevelConfig } from './config';
import { buildGeometry, DEFAULT_SLOT_COUNT } from './level';
import type { PlacedVehicle } from './placement';
import { applyMove, createState, settle } from './state';
import type { State } from './types';

export interface ColorPlan {
  /** `colors[i]` é a cor do veículo `i` (na ordem de saída plantada). */
  colors: number[];
  /** Cores dos passageiros, do primeiro ao último da fila. */
  queue: number[];
  /**
   * Pico **simulado** de vagas ocupadas no instante em que um veículo toma a vaga (o alvo da
   * curva). O pico real, jogando a ordem plantada no motor (`playOrder`), pode ser menor.
   */
  peakParked: number;
}

const occupied = (state: State): number => state.slots.filter((s) => s !== null).length;

/**
 * Dá cores aos veículos e monta a fila de passageiros simulando a ordem plantada com o motor
 * real: a cada veículo estacionado, enquanto as vagas ocupadas chegarem ao pico alvo (ou, no
 * fim, enquanto houver alguma), sorteia um estacionado e acrescenta à fila os passageiros que
 * faltam para ele; o `settle` decide em quem eles embarcam. Assim a fila nunca contradiz as
 * regras (por exemplo, quando dois estacionados têm a mesma cor). `null` se uma jogada da
 * ordem plantada for recusada.
 */
export function buildColorsAndQueue(
  placed: readonly PlacedVehicle[],
  config: LevelConfig,
  rng: Rng,
): ColorPlan | null {
  const n = placed.length;

  // Cores: cada cor aparece ao menos uma vez (quando há veículos), o resto é sorteado.
  const colors = new Array<number>(n);
  rng.shuffle(Array.from({ length: n }, (_, i) => i)).forEach((index, k) => {
    colors[index] = k < config.colors ? k : rng.int(0, config.colors - 1);
  });

  const geometry = buildGeometry({
    board: config.board,
    vehicles: placed.map((v, i) => ({ ...v, color: colors[i] as number })),
  });
  const queue: number[] = [];
  let state = createState({ ...geometry, queue: [], slotCount: DEFAULT_SLOT_COUNT });
  let peakParked = 0;

  for (let i = 0; i < n; i++) {
    const moved = applyMove(state, { vehicle: i });
    if (!moved.ok) return null;
    state = moved.state;
    // A fila acumulada já foi toda consumida, então nada embarcou nesta jogada.
    peakParked = Math.max(peakParked, occupied(state));

    const lastVehicle = i === n - 1;
    while (occupied(state) > 0 && (lastVehicle || occupied(state) >= config.peakTarget)) {
      const parked = state.slots.flatMap((s) => (s === null ? [] : [s]));
      const target = rng.pick(parked);
      const vehicle = state.level.vehicles[target.vehicle];
      if (vehicle === undefined) return null;
      for (let k = target.filled; k < vehicle.seats; k++) queue.push(vehicle.color);
      state = settle({ ...state, level: { ...state.level, queue: [...queue] } }).state;
    }
  }
  return { colors, queue, peakParked };
}
