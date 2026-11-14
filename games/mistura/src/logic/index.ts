export {
  generateLevel,
  levelConfig,
  MAX_COLORS,
  mixSeed,
  type GeneratedLevel,
  type GenerateOptions,
  type LevelConfig,
} from './generator';
export { formatState, parseState } from './notation';
export {
  addEmptyTube,
  applyMove,
  createState,
  isComplete,
  isPure,
  isStuck,
  isValidMove,
  isWin,
  legalMoves,
  topBlock,
  topUnit,
  type UnitInput,
} from './state';
export {
  canonicalKey,
  hint,
  misturaProblem,
  searchMoves,
  solve,
  type HintResult,
  type SolveResult,
} from './solver';
export type {
  InvalidReason,
  Move,
  MoveApplied,
  MoveRejected,
  MoveResult,
  Revealed,
  State,
  Tube,
  Unit,
} from './types';
export {
  canUsePowerUp,
  consumePowerUp,
  createPowerUps,
  POWERUPS_PER_LEVEL,
  Session,
  type ExtraTubeOutcome,
  type PowerUpKind,
  type PowerUps,
  type UndoOutcome,
} from './session';
