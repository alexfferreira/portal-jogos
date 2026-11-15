import { describe, expect, it } from 'vitest';
import { EMBARCA_ID, messages, meta } from './meta';

describe('meta da Embarca', () => {
  it('é um jogo de fases em retrato, com ícone e chaves de texto', () => {
    expect(EMBARCA_ID).toBe('embarca');
    expect(meta.mode).toBe('levels');
    expect(meta.orientation).toBe('portrait');
    expect(meta.titleKey).toBe('embarca.title');
    expect(meta.descriptionKey).toBe('embarca.description');
    expect(meta.icon).toBe('bus');
  });

  it('tem as mesmas chaves nos três idiomas e cobre título e descrição', () => {
    const base = Object.keys(messages['pt-BR']).sort();
    for (const locale of ['en', 'es'] as const) {
      expect(Object.keys(messages[locale]).sort()).toEqual(base);
    }
    for (const dict of Object.values(messages)) {
      expect(dict[meta.titleKey]).toBeTruthy();
      expect(dict[meta.descriptionKey]).toBeTruthy();
    }
  });

  it('os textos não têm exclamação nem "por favor"', () => {
    for (const dict of Object.values(messages)) {
      for (const text of Object.values(dict)) {
        expect(text).not.toMatch(/!/);
        expect(text.toLowerCase()).not.toMatch(/por favor|please|por favor/);
      }
    }
  });
});
