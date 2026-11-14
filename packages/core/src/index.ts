export const CORE_VERSION = '0.1.0';

export type { GameContext, GameInstance, GameMeta, GameModule } from './contract';
export { createCore, type Core, type CoreOptions, type StageFactory } from './core';
export { demoGame } from './demo/demo';
export { Emitter, type GameEvents, type HudState, type PowerUpState } from './events';
export {
  createI18n,
  DEFAULT_LOCALE,
  detectLocale,
  isLocale,
  LOCALES,
  type Dictionary,
  type I18n,
  type Locale,
} from './i18n/i18n';
export { PALETTE, paletteColor, type PaletteColor } from './palette';
export { createRng, type Rng } from './rng';
export {
  createAudio,
  SOUNDS,
  type AudioService,
  type SoundName,
  type Tone,
} from './services/audio';
export { createHaptics, type Haptics } from './services/haptics';
export {
  createSettings,
  defaultSettings,
  normalizeSettings,
  type Quality,
  type Settings,
  type SettingsStore,
} from './services/settings';
export {
  fitOrthoFront,
  fitOrthographic,
  fitPerspective,
  type Bounds,
  type FrontBounds,
} from './stage/fit';
export { createToyMaterial } from './stage/materials';
export {
  createStage,
  disposeObject,
  type CameraPreset,
  type DragEvent,
  type PickHit,
  type PointerInfo,
  type Stage,
  type StageOptions,
} from './stage/stage';
export { createDefaultKv, createIdbKv, createMemoryKv, type KeyValueStore } from './storage/kv';
export {
  completeLevel,
  createGameStorage,
  levelsDefaults,
  recordScore,
  scoreDefaults,
  type GameStorage,
  type LevelsProgress,
  type ScoreProgress,
} from './storage/progress';
export {
  createStorage,
  requestPersistence,
  type BackupFile,
  type DocSpec,
  type ImportResult,
  type Migrations,
  type Storage,
} from './storage/storage';
export { easing, Tweens, type Easing, type TweenHandle, type TweenOptions } from './tween';
export {
  solveSearch,
  type SearchLimits,
  type SearchProblem,
  type SearchResult,
  type SearchStatus,
  type Solver,
} from './puzzle/solver';
export { UndoStack } from './puzzle/undo';
