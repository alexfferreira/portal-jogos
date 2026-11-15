export { levelConfig, type LevelConfig } from './config';
export { playOrder, randomPlayoutWinRate, type PlayOutcome } from './difficulty';
export { rectsOverlap, sweepRect, type Rect } from './geometry';
export {
  buildGeometry,
  createLevel,
  DEFAULT_SLOT_COUNT,
  sweepFor,
  VEHICLE_SPECS,
  type Geometry,
  type GeometryInput,
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
export { CLEARANCE, placeVehicles, type PlacedVehicle } from './placement';
export { buildColorsAndQueue, type ColorPlan } from './queue';
export { mixSeed } from './seed';
export {
  canonicalKey,
  embarcaProblem,
  hint,
  solve,
  type HintResult,
  type SolveResult,
} from './solver';
export {
  addSlot,
  applyMove,
  createState,
  isFree,
  isStuck,
  isWin,
  legalMoves,
  settle,
  visibleColor,
  type Settled,
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
