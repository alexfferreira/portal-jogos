import { describe, expect, it } from 'vitest';
import {
  followRoteiro,
  handPose,
  hasTutorial,
  HAND_CYCLE,
  tutorialStep,
  TUTORIAL_MESSAGES,
} from './tutorial';

describe('tutorialStep', () => {
  const next = { from: 2, to: 4 };
  it('só nas fases 1 e 2', () => {
    expect(hasTutorial(1) && hasTutorial(2)).toBe(true);
    expect(hasTutorial(3)).toBe(false);
    expect(tutorialStep(3, null, next)).toEqual({ hand: null, message: null });
  });
  it('sem seleção: mão do tubo de origem ao destino e texto da fase', () => {
    expect(tutorialStep(1, null, next)).toEqual({
      hand: { from: 2, to: 4 },
      message: TUTORIAL_MESSAGES.select,
    });
    expect(tutorialStep(2, null, next).message).toBe(TUTORIAL_MESSAGES.rules);
  });
  it('origem certa selecionada: mão só no destino', () => {
    expect(tutorialStep(1, 2, next)).toEqual({
      hand: { from: null, to: 4 },
      message: TUTORIAL_MESSAGES.pour,
    });
  });
  it('tubo errado selecionado: mostra como cancelar', () => {
    expect(tutorialStep(1, 0, next)).toEqual({
      hand: { from: null, to: 0 },
      message: TUTORIAL_MESSAGES.cancel,
    });
  });
  it('sem jogada conhecida: só o texto', () => {
    expect(tutorialStep(1, null, null).hand).toBeNull();
    expect(tutorialStep(1, null, null).message).toBe(TUTORIAL_MESSAGES.select);
  });
});

describe('followRoteiro', () => {
  const route = [
    { from: 0, to: 1 },
    { from: 2, to: 3 },
  ];
  it('avança quando o jogador segue o roteiro', () => {
    expect(followRoteiro(route, { from: 0, to: 1 })).toEqual([{ from: 2, to: 3 }]);
  });
  it('devolve null quando sai do roteiro (recalcular pelo Worker)', () => {
    expect(followRoteiro(route, { from: 1, to: 0 })).toBeNull();
    expect(followRoteiro([], { from: 0, to: 1 })).toBeNull();
  });
});

describe('handPose', () => {
  it('é periódica, com alpha em 0..1 e blend em 0..1', () => {
    for (const hasFrom of [true, false]) {
      for (let t = 0; t < HAND_CYCLE * 2; t += 0.05) {
        const p = handPose(t, hasFrom);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
        expect(p.blend).toBeGreaterThanOrEqual(0);
        expect(p.blend).toBeLessThanOrEqual(1);
        expect(handPose(t + HAND_CYCLE, hasFrom).alpha).toBeCloseTo(p.alpha);
      }
    }
  });
  it('desliza da origem ao destino', () => {
    expect(handPose(0.5, true).blend).toBe(0);
    expect(handPose(1.7, true).blend).toBe(1);
  });
});
