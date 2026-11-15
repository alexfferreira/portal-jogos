import { createRng } from '@recreio/core/puzzle';
import { levelConfig, type LevelConfig } from './config';
import { playOrder, randomPlayoutWinRate } from './difficulty';
import { createLevel, type VehicleInput } from './level';
import { placeVehicles } from './placement';
import { buildColorsAndQueue } from './queue';
import { mixSeed } from './seed';
import { solve } from './solver';
import { createState } from './state';
import type { Level, Move, State } from './types';

export interface GenerateOptions {
  /** Limite de nós do solver por tentativa (determinístico). Padrão 60 000. */
  maxNodes?: number;
  /** Máximo de variações da semente. Padrão 64. */
  maxVariations?: number;
  /** Partidas aleatórias para medir a dificuldade. Padrão 200. */
  samples?: number;
}

export interface GeneratedLevel {
  level: number;
  /** Qual variação da semente passou nas verificações (0 = a semente original). */
  variation: number;
  /** Semente efetivamente usada. */
  seed: number;
  config: LevelConfig;
  /** Estado inicial da fase. */
  state: State;
  /** A ordem de saída plantada: uma solução garantida (sem power-ups). */
  solution: Move[];
  solverNodes: number;
  /** Fração das partidas aleatórias que vencem (dificuldade; menor = mais difícil). */
  winRate: number;
  /** Pico real de vagas ocupadas jogando a solução plantada. */
  peakParked: number;
}

/**
 * Gera a fase `level` por construção reversa, sempre vencível sem power-ups. Cada variação da
 * semente é aceita só se: a ordem plantada vence no motor real, o solver acha solução dentro
 * do limite de nós (então a dica sempre funciona) e as partidas aleatórias vencem menos que o
 * teto da fase. Determinístico: mesma fase e mesmas opções, mesmo resultado.
 */
export function generateLevel(level: number, options: GenerateOptions = {}): GeneratedLevel {
  const config = levelConfig(level);
  const maxNodes = options.maxNodes ?? 60_000;
  const maxVariations = options.maxVariations ?? 64;
  const samples = options.samples ?? 200;

  for (let variation = 0; variation < maxVariations; variation++) {
    const seed = mixSeed(level, variation);
    const rng = createRng(seed);
    const placed = placeVehicles(config, rng);
    if (placed === null) continue;
    const plan = buildColorsAndQueue(placed, config, rng);
    if (plan === null) continue;

    // Embaralha os ids: o veículo que sai na posição `e` recebe o id `perm[e]`, então a
    // numeração não revela a solução.
    const perm = rng.shuffle(placed.map((_, e) => e));
    const vehicles: VehicleInput[] = new Array<VehicleInput>(placed.length);
    placed.forEach((v, e) => {
      vehicles[perm[e] as number] = { ...v, color: plan.colors[e] as number };
    });

    let built: Level;
    try {
      built = createLevel({ board: config.board, vehicles, queue: plan.queue });
    } catch (error) {
      if (error instanceof RangeError) continue;
      throw error;
    }

    const outcome = playOrder(built, perm);
    if (!outcome.won || outcome.applied !== placed.length) continue;
    const state = createState(built);
    const solved = solve(state, { maxNodes });
    if (solved.status !== 'solved') continue;
    const winRate = randomPlayoutWinRate(built, (seed ^ 0x9e3779b9) >>> 0, samples);
    if (winRate > config.winRateCap) continue;

    return {
      level,
      variation,
      seed,
      config,
      state,
      solution: perm.map((vehicle) => ({ vehicle })),
      solverNodes: solved.nodes,
      winRate,
      peakParked: outcome.peakParked,
    };
  }
  throw new Error(`não foi possível gerar a fase ${level} em ${maxVariations} variações`);
}
