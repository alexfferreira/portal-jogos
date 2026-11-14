import { describe, expect, it, vi } from 'vitest';
import { createI18n, detectLocale, isLocale, LOCALES } from './i18n';
import { messages } from './messages';

describe('detectLocale', () => {
  it('mapeia idiomas do navegador', () => {
    expect(detectLocale(['pt-PT'])).toBe('pt-BR');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['fr-FR', 'en-GB'])).toBe('en');
  });
  it('cai em pt-BR', () => {
    expect(detectLocale(['de'])).toBe('pt-BR');
    expect(detectLocale(undefined)).toBe('pt-BR');
  });
  it('isLocale valida', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('createI18n', () => {
  it('traduz, interpola e troca o idioma notificando', () => {
    const i = createI18n('pt-BR');
    const fn = vi.fn();
    i.subscribe(fn);
    expect(i.t('common.back')).toBe('Voltar');
    expect(i.t('backup.imported', { count: 3 })).toBe('3 itens importados');
    i.setLocale('en');
    expect(i.t('common.back')).toBe('Back');
    expect(fn).toHaveBeenCalledWith('en');
    i.setLocale('en');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('chave ausente devolve a chave; texto de jogo cai em pt-BR', () => {
    const i = createI18n('en');
    expect(i.t('nao.existe')).toBe('nao.existe');
    i.addMessages('pt-BR', { 'jogo.x': 'só pt' });
    expect(i.t('jogo.x')).toBe('só pt');
  });

  it('mantém placeholder sem parâmetro correspondente', () => {
    expect(createI18n().t('backup.imported', {})).toBe('{count} itens importados');
  });
});

describe('mensagens', () => {
  it('todos os idiomas têm exatamente as mesmas chaves', () => {
    const base = Object.keys(messages['pt-BR']).sort();
    for (const l of LOCALES) expect(Object.keys(messages[l]).sort()).toEqual(base);
  });
  it('sem "por favor" nem exclamação', () => {
    for (const l of LOCALES) {
      for (const text of Object.values(messages[l])) {
        expect(text).not.toMatch(/!|por favor|please|por favor/i);
      }
    }
  });
});
