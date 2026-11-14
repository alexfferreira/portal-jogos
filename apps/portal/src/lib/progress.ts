import type { LevelsProgress, ScoreProgress } from '@recreio/core';

export interface ProgressLabel {
  key: 'home.level' | 'home.record';
  params: { n: number };
}

/** Texto de progresso do cartão: "Fase 37" (levels) ou "Recorde 1200" (score). */
export function progressLabel(
  mode: 'levels' | 'score',
  data: { levels?: LevelsProgress; score?: ScoreProgress },
): ProgressLabel {
  if (mode === 'levels')
    return { key: 'home.level', params: { n: data.levels?.currentLevel ?? 1 } };
  return { key: 'home.record', params: { n: data.score?.best ?? 0 } };
}
