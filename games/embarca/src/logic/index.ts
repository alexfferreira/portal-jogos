export { rectsOverlap, sweepRect, type Rect } from './geometry';
export {
  createLevel,
  DEFAULT_SLOT_COUNT,
  VEHICLE_SPECS,
  type LevelInput,
  type VehicleInput,
} from './level';
export {
  canUsePowerUp,
  consumePowerUp,
  createPowerUps,
  POWERUPS_PER_LEVEL,
  Session,
  type ExtraSlotOutcome,
  type PowerUpKind,
  type PowerUps,
  type UndoOutcome,
} from './session';
export {
  addSlot,
  applyMove,
  createState,
  isFree,
  isStuck,
  isWin,
  legalMoves,
  visibleColor,
} from './state';
export { cos, normalizeAngle, sin, TRIG_SCALE } from './trig';
export type {
  Boarding,
  Departure,
  Level,
  Move,
  MoveApplied,
  MoveRejected,
  MoveResult,
  Obstacle,
  RejectReason,
  Slot,
  State,
  Vehicle,
  VehicleKind,
} from './types';
