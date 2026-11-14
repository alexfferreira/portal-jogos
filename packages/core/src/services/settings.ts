import { isLocale, type Locale } from '../i18n/i18n';
import type { DocSpec, Storage } from '../storage/storage';

export type Quality = 'high' | 'low';

export interface Settings {
  locale: Locale;
  /** Volume dos efeitos, 0..1. */
  sfxVolume: number;
  /** Volume da música, 0..1. */
  musicVolume: number;
  vibration: boolean;
  quality: Quality;
  colorblind: boolean;
}

export const SETTINGS_KEY = 'settings';
export const SETTINGS_VERSION = 1;

export const defaultSettings = (locale: Locale = 'pt-BR'): Settings => ({
  locale,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  vibration: true,
  quality: 'high',
  colorblind: false,
});

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Completa campos ausentes/inválidos com os padrões. Nunca lança. */
export function normalizeSettings(raw: unknown, fallbackLocale: Locale = 'pt-BR'): Settings {
  const d = defaultSettings(fallbackLocale);
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  return {
    locale: isLocale(r.locale) ? r.locale : d.locale,
    sfxVolume: typeof r.sfxVolume === 'number' ? clamp01(r.sfxVolume) : d.sfxVolume,
    musicVolume: typeof r.musicVolume === 'number' ? clamp01(r.musicVolume) : d.musicVolume,
    vibration: typeof r.vibration === 'boolean' ? r.vibration : d.vibration,
    quality: r.quality === 'low' || r.quality === 'high' ? r.quality : d.quality,
    colorblind: typeof r.colorblind === 'boolean' ? r.colorblind : d.colorblind,
  };
}

export interface SettingsStore {
  get(): Settings;
  set(patch: Partial<Settings>): void;
  subscribe(fn: (s: Settings) => void): () => void;
}

/**
 * Carrega as configurações salvas (ou usa `fallbackLocale` na primeira vez) e
 * persiste cada alteração.
 */
export async function createSettings(
  storage: Storage,
  fallbackLocale: Locale = 'pt-BR',
): Promise<SettingsStore> {
  const spec: DocSpec<Settings> = {
    version: SETTINGS_VERSION,
    defaults: () => defaultSettings(fallbackLocale),
  };
  let current = normalizeSettings(await storage.load(SETTINGS_KEY, spec), fallbackLocale);
  const listeners = new Set<(s: Settings) => void>();

  return {
    get: () => current,
    set(patch) {
      current = normalizeSettings({ ...current, ...patch }, fallbackLocale);
      void storage.save(SETTINGS_KEY, current, SETTINGS_VERSION).catch(() => {});
      for (const fn of [...listeners]) fn(current);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
