import type { Emitter, GameEvents } from './events';
import type { I18n } from './i18n/i18n';
import type { AudioService } from './services/audio';
import type { Haptics } from './services/haptics';
import type { SettingsStore } from './services/settings';
import type { Stage, StageOptions } from './stage/stage';
import type { GameStorage } from './storage/progress';

/** Tudo que o portal entrega a um jogo ao montá-lo (seção 4.1). */
export interface GameContext {
  /** Progresso persistido deste jogo. */
  storage: GameStorage;
  audio: AudioService;
  i18n: I18n;
  settings: SettingsStore;
  haptics: Haptics;
  /** O jogo emite `level-complete`, `game-over` e `score`; o portal reage. */
  events: Emitter<GameEvents>;
  /** Helper 3D: cria o palco já com a qualidade gráfica das configurações. */
  createStage(container: HTMLElement, opts: Omit<StageOptions, 'quality'>): Stage;
}

export interface GameMeta {
  /** Chave i18n. */
  titleKey: string;
  descriptionKey: string;
  /** Nome de ícone ou SVG inline. */
  icon: string;
  /** Progresso por fases ou por recorde. */
  mode: 'levels' | 'score';
  orientation: 'portrait';
}

export interface GameModule {
  id: string;
  meta: GameMeta;
  mount(container: HTMLElement, ctx: GameContext): Promise<GameInstance>;
}

export interface GameInstance {
  pause(): void;
  resume(): void;
  restart(): void;
  /** Libera geometrias, materiais, texturas e listeners. Deve ser seguro chamar duas vezes. */
  destroy(): void;
}
