import { describe, expect, it } from 'vitest';
import { findStuckSequence } from '../../../e2e/stuck';
import { generateLevel, isStuck, Session } from './logic';

/** Garante que o cenário de "sem jogadas" usado no e2e existe e se comporta como esperado. */
describe('sequência até o beco sem saída (usada no e2e)', () => {
  const setup = findStuckSequence();

  it('existe, é curta e termina sem saída', () => {
    expect(setup).not.toBeNull();
    expect(setup!.moves.length).toBeLessThanOrEqual(14);
    expect(isStuck(setup!.stuck)).toBe(true);
  });

  it('é determinística', () => {
    expect(findStuckSequence()).toEqual(setup);
  });

  it('com a sessão: desfazer volta e o tubo extra abre jogadas', () => {
    const s = new Session(generateLevel(setup!.level).state);
    for (const m of setup!.moves) expect(s.move(m).ok).toBe(true);
    expect(s.stuck).toBe(true);
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.stuck).toBe(false);
    for (const m of setup!.moves.slice(-1)) expect(s.move(m).ok).toBe(true);
    expect(s.stuck).toBe(true);
    expect(s.addTube().ok).toBe(true);
    expect(s.stuck).toBe(false);
  });
});
