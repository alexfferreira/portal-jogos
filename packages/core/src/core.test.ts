import { describe, expect, it } from 'vitest';
import { createCore } from './core';
import { createMemoryKv } from './storage/kv';

describe('createCore', () => {
  it('detecta o idioma na primeira vez', async () => {
    const core = await createCore({ kv: createMemoryKv(), languages: ['es-AR'] });
    expect(core.i18n.locale).toBe('es');
    expect(core.i18n.t('common.back')).toBe('Volver');
  });

  it('as configurações governam o i18n e persistem entre sessões', async () => {
    const kv = createMemoryKv();
    const a = await createCore({ kv, languages: ['pt-BR'] });
    a.settings.set({ locale: 'en' });
    expect(a.i18n.t('common.back')).toBe('Back');
    await Promise.resolve();

    const b = await createCore({ kv, languages: ['pt-BR'] });
    expect(b.i18n.locale).toBe('en');
  });

  it('cada jogo tem progresso isolado e seu próprio emissor', async () => {
    const core = await createCore({ kv: createMemoryKv(), languages: ['pt-BR'] });
    const a = core.gameContext('a');
    const b = core.gameContext('b');
    await a.storage.saveScore({ best: 9, history: [9] });
    expect((await b.storage.loadScore()).best).toBe(0);
    expect((await a.storage.loadScore()).best).toBe(9);
    expect(a.events).not.toBe(b.events);
  });

  it('backup completo cobre configurações e progresso', async () => {
    const core = await createCore({ kv: createMemoryKv(), languages: ['pt-BR'] });
    core.settings.set({ colorblind: true });
    await core.gameContext('a').storage.saveScore({ best: 1, history: [1] });
    await Promise.resolve();
    const keys = Object.keys((await core.storage.exportAll()).entries).sort();
    expect(keys).toEqual(['progress:a', 'settings']);
  });
});
