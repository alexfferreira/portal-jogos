import type { GeneratedLevel, HintResult, State } from '../logic';

/** Mensagens trocadas com o Worker. Tudo serializável (structured clone). */
export type LogicRequest =
  { id: number; type: 'generate'; level: number } | { id: number; type: 'hint'; state: State };

export type LogicResponse =
  | { id: number; type: 'generate'; result: GeneratedLevel }
  | { id: number; type: 'hint'; result: HintResult }
  | { id: number; type: 'error'; message: string };

/** Pedido sem o `id` (o cliente atribui). Omit distribuído sobre a união. */
export type LogicRequestBody = LogicRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never;
