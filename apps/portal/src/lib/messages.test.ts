import { LOCALES } from '@recreio/core';
import { messages as misturaMessages } from '@recreio/game-mistura/meta';
import { describe, expect, it } from 'vitest';
import { portalMessages } from './messages';

describe('textos do portal', () => {
  it('todos os idiomas têm as mesmas chaves', () => {
    const base = Object.keys(portalMessages['pt-BR']).sort();
    for (const l of LOCALES) expect(Object.keys(portalMessages[l]).sort()).toEqual(base);
  });

  it('a Mistura tem as mesmas chaves nos três idiomas', () => {
    const base = Object.keys(misturaMessages['pt-BR']).sort();
    for (const l of LOCALES) expect(Object.keys(misturaMessages[l]).sort()).toEqual(base);
  });

  it('sem exclamação e sem "por favor"', () => {
    for (const dict of [...Object.values(portalMessages), ...Object.values(misturaMessages)]) {
      for (const text of Object.values(dict)) expect(text).not.toMatch(/!|por favor|please/i);
    }
  });

  it('os placeholders são os mesmos em todos os idiomas', () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(portalMessages['pt-BR'])) {
      const base = slots(portalMessages['pt-BR'][key]!);
      for (const l of LOCALES) expect(slots(portalMessages[l][key]!)).toEqual(base);
    }
  });
});
