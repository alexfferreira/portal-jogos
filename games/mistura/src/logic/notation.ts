import { createState, type UnitInput } from './state';
import type { State } from './types';

/**
 * Notação de texto para testes e depuração.
 * Tubos separados por "|", unidades da base ao topo separadas por espaço,
 * "?" depois do número marca camada oculta. Ex.: "0 1 2? | 3 | " (o último tubo é vazio).
 */
export function parseState(text: string, capacity: number): State {
  const tubes: UnitInput[][] = text.split('|').map((part) =>
    part
      .trim()
      .split(/\s+/)
      .filter((tok) => tok.length > 0)
      .map((tok) => {
        const hidden = tok.endsWith('?');
        const color = Number(hidden ? tok.slice(0, -1) : tok);
        if (!Number.isInteger(color)) throw new Error(`token inválido: ${tok}`);
        return { color, hidden };
      }),
  );
  return createState(capacity, tubes);
}

export function formatState(state: State): string {
  return state.tubes
    .map((t) => t.map((u) => `${u.color}${u.hidden ? '?' : ''}`).join(' '))
    .join(' | ');
}
