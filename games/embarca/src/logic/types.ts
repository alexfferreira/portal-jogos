/**
 * Tipos da lógica da Embarca. Tudo é serializável (objetos e arrays simples),
 * então pode ir e voltar por `postMessage` do Worker sem conversão.
 *
 * Geometria em inteiros: coordenadas em milésimos de unidade do tabuleiro, ângulos em graus.
 */

export type VehicleKind = 'car' | 'van' | 'bus';

export interface Vehicle {
  /** Índice do veículo na lista da fase. */
  readonly id: number;
  readonly kind: VehicleKind;
  /** Assentos: carro 4, van 6, ônibus 10. */
  readonly seats: number;
  /** Índice na PALETTE do core. */
  readonly color: number;
  /**
   * Veículo misterioso "?": o estado guarda a cor real; a UI só mostra a cor depois que ele
   * estaciona (ver `visibleColor`).
   */
  readonly hidden: boolean;
  /** Centro, em milésimos. */
  readonly cx: number;
  readonly cy: number;
  /** 0..359: direção da seta e do bico do veículo, anti-horário a partir de +x, y para cima. */
  readonly angle: number;
}

/** Obstáculo fixo: retângulo que só bloqueia. */
export interface Obstacle {
  readonly cx: number;
  readonly cy: number;
  /** Comprimento ao longo de `angle`. */
  readonly w: number;
  /** Largura perpendicular a `angle`. */
  readonly h: number;
  readonly angle: number;
}

/** Fase: tudo o que não muda durante a partida. */
export interface Level {
  readonly board: { readonly width: number; readonly height: number };
  readonly vehicles: readonly Vehicle[];
  readonly obstacles: readonly Obstacle[];
  /** Cores dos passageiros, do primeiro ao último da fila. */
  readonly queue: readonly number[];
  readonly slotCount: number;
  /** `blockers[i]`: ids dos veículos que cruzam o caminho do veículo `i`. */
  readonly blockers: readonly (readonly number[])[];
  /** `obstructed[i]`: um obstáculo fixo cruza o caminho do veículo `i` (ele nunca sai). */
  readonly obstructed: readonly boolean[];
}

/** Vaga ocupada por um veículo estacionado. */
export interface Slot {
  readonly vehicle: number;
  /** Assentos já ocupados. */
  readonly filled: number;
}

export interface State {
  readonly level: Level;
  /** Ids dos veículos ainda no tabuleiro, em ordem crescente. */
  readonly onBoard: readonly number[];
  readonly slots: readonly (Slot | null)[];
  /** Quantos passageiros já embarcaram (posição do primeiro da fila). */
  readonly queueIndex: number;
  /** Gancho da garagem (marco 5): veículos esperando para entrar. Sempre `[]` por enquanto. */
  readonly waiting: readonly number[];
}

export interface Move {
  readonly vehicle: number;
}

/** Passageiro que embarcou por causa da jogada. */
export interface Boarding {
  readonly slot: number;
  readonly vehicle: number;
  /** Índice do passageiro na fila. */
  readonly passenger: number;
  readonly color: number;
}

/** Veículo cheio que partiu e liberou a vaga. */
export interface Departure {
  readonly slot: number;
  readonly vehicle: number;
}

export type RejectReason = 'unknown-vehicle' | 'blocked' | 'no-slot';

export interface MoveApplied {
  readonly ok: true;
  readonly state: State;
  readonly move: Move;
  /** Vaga em que o veículo estacionou. */
  readonly slot: number;
  readonly boardings: readonly Boarding[];
  readonly departures: readonly Departure[];
  /** O veículo era misterioso e agora tem a cor visível. */
  readonly revealed: boolean;
}

export interface MoveRejected {
  readonly ok: false;
  readonly reason: RejectReason;
  /** O mesmo estado recebido (inalterado). */
  readonly state: State;
  /** Só para `'blocked'`: veículos ainda no tabuleiro que bloqueiam o caminho; senão `[]`. */
  readonly blockedBy: readonly number[];
  /** Só para `'blocked'`: um obstáculo fixo bloqueia o caminho; senão `false`. */
  readonly byObstacle: boolean;
}

export type MoveResult = MoveApplied | MoveRejected;
