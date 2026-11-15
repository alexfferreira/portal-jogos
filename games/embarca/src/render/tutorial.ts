/**
 * Roteiro do tutorial (fases 1 e 2). PURO: recebe a próxima jogada da solução e quantos
 * veículos esperam passageiros, e devolve o que apontar e qual mensagem mostrar. Não conhece
 * Three.
 */
import type { Move } from '../logic';

/** Fases com tutorial. */
export const TUTORIAL_LEVELS = 2;

export const TUTORIAL_MESSAGES = {
  tap: 'embarca.tutorial.tap',
  queue: 'embarca.tutorial.queue',
  blocked: 'embarca.tutorial.blocked',
} as const;

export interface TutorialStep {
  /** Id do veículo para a mãozinha apontar, ou `null`. */
  hand: number | null;
  /** Chave i18n da mensagem, ou `null`. */
  message: string | null;
}

const NONE: TutorialStep = { hand: null, message: null };

export function hasTutorial(level: number): boolean {
  return level >= 1 && level <= TUTORIAL_LEVELS;
}

/**
 * Passo atual do tutorial.
 * - `next`: próxima jogada da solução a partir do estado atual (ou `null` se ainda
 *   desconhecida ou terminada: nesse caso só o texto aparece, sem mãozinha).
 * - `parked`: quantos veículos estão estacionados esperando passageiros.
 */
export function tutorialStep(level: number, next: Move | null, parked: number): TutorialStep {
  if (!hasTutorial(level)) return NONE;
  const hand = next?.vehicle ?? null;
  if (level === 1) {
    return { hand, message: parked > 0 ? TUTORIAL_MESSAGES.queue : TUTORIAL_MESSAGES.tap };
  }
  return { hand, message: TUTORIAL_MESSAGES.blocked };
}

/**
 * Acompanha a solução: se `played` é a primeira jogada do roteiro, devolve o restante;
 * senão devolve `null` (o jogador saiu do roteiro e o chamador deve recalcular pelo Worker).
 */
export function followRoute(route: readonly Move[], played: Move): Move[] | null {
  const first = route[0];
  if (!first || first.vehicle !== played.vehicle) return null;
  return route.slice(1);
}
