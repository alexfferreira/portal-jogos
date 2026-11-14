import type { Dictionary, GameMeta, GameModule, Locale } from '@recreio/core';
import {
  messages as misturaMessages,
  meta as misturaMeta,
  MISTURA_ID,
} from '@recreio/game-mistura/meta';

export interface GameEntry {
  id: string;
  meta: GameMeta;
  messages: Record<Locale, Dictionary>;
  /** Carrega o código do jogo sob demanda (import dinâmico). */
  load(): Promise<GameModule>;
}

/** Jogos do portal. Para adicionar um: registrar aqui; o resto (cartão, rota, HUD) é genérico. */
export const games: readonly GameEntry[] = [
  {
    id: MISTURA_ID,
    meta: misturaMeta,
    messages: misturaMessages,
    load: async () => (await import('@recreio/game-mistura')).misturaGame,
  },
];

export const findGame = (id: string): GameEntry | undefined => games.find((g) => g.id === id);
