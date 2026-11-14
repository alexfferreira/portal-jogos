import type { DocSpec, Storage } from './storage';

/** Progresso do modo `levels` (seção 4.3). */
export interface LevelsProgress {
  /** Próxima fase a jogar. */
  currentLevel: number;
  /** Maior fase concluída (0 = nenhuma). */
  highestCompleted: number;
  /** Estrelas por fase concluída (opcional). */
  stars: Record<number, number>;
  /** Power-ups restantes na fase atual, por nome. Reabastece a cada fase. */
  powerUps: Record<string, number>;
}

/** Progresso do modo `score`. */
export interface ScoreProgress {
  best: number;
  /** Últimas pontuações, mais recente primeiro. */
  history: number[];
}

export const PROGRESS_VERSION = 1;
export const HISTORY_LIMIT = 10;

export const levelsDefaults = (): LevelsProgress => ({
  currentLevel: 1,
  highestCompleted: 0,
  stars: {},
  powerUps: {},
});

export const scoreDefaults = (): ScoreProgress => ({ best: 0, history: [] });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function isLevelsProgress(v: unknown): v is LevelsProgress {
  return (
    isObj(v) &&
    Number.isInteger(v.currentLevel) &&
    (v.currentLevel as number) >= 1 &&
    Number.isInteger(v.highestCompleted) &&
    (v.highestCompleted as number) >= 0 &&
    isObj(v.stars) &&
    isObj(v.powerUps)
  );
}

export function isScoreProgress(v: unknown): v is ScoreProgress {
  return (
    isObj(v) &&
    typeof v.best === 'number' &&
    Array.isArray(v.history) &&
    v.history.every((n) => typeof n === 'number')
  );
}

/** Registra a conclusão de uma fase (função pura). */
export function completeLevel(p: LevelsProgress, level: number, stars?: number): LevelsProgress {
  const nextStars = { ...p.stars };
  if (stars !== undefined) nextStars[level] = Math.max(nextStars[level] ?? 0, stars);
  return {
    currentLevel: Math.max(p.currentLevel, level + 1),
    highestCompleted: Math.max(p.highestCompleted, level),
    stars: nextStars,
    powerUps: {},
  };
}

/** Registra uma pontuação final (função pura). */
export function recordScore(p: ScoreProgress, score: number): ScoreProgress {
  return {
    best: Math.max(p.best, score),
    history: [score, ...p.history].slice(0, HISTORY_LIMIT),
  };
}

export const progressKey = (gameId: string): string => `progress:${gameId}`;

export function levelsSpec(): DocSpec<LevelsProgress> {
  return { version: PROGRESS_VERSION, defaults: levelsDefaults, validate: isLevelsProgress };
}

export function scoreSpec(): DocSpec<ScoreProgress> {
  return { version: PROGRESS_VERSION, defaults: scoreDefaults, validate: isScoreProgress };
}

/** Progresso persistido de um jogo, com a API que o `GameContext` expõe. */
export interface GameStorage {
  loadLevels(): Promise<LevelsProgress>;
  saveLevels(p: LevelsProgress): Promise<void>;
  loadScore(): Promise<ScoreProgress>;
  saveScore(p: ScoreProgress): Promise<void>;
  reset(): Promise<void>;
}

export function createGameStorage(storage: Storage, gameId: string): GameStorage {
  const key = progressKey(gameId);
  return {
    loadLevels: () => storage.load(key, levelsSpec()),
    saveLevels: (p) => storage.save(key, p, PROGRESS_VERSION),
    loadScore: () => storage.load(key, scoreSpec()),
    saveScore: (p) => storage.save(key, p, PROGRESS_VERSION),
    reset: () => storage.remove(key),
  };
}
