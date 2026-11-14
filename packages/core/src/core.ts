import type { GameContext, GameInstance, GameModule } from './contract';
import { Emitter, type GameEvents } from './events';
import { createI18n, detectLocale, LOCALES, type I18n } from './i18n/i18n';
import { createAudio, type AudioService } from './services/audio';
import { createHaptics, type Haptics } from './services/haptics';
import { createSettings, type SettingsStore } from './services/settings';
import type { Stage, StageOptions } from './stage/stage';
import { createDefaultKv, type KeyValueStore } from './storage/kv';
import { createGameStorage } from './storage/progress';
import { createStorage, requestPersistence, type Storage } from './storage/storage';

export type StageFactory = (container: HTMLElement, opts: StageOptions) => Promise<Stage> | Stage;

export interface CoreOptions {
  /** Padrão: IndexedDB (ou memória, se não existir). */
  kv?: KeyValueStore;
  /** Idiomas do navegador para a primeira detecção. */
  languages?: readonly string[];
  /** Padrão: importa `createStage` sob demanda (mantém o Three.js fora do bundle inicial). */
  stageFactory?: StageFactory;
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
  /**
   * Monta o jogo e garante a limpeza: o `destroy` da instância devolvida também
   * chama `ctx.dispose()`, e uma falha no `mount` limpa o contexto antes de propagar.
   */
  mountGame(module: GameModule, container: HTMLElement, ctx?: GameContext): Promise<GameInstance>;
}

const defaultStageFactory: StageFactory = async (container, opts) => {
  const { createStage } = await import('./stage/stage');
  return createStage(container, opts);
};

/** Acumula limpezas e as executa uma vez, na ordem inversa. */
function createScope() {
  const fns: (() => void)[] = [];
  let disposed = false;
  return {
    get disposed() {
      return disposed;
    },
    add(fn: () => void): void {
      if (disposed) fn();
      else fns.push(fn);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const fn of fns.splice(0).reverse()) {
        try {
          fn();
        } catch (err) {
          console.error('[core] erro ao limpar o jogo', err);
        }
      }
    },
  };
}

export async function createCore(opts: CoreOptions = {}): Promise<Core> {
  const storage = createStorage(opts.kv ?? createDefaultKv());
  const languages =
    opts.languages ?? (typeof navigator === 'undefined' ? undefined : navigator.languages);
  const settings = await createSettings(storage, detectLocale(languages));
  const stageFactory = opts.stageFactory ?? defaultStageFactory;

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

  const gameContext = (gameId: string): GameContext => {
    const scope = createScope();
    const events = new Emitter<GameEvents>();

    // Versões "com escopo": as inscrições feitas pelo jogo somem no destroy.
    const scopedSettings: SettingsStore = {
      get: () => settings.get(),
      set: (patch) => settings.set(patch),
      subscribe(fn) {
        const off = settings.subscribe(fn);
        scope.add(off);
        return off;
      },
    };
    const scopedI18n: I18n = {
      get locale() {
        return i18n.locale;
      },
      setLocale: (l) => i18n.setLocale(l),
      t: (key, params) => i18n.t(key, params),
      addMessages: (l, dict) => i18n.addMessages(l, dict),
      subscribe(fn) {
        const off = i18n.subscribe(fn);
        scope.add(off);
        return off;
      },
    };

    return {
      storage: createGameStorage(storage, gameId),
      audio,
      i18n: scopedI18n,
      settings: scopedSettings,
      haptics,
      events,
      async createStage(container, stageOpts) {
        const stage = await stageFactory(container, {
          ...stageOpts,
          quality: settings.get().quality,
        });
        if (scope.disposed) {
          // O jogo foi destruído enquanto o palco carregava.
          stage.dispose();
          throw new Error('contexto do jogo já foi descartado');
        }
        // A qualidade gráfica vale ao vivo (exceto o antialias, que só muda ao reabrir o jogo).
        scope.add(settings.subscribe((next) => stage.setQuality(next.quality)));
        scope.add(stage.onContextLost(() => events.emit('graphics-lost', {})));
        scope.add(stage.onContextRestored(() => events.emit('graphics-restored', {})));
        scope.add(() => stage.dispose());
        return stage;
      },
      onDestroy: (fn) => scope.add(fn),
      dispose() {
        scope.dispose();
        events.clear();
      },
    };
  };

  return {
    storage,
    settings,
    i18n,
    audio,
    haptics,
    persist: requestPersistence,
    gameContext,
    async mountGame(module, container, ctx = gameContext(module.id)) {
      for (const locale of LOCALES) {
        const dict = module.messages?.[locale];
        if (dict) i18n.addMessages(locale, dict);
      }
      let instance: GameInstance;
      try {
        instance = await module.mount(container, ctx);
      } catch (err) {
        ctx.dispose();
        throw err;
      }
      let destroyed = false;
      // Delegação explícita (não spread): funciona com instâncias de classe, getters e `this`.
      return {
        pause: () => instance.pause(),
        resume: () => instance.resume(),
        restart: () => instance.restart(),
        usePowerUp: instance.usePowerUp ? (id) => instance.usePowerUp?.(id) : undefined,
        next: instance.next ? () => instance.next?.() : undefined,
        destroy() {
          if (destroyed) return;
          destroyed = true;
          try {
            instance.destroy();
          } finally {
            ctx.dispose();
          }
        },
      };
    },
  };
}
