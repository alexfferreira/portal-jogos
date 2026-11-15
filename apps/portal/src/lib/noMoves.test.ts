import { describe, expect, it } from 'vitest';
import { noMovesExtraAction } from './noMoves';

describe('noMovesExtraAction', () => {
  it('sem campos vale o "tubo extra" da Mistura', () => {
    expect(noMovesExtraAction({})).toEqual({ id: 'extraTube', labelKey: 'nomoves.extraTube' });
  });

  it('usa a ação e o rótulo que o jogo mandou', () => {
    expect(
      noMovesExtraAction({ extraId: 'extraSlot', extraLabelKey: 'embarca.powerup.extraSlot' }),
    ).toEqual({ id: 'extraSlot', labelKey: 'embarca.powerup.extraSlot' });
  });

  it('com só um dos campos, o outro fica no padrão', () => {
    expect(noMovesExtraAction({ extraId: 'extraSlot' })).toEqual({
      id: 'extraSlot',
      labelKey: 'nomoves.extraTube',
    });
    expect(noMovesExtraAction({ extraLabelKey: 'x.y' })).toEqual({
      id: 'extraTube',
      labelKey: 'x.y',
    });
  });
});
