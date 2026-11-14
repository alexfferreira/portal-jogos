import type { GameContext } from './contract';
import { Emitter, type GameEvents } from './events';
import { createI18n, detectLocale, type I18n } from './i18n/i18n';
import { createAudio, type AudioService } from './services/audio';
import { createHaptics, type Haptics } from './services/haptics';
import { createSettings, type SettingsStore } from './services/settings';
import { createStage } from './stage/stage';
import { createDefaultKv, type KeyValueStore } from './storage/kv';
import { createGameStorage } from './storage/progress';
import { createStorage, requestPersistence, type Storage } from './storage/storage';

export interface CoreOptions {
  /** Padrão: IndexedDB (ou memória, se não existir). */
  kv?: KeyValueStore;
  /** Idiomas do navegador para a primeira detecção. */
  languages?: readonly string[];
}

/** Serviços compartilhados do portal, já ligados entre si. */
export interface Core {
  storage: Storage;
  settings: SettingsStore;
  i18n: I18n;
  audio: AudioService;
  haptics: Haptics;
  /** Pede ao navegador para não apagar os dados. */
  persist(): Promise<boolean>;
  /** Monta o contexto de um jogo. Cada jogo ganha seu próprio emissor de eventos. */
  gameContext(gameId: string): GameContext;
}

export async function createCore(opts: CoreOptions = {}): Promise<Core> {
  const storage = createStorage(opts.kv ?? createDefaultKv());
  const languages =
    opts.languages ?? (typeof navigator === 'undefined' ? undefined : navigator.languages);
  const settings = await createSettings(storage, detectLocale(languages));

  const s = settings.get();
  const i18n = createI18n(s.locale);
  const audio = createAudio(s);
  const haptics = createHaptics(s.vibration);

  // Configurações governam os serviços.
  settings.subscribe((next) => {
    i18n.setLocale(next.locale);
    audio.setSfxVolume(next.sfxVolume);
    audio.setMusicVolume(next.musicVolume);
    haptics.setEnabled(next.vibration);
  });

  return {
    storage,
    settings,
    i18n,
    audio,
    haptics,
    persist: requestPersistence,
    gameContext(gameId) {
      return {
        storage: createGameStorage(storage, gameId),
        audio,
        i18n,
        settings,
        haptics,
        events: new Emitter<GameEvents>(),
        createStage: (container, stageOpts) => {
          const stage = createStage(container, { ...stageOpts, quality: settings.get().quality });
          // A qualidade gráfica vale ao vivo (exceto o antialias, que só muda ao reabrir o jogo).
          const off = settings.subscribe((s) => stage.setQuality(s.quality));
          const dispose = stage.dispose.bind(stage);
          stage.dispose = () => {
            off();
            dispose();
          };
          return stage;
        },
      };
    },
  };
}
