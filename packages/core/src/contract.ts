import type { Emitter, GameEvents } from './events';
import type { Dictionary, I18n, Locale } from './i18n/i18n';
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
  /** `subscribe` daqui é limpo automaticamente no `destroy` do jogo. */
  i18n: I18n;
  /** `subscribe` daqui é limpo automaticamente no `destroy` do jogo. */
  settings: SettingsStore;
  haptics: Haptics;
  /** O jogo emite `level-complete`, `game-over`, `score` e `hud`; o portal reage. */
  events: Emitter<GameEvents>;
  /**
   * Helper 3D: cria o palco já com a qualidade gráfica das configurações. O palco
   * é descartado sozinho no `destroy` e a perda do contexto WebGL vira eventos
   * `graphics-lost` / `graphics-restored`.
   */
  createStage(container: HTMLElement, opts: Omit<StageOptions, 'quality'>): Promise<Stage>;
  /** Registra uma limpeza extra para rodar no `destroy`. */
  onDestroy(fn: () => void): void;
  /**
   * Libera tudo que o contexto rastreia (inscrições, palcos, listeners de eventos).
   * `Core.mountGame` chama isto no `destroy`; é idempotente.
   */
  dispose(): void;
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
  /** Traduções do jogo, registradas ao montar. */
  messages?: Partial<Record<Locale, Dictionary>>;
  mount(container: HTMLElement, ctx: GameContext): Promise<GameInstance>;
}

export interface GameInstance {
  pause(): void;
  resume(): void;
  restart(): void;
  /** Usa um power-up da barra do HUD (ids vêm do evento `hud`). */
  usePowerUp?(id: string): void;
  /** Avança para a próxima fase depois de `level-complete`. */
  next?(): void;
  /** Libera geometrias, materiais, texturas e listeners. Deve ser seguro chamar duas vezes. */
  destroy(): void;
}
