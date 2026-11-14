import { createCore, LOCALES, type Core, type Locale, type Settings } from '@recreio/core';
import { games } from './games';
import { portalMessages } from './messages';

/** Estado reativo do app: idioma e configurações atuais. */
export const app = $state<{
  core: Core | undefined;
  locale: Locale;
  settings: Settings | undefined;
}>({ core: undefined, locale: 'pt-BR', settings: undefined });

let starting: Promise<Core> | undefined;

/** Cria os serviços uma única vez e liga o estado reativo a eles. */
export function initApp(): Promise<Core> {
  starting ??= (async () => {
    const core = await createCore();
    for (const locale of LOCALES) {
      core.i18n.addMessages(locale, portalMessages[locale]);
      for (const game of games) core.i18n.addMessages(locale, game.messages[locale]);
    }
    app.core = core;
    app.locale = core.i18n.locale;
    app.settings = core.settings.get();
    core.i18n.subscribe((l) => {
      app.locale = l;
      document.documentElement.lang = l;
    });
    core.settings.subscribe((s) => (app.settings = s));
    document.documentElement.lang = core.i18n.locale;
    void core.persist();
    return core;
  })();
  return starting;
}

/** Tradução reativa: relê ao trocar o idioma. */
export function t(key: string, params?: Record<string, string | number>): string {
  void app.locale;
  return app.core?.i18n.t(key, params) ?? '';
}
