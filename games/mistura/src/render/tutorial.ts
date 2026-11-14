/**
 * Roteiro do tutorial (fases 1 e 2). PURO: recebe a próxima jogada da solução e o que o
 * jogador fez, e devolve o que destacar e qual mensagem mostrar. Não conhece Three.
 */
import type { Move } from '../logic';

/** Fases com tutorial. */
export const TUTORIAL_LEVELS = 2;

export const TUTORIAL_MESSAGES = {
  select: 'mistura.tutorial.select',
  pour: 'mistura.tutorial.pour',
  cancel: 'mistura.tutorial.cancel',
  rules: 'mistura.tutorial.rules',
} as const;

export interface TutorialStep {
  /** Mãozinha: toca em `from` e depois em `to` (`from` nulo: só toca em `to`). */
  hand: { from: number | null; to: number } | null;
  /** Chave i18n da mensagem, ou `null`. */
  message: string | null;
}

const NONE: TutorialStep = { hand: null, message: null };

export function hasTutorial(level: number): boolean {
  return level >= 1 && level <= TUTORIAL_LEVELS;
}

/**
 * Passo atual do tutorial.
 * - `selected`: tubo que o jogador levantou (ou `null`).
 * - `next`: próxima jogada da solução a partir do estado atual (ou `null` se ainda
 *   desconhecida, terminada ou sem saída: nesse caso só o texto aparece, sem mãozinha).
 */
export function tutorialStep(
  level: number,
  selected: number | null,
  next: Move | null,
): TutorialStep {
  if (!hasTutorial(level)) return NONE;
  if (selected === null) {
    const message = level === 1 ? TUTORIAL_MESSAGES.select : TUTORIAL_MESSAGES.rules;
    return { hand: next ? { from: next.from, to: next.to } : null, message };
  }
  if (!next) return { hand: null, message: TUTORIAL_MESSAGES.pour };
  if (selected === next.from) {
    return { hand: { from: null, to: next.to }, message: TUTORIAL_MESSAGES.pour };
  }
  // Levantou um tubo que não é o da jogada ótima: a mão mostra como cancelar.
  return { hand: { from: null, to: selected }, message: TUTORIAL_MESSAGES.cancel };
}

/**
 * Acompanha a solução: se `played` é a primeira jogada do roteiro, devolve o restante;
 * senão devolve `null` (o jogador saiu do roteiro e o chamador deve recalcular pelo Worker).
 */
export function followRoteiro(route: readonly Move[], played: Move): Move[] | null {
  const first = route[0];
  if (!first || first.from !== played.from || first.to !== played.to) return null;
  return route.slice(1);
}

export interface HandPose {
  /** Interpolação entre `from` e `to` (0 = em `from`, 1 = em `to`). */
  blend: number;
  /** Escala de "toque" (1 = normal; < 1 = pressionando). */
  press: number;
  /** Opacidade 0..1. */
  alpha: number;
}

/** Duração do ciclo da mãozinha, em segundos. */
export const HAND_CYCLE = 2.6;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Pose da mãozinha no instante `time` (s) do ciclo. Com `from` e `to`: aparece em `from`,
 * toca, desliza até `to`, toca e some. Só com `to` (`hasFrom` falso): aparece, toca e some.
 * Retorna o blend entre os dois pontos; o render converte em posição.
 */
export function handPose(time: number, hasFrom: boolean): HandPose {
  const t = ((time % HAND_CYCLE) + HAND_CYCLE) % HAND_CYCLE;
  const fade = (x: number, a: number, b: number): number => clamp01((x - a) / (b - a));
  if (!hasFrom) {
    const alpha = Math.min(fade(t, 0, 0.3), 1 - fade(t, 1.6, 2.1));
    const press = 1 - 0.18 * Math.sin(Math.PI * clamp01((t - 0.5) / 0.5));
    return { blend: 1, press, alpha };
  }
  // 0–0.3 aparece em from · 0.4–0.8 toca · 0.8–1.5 desliza · 1.5–1.9 toca em to · 2.2–2.6 some
  const alpha = Math.min(fade(t, 0, 0.3), 1 - fade(t, 2.0, 2.5));
  const blend = smooth(fade(t, 0.8, 1.5));
  const p1 = Math.sin(Math.PI * clamp01((t - 0.4) / 0.4));
  const p2 = Math.sin(Math.PI * clamp01((t - 1.5) / 0.4));
  return { blend, press: 1 - 0.18 * Math.max(p1, p2), alpha };
}
