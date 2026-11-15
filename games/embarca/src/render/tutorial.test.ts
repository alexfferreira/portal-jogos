import { describe, expect, it } from 'vitest';
import { followRoute, hasTutorial, tutorialStep, TUTORIAL_LEVELS } from './tutorial';

describe('hasTutorial', () => {
  it('só as fases 1 e 2 têm tutorial', () => {
    expect(TUTORIAL_LEVELS).toBe(2);
    expect([0, 1, 2, 3, 41].map(hasTutorial)).toEqual([false, true, true, false, false]);
  });
});

describe('tutorialStep', () => {
  it('fora do tutorial não há mão nem mensagem', () => {
    expect(tutorialStep(3, { vehicle: 4 }, 0)).toEqual({ hand: null, message: null });
    expect(tutorialStep(0, null, 0)).toEqual({ hand: null, message: null });
  });

  it('fase 1: manda tocar no veículo livre da solução', () => {
    expect(tutorialStep(1, { vehicle: 4 }, 0)).toEqual({
      hand: 4,
      message: 'embarca.tutorial.tap',
    });
  });

  it('fase 1: com veículo esperando passageiros explica a fila', () => {
    expect(tutorialStep(1, { vehicle: 2 }, 2)).toEqual({
      hand: 2,
      message: 'embarca.tutorial.queue',
    });
  });

  it('fase 1 sem jogada conhecida: só o texto, sem mão', () => {
    expect(tutorialStep(1, null, 0)).toEqual({ hand: null, message: 'embarca.tutorial.tap' });
    expect(tutorialStep(1, null, 1)).toEqual({ hand: null, message: 'embarca.tutorial.queue' });
  });

  it('fase 2: explica o bate e volta, com a mão no próximo veículo', () => {
    expect(tutorialStep(2, { vehicle: 1 }, 0)).toEqual({
      hand: 1,
      message: 'embarca.tutorial.blocked',
    });
    expect(tutorialStep(2, { vehicle: 1 }, 3).message).toBe('embarca.tutorial.blocked');
  });
});

describe('followRoute', () => {
  const route = [{ vehicle: 1 }, { vehicle: 0 }];

  it('se o jogador seguiu o roteiro, devolve o resto', () => {
    expect(followRoute(route, { vehicle: 1 })).toEqual([{ vehicle: 0 }]);
    expect(followRoute([{ vehicle: 0 }], { vehicle: 0 })).toEqual([]);
  });

  it('se saiu do roteiro ou o roteiro é vazio, devolve null', () => {
    expect(followRoute(route, { vehicle: 3 })).toBeNull();
    expect(followRoute([], { vehicle: 1 })).toBeNull();
  });

  it('não altera o roteiro recebido', () => {
    const copy = JSON.stringify(route);
    followRoute(route, { vehicle: 1 });
    expect(JSON.stringify(route)).toBe(copy);
  });
});
