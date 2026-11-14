/** Subpath puro `@recreio/core/puzzle`: ferramentas de puzzle sem three, storage, áudio nem DOM. */
export { createRng, type Rng } from '../rng';
export { PALETTE, paletteColor, type PaletteColor } from '../palette';
export { UndoStack } from './undo';
export {
  solveSearch,
  type SearchLimits,
  type SearchProblem,
  type SearchResult,
  type SearchStatus,
  type Solver,
} from './solver';
