/**
 * Tipos da lógica da Mistura. Tudo é serializável (objetos e arrays simples),
 * então pode ir e voltar por `postMessage` do Worker sem conversão.
 */

/** Uma unidade de líquido. `color` é o índice na PALETTE do core. */
export interface Unit {
  readonly color: number;
  /**
   * Camada oculta ("?"): o jogador não vê a cor até a unidade chegar ao topo.
   * O estado guarda a cor real; a UI deve esconder `color` enquanto `hidden` for true.
   */
  readonly hidden: boolean;
}

/** Tubo: unidades da BASE (índice 0) ao TOPO (último índice). */
export type Tube = readonly Unit[];

export interface State {
  /** Capacidade de todos os tubos da fase. */
  readonly capacity: number;
  readonly tubes: readonly Tube[];
}

export interface Move {
  readonly from: number;
  readonly to: number;
}

export type InvalidReason =
  | 'invalid-index'
  | 'same-tube'
  | 'empty-source'
  | 'hidden-top'
  | 'full-destination'
  | 'color-mismatch';

/** Unidade revelada por uma jogada (para o render animar o "?" virando cor). */
export interface Revealed {
  readonly tube: number;
  /** Posição da unidade no tubo (0 = base). */
  readonly index: number;
  readonly color: number;
}

export interface MoveApplied {
  readonly ok: true;
  readonly state: State;
  readonly move: Move;
  /** Quantas unidades foram transferidas (>= 1). */
  readonly moved: number;
  /** Cor transferida. */
  readonly color: number;
  /** Unidades que deixaram de estar ocultas por causa da jogada. */
  readonly revealed: readonly Revealed[];
  /** Tubo de destino, se a jogada o completou (cheio de uma só cor); senão `null`. */
  readonly completed: number | null;
}

export interface MoveRejected {
  readonly ok: false;
  readonly reason: InvalidReason;
  /** O mesmo estado recebido (inalterado). */
  readonly state: State;
}

export type MoveResult = MoveApplied | MoveRejected;
