import { createRng, PALETTE, type SearchLimits } from '@recreio/core/puzzle';
import { createState } from './state';
import { solve } from './solver';
import type { Move, State, Unit } from './types';

/** Máximo de cores: não há mais cores na PALETTE (a spec pede até 14; ver DECISIONS). */
export const MAX_COLORS = PALETTE.length;

export interface LevelConfig {
  colors: number;
  capacity: number;
  emptyTubes: number;
  /** A fase tem camadas ocultas ("?"). */
  hidden: boolean;
  /** Fração das unidades não-topo que ficam ocultas (0 se `hidden` é falso). */
  hiddenRatio: number;
}

export interface GeneratedLevel {
  level: number;
  /** Qual variação da semente passou no solver (0 = a semente original). */
  variation: number;
  /** Semente efetivamente usada no embaralhamento. */
  seed: number;
  config: LevelConfig;
  state: State;
  /** Solução (sem power-ups) encontrada pelo solver na validação. */
  solution: Move[];
  solverNodes: number;
}

export interface GenerateOptions {
  /** Limite de nós do solver por tentativa (determinístico). Padrão 60 000. */
  maxNodes?: number;
  /** Teto de tempo por tentativa em ms. NÃO usar em produção se quiser determinismo estrito. */
  maxMillis?: number;
  now?: () => number;
  /** Máximo de variações da semente. Padrão 64. */
  maxVariations?: number;
}

/** Mistura de dois inteiros em uma semente de 32 bits (determinístico). */
export function mixSeed(level: number, variation: number): number {
  if (variation === 0) return level >>> 0;
  let h = (level ^ Math.imul(variation, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Curva de dificuldade (seção 6.2). Depende só do número da fase (e de um PRNG
 * derivado dele), nunca da variação de semente, então a configuração é estável.
 */
export function levelConfig(level: number): LevelConfig {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('fase deve ser um inteiro >= 1');
  const rng = createRng((level ^ 0x5bd1e995) >>> 0);
  let colors: number;
  if (level <= 5) colors = level <= 2 ? 3 : 4;
  else if (level <= 30) colors = 5 + Math.floor((level - 6) / 9);
  else if (level <= 100) colors = 8 + Math.floor((level - 31) / 24);
  else colors = 11 + Math.floor((level - 101) / 50);
  colors = Math.min(colors, MAX_COLORS);

  const capacity = level > 100 && rng.next() < 0.25 ? 5 : 4;
  const hidden = level >= 40 && rng.next() < 0.5;
  const hiddenRatio = hidden ? Math.min(0.7, 0.3 + (level - 40) / 400) : 0;
  return { colors, capacity, emptyTubes: 2, hidden, hiddenRatio };
}

/** Embaralhamento inicial de uma tentativa; `null` se for trivial demais. */
function shuffleOnce(config: LevelConfig, rng: ReturnType<typeof createRng>): State | null {
  const { colors, capacity, emptyTubes, hiddenRatio } = config;
  const flat: number[] = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < capacity; i++) flat.push(c);
  const shuffled = rng.shuffle(flat);

  const tubes: Unit[][] = [];
  let adjacent = 0;
  for (let t = 0; t < colors; t++) {
    const tube = shuffled.slice(t * capacity, (t + 1) * capacity);
    // Sem tubo já uniforme (nem completo, nem pronto para virar).
    if (tube.every((c) => c === tube[0])) return null;
    for (let i = 1; i < tube.length; i++) if (tube[i] === tube[i - 1]) adjacent++;
    tubes.push(
      tube.map((color, i) => ({ color, hidden: i < tube.length - 1 && rng.next() < hiddenRatio })),
    );
  }
  // Poucos blocos já agrupados: esperado ~ 1/colors dos pares adjacentes.
  const pairs = colors * (capacity - 1);
  const limit = Math.max(1, Math.floor((pairs / colors) * 1.6 + 0.5));
  if (adjacent > limit) return null;
  for (let e = 0; e < emptyTubes; e++) tubes.push([]);
  return createState(capacity, tubes);
}

/**
 * Gera a fase `level` (semente = número da fase), sempre resolvível sem power-ups.
 * Se o solver não resolver (ou estourar o limite), tenta a próxima variação da semente.
 * Determinístico: mesma fase, mesmas opções (sem `maxMillis`) => mesmo resultado.
 */
export function generateLevel(level: number, options: GenerateOptions = {}): GeneratedLevel {
  const config = levelConfig(level);
  const maxVariations = options.maxVariations ?? 64;
  const limits: SearchLimits = { maxNodes: options.maxNodes ?? 60_000 };
  if (options.maxMillis !== undefined) limits.maxMillis = options.maxMillis;
  if (options.now) limits.now = options.now;

  for (let variation = 0; variation < maxVariations; variation++) {
    const seed = mixSeed(level, variation);
    const rng = createRng(seed);
    let state: State | null = null;
    for (let tries = 0; tries < 200 && state === null; tries++) state = shuffleOnce(config, rng);
    if (state === null) continue;
    const result = solve(state, limits);
    if (result.status === 'solved') {
      return {
        level,
        variation,
        seed,
        config,
        state,
        solution: result.moves,
        solverNodes: result.nodes,
      };
    }
  }
  throw new Error(`não foi possível gerar a fase ${level} em ${maxVariations} variações`);
}
