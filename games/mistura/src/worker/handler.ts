import { generateLevel, hint } from '../logic';
import type { LogicRequest, LogicResponse } from './protocol';

/** Teto de tempo da dica (ms). A geração usa só limite de nós, para ser determinística. */
export const HINT_MAX_MILLIS = 2000;

/**
 * Trata um pedido de forma síncrona e nunca lança: erros viram `{ type: 'error' }`.
 * É a mesma função no Worker e no fallback síncrono.
 */
export function handleRequest(req: LogicRequest): LogicResponse {
  try {
    switch (req.type) {
      case 'generate':
        return { id: req.id, type: 'generate', result: generateLevel(req.level) };
      case 'hint':
        return {
          id: req.id,
          type: 'hint',
          result: hint(req.state, { maxMillis: HINT_MAX_MILLIS }),
        };
      default:
        return { id: (req as { id: number }).id, type: 'error', message: 'pedido desconhecido' };
    }
  } catch (e) {
    const id = typeof (req as { id?: unknown })?.id === 'number' ? req.id : -1;
    return { id, type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
