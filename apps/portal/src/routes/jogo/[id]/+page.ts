import { games } from '#lib/games.ts';

/** Uma página pré-renderizada por jogo; ids desconhecidos caem no fallback e mostram "não encontrado". */
export function entries() {
  return games.map((g) => ({ id: g.id }));
}
