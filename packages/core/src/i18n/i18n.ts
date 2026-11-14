import { messages as baseMessages } from './messages';

export const LOCALES = ['pt-BR', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-BR';

export type Dictionary = Record<string, string>;

export interface I18n {
  readonly locale: Locale;
  setLocale(locale: Locale): void;
  /** Traduz `key`; `{nome}` no texto é trocado por `params.nome`. Chave ausente devolve a própria chave. */
  t(key: string, params?: Record<string, string | number>): string;
  /** Jogos registram suas próprias traduções. */
  addMessages(locale: Locale, dict: Dictionary): void;
  subscribe(fn: (locale: Locale) => void): () => void;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Escolhe o idioma a partir de `navigator.language(s)`; cai em pt-BR. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  for (const lang of languages ?? []) {
    const l = lang.toLowerCase();
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('es')) return 'es';
    if (l.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

export function createI18n(initial: Locale = DEFAULT_LOCALE): I18n {
  let locale = initial;
  const dicts: Record<Locale, Dictionary> = {
    'pt-BR': { ...baseMessages['pt-BR'] },
    en: { ...baseMessages.en },
    es: { ...baseMessages.es },
  };
  const listeners = new Set<(l: Locale) => void>();

  return {
    get locale() {
      return locale;
    },
    setLocale(next) {
      if (next === locale) return;
      locale = next;
      for (const fn of [...listeners]) fn(locale);
    },
    t(key, params) {
      const text = dicts[locale][key] ?? dicts[DEFAULT_LOCALE][key] ?? key;
      if (!params) return text;
      return text.replace(/\{(\w+)\}/g, (m, name: string) =>
        name in params ? String(params[name]) : m,
      );
    },
    addMessages(l, dict) {
      Object.assign(dicts[l], dict);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
