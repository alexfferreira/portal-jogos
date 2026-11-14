import { UndoStack } from '@recreio/core/puzzle';
import { addEmptyTube, applyMove, isStuck, isWin } from './state';
import type { Move, MoveResult, Revealed, State } from './types';

export type PowerUpKind = 'undo' | 'extraTube' | 'hint';

/** Cargas de power-up por fase (seção 6.3): desfazer 5, tubo extra 1, dica 1. */
export interface PowerUps {
  readonly undo: number;
  readonly extraTube: number;
  readonly hint: number;
}

export const POWERUPS_PER_LEVEL: PowerUps = { undo: 5, extraTube: 1, hint: 1 };

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

export type UndoOutcome =
  | {
      ok: true;
      state: State;
      /** Unidades que voltaram a ficar ocultas ("?") ao desfazer, para o render animar. */
      rehidden: readonly Revealed[];
    }
  | { ok: false; reason: 'none-left' | 'empty' };
export type ExtraTubeOutcome = { ok: true; state: State } | { ok: false; reason: 'none-left' };

/**
 * Sessão de uma fase: estado atual + pilha de desfazer + power-ups.
 * A sessão é mutável por fora, mas todo estado que ela guarda ou devolve é imutável.
 */
export class Session {
  private current: State;
  private readonly initial: State;
  private readonly history = new UndoStack<State>();
  private powerUps: PowerUps = createPowerUps();

  constructor(initial: State) {
    this.initial = initial;
    this.current = initial;
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

  /** Tenta a jogada; só as válidas entram no histórico. */
  move(move: Move): MoveResult {
    const result = applyMove(this.current, move);
    if (result.ok) {
      this.history.push(this.current);
      this.current = result.state;
    }
    return result;
  }

  /**
   * Desfaz a última jogada gastando uma carga. Se a fase ganhou um tubo extra depois
   * da jogada desfeita, o tubo extra é mantido (a carga dele já foi gasta).
   */
  undo(): UndoOutcome {
    if (!this.history.canUndo()) return { ok: false, reason: 'empty' };
    const next = consumePowerUp(this.powerUps, 'undo');
    if (!next) return { ok: false, reason: 'none-left' };
    const previous = this.history.undo() as State;
    this.powerUps = next;
    let tubes = previous.tubes;
    if (tubes.length < this.current.tubes.length) {
      tubes = [
        ...tubes,
        ...Array.from({ length: this.current.tubes.length - tubes.length }, () => []),
      ];
    }
    const rehidden: Revealed[] = [];
    previous.tubes.forEach((tube, t) =>
      tube.forEach((u, index) => {
        const was = this.current.tubes[t]?.[index];
        if (u.hidden && was && !was.hidden) rehidden.push({ tube: t, index, color: u.color });
      }),
    );
    this.current = { capacity: previous.capacity, tubes };
    return { ok: true, state: this.current, rehidden };
  }

  /** Adiciona um tubo vazio gastando a carga (1 por fase). */
  addTube(): ExtraTubeOutcome {
    const next = consumePowerUp(this.powerUps, 'extraTube');
    if (!next) return { ok: false, reason: 'none-left' };
    this.powerUps = next;
    this.current = addEmptyTube(this.current);
    return { ok: true, state: this.current };
  }

  /** Gasta a carga de dica (a busca em si é `hint(state)`, que roda no Worker). */
  spendHint(): boolean {
    const next = consumePowerUp(this.powerUps, 'hint');
    if (!next) return false;
    this.powerUps = next;
    return true;
  }

  /** Reiniciar é ilimitado e devolve todas as cargas (decisão em DECISIONS.md). */
  restart(): State {
    this.current = this.initial;
    this.history.clear();
    this.powerUps = createPowerUps();
    return this.current;
  }
}
