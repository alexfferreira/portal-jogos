import { LOCALES } from '@recreio/core';
import { describe, expect, it } from 'vitest';
import { findGame, games } from './games';

describe('jogos do portal', () => {
  it('tem a Mistura e a Embarca, com ids únicos', () => {
    expect(games.map((g) => g.id)).toEqual(['mistura', 'embarca']);
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
  });

  it('findGame acha cada jogo e devolve undefined para um id que não existe', () => {
    expect(findGame('embarca')?.id).toBe('embarca');
    expect(findGame('mistura')?.id).toBe('mistura');
    expect(findGame('nada')).toBeUndefined();
  });

  it('os textos de todo jogo cobrem título e descrição nos três idiomas', () => {
    for (const g of games) {
      for (const l of LOCALES) {
        expect(g.messages[l][g.meta.titleKey], `${g.id} ${l} título`).toBeTruthy();
        expect(g.messages[l][g.meta.descriptionKey], `${g.id} ${l} descrição`).toBeTruthy();
      }
    }
  });
});
