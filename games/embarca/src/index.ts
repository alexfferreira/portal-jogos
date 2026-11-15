// Ponto de entrada do jogo. A lógica e o cliente do Worker ficam em subpaths:
// `@recreio/game-embarca/logic` e `@recreio/game-embarca/worker`.
export { EMBARCA_ID, messages, meta } from './meta';
export { embarcaGame } from './game';
