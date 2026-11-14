import { levelsDefaults, scoreDefaults } from '@recreio/core';
import { describe, expect, it } from 'vitest';
import { progressLabel } from './progress';

describe('progressLabel', () => {
  it('levels mostra a fase atual', () => {
    expect(progressLabel('levels', { levels: { ...levelsDefaults(), currentLevel: 37 } })).toEqual({
      key: 'home.level',
      params: { n: 37 },
    });
  });

  it('levels sem dados começa na fase 1', () => {
    expect(progressLabel('levels', {}).params.n).toBe(1);
  });

  it('score mostra o recorde', () => {
    expect(progressLabel('score', { score: { ...scoreDefaults(), best: 1200 } })).toEqual({
      key: 'home.record',
      params: { n: 1200 },
    });
    expect(progressLabel('score', {}).params.n).toBe(0);
  });
});
