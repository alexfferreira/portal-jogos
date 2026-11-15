import { UndoStack } from '@recreio/core/puzzle';
import { addSlot, applyMove, createState, isStuck, isWin } from './state';
import type { Level, Move, MoveResult, State } from './types';

export type PowerUpKind = 'undo' | 'extraSlot' | 'hint';

/** Cargas de power-up por fase: desfazer 5, vaga extra 1, dica 1. */
export interface PowerUps {
  readonly undo: number;
  readonly extraSlot: number;
  readonly hint: number;
}

export const POWERUPS_PER_LEVEL: PowerUps = { undo: 5, extraSlot: 1, hint: 1 };

export function createPowerUps(): PowerUps {
  return { ...POWERUPS_PER_LEVEL };
}

export function canUsePowerUp(p: PowerUps, kind: PowerUpKind): boolean {
  return p[kind] > 0;
}

/** Gasta uma carga; devolve `null` se não houver. Não altera o original. */
export function consumePowerUp(p: PowerUps, kind: PowerUpKind): PowerUps | null {
  return p[kind] > 0 ? { ...p, [kind]: p[kind] - 1 } : null;
}

export type UndoOutcome = { ok: true; state: State } | { ok: false; reason: 'none-left' | 'empty' };
export type ExtraSlotOutcome = { ok: true; state: State } | { ok: false; reason: 'none-left' };

/**
 * Sessão de uma fase: estado atual + pilha de desfazer + power-ups + batidas.
 * Todo estado que ela guarda ou devolve é imutável.
 */
export class Session {
  private current: State;
  private readonly initial: State;
  private readonly history = new UndoStack<State>();
  private powerUps: PowerUps = createPowerUps();
  private bumpCount = 0;

  constructor(level: Level) {
    this.initial = createState(level);
    this.current = this.initial;
  }

  get state(): State {
    return this.current;
  }

  get remaining(): PowerUps {
    return this.powerUps;
  }

  get won(): boolean {
    return isWin(this.current);
  }

  get stuck(): boolean {
    return isStuck(this.current);
  }

  /** Há algo para desfazer (independente das cargas restantes). */
  get canUndo(): boolean {
    return this.history.canUndo();
  }

  /** Batidas da fase: jogadas recusadas por caminho bloqueado ou falta de vaga. */
  get bumps(): number {
    return this.bumpCount;
  }

  /** Tenta a jogada; só as aplicadas entram no histórico. */
  move(move: Move): MoveResult {
    const result = applyMove(this.current, move);
    if (result.ok) {
      this.history.push(this.current);
      this.current = result.state;
    } else if (result.reason !== 'unknown-vehicle') {
      this.bumpCount++;
    }
    return result;
  }

  /**
   * Desfaz a última jogada aplicada gastando uma carga. Se a fase ganhou uma vaga extra depois
   * da jogada desfeita, a vaga é mantida (a carga dela já foi gasta).
   */
  undo(): UndoOutcome {
    if (!this.history.canUndo()) return { ok: false, reason: 'empty' };
    const next = consumePowerUp(this.powerUps, 'undo');
    if (!next) return { ok: false, reason: 'none-left' };
    const previous = this.history.undo() as State;
    this.powerUps = next;
    const missing = this.current.slots.length - previous.slots.length;
    const slots =
      missing > 0
        ? [...previous.slots, ...Array.from({ length: missing }, () => null)]
        : previous.slots;
    this.current = { ...previous, slots };
    return { ok: true, state: this.current };
  }

  /** Adiciona uma vaga vazia gastando a carga (1 por fase). */
  addSlot(): ExtraSlotOutcome {
    const next = consumePowerUp(this.powerUps, 'extraSlot');
    if (!next) return { ok: false, reason: 'none-left' };
    this.powerUps = next;
    this.current = addSlot(this.current);
    return { ok: true, state: this.current };
  }

  /** Gasta a carga de dica (a busca em si virá do solver, no Worker). */
  spendHint(): boolean {
    const next = consumePowerUp(this.powerUps, 'hint');
    if (!next) return false;
    this.powerUps = next;
    return true;
  }

  /** Reiniciar é ilimitado e devolve todas as cargas. */
  restart(): State {
    this.current = this.initial;
    this.history.clear();
    this.powerUps = createPowerUps();
    this.bumpCount = 0;
    return this.current;
  }
}
