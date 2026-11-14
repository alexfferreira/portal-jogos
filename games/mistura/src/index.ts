// Ponto de entrada mínimo do jogo. A lógica e o cliente do Worker ficam em subpaths:
// `@recreio/game-mistura/logic` e `@recreio/game-mistura/worker`.
export { messages, meta, MISTURA_ID } from './meta';
export { misturaGame } from './game';
