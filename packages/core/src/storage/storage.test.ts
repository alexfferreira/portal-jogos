import { describe, expect, it } from 'vitest';
import { createMemoryKv } from './kv';
import {
  completeLevel,
  createGameStorage,
  HISTORY_LIMIT,
  levelsDefaults,
  type LevelsProgress,
  recordScore,
  scoreDefaults,
} from './progress';
import { createStorage, type DocSpec } from './storage';

interface V2 {
  name: string;
  count: number;
}

const specV2: DocSpec<V2> = {
  version: 2,
  defaults: () => ({ name: '', count: 0 }),
  migrations: {
    1: (d) => ({ ...(d as { name: string }), count: 0 }),
  },
  validate: (d): d is V2 =>
    typeof d === 'object' &&
    d !== null &&
    typeof (d as V2).name === 'string' &&
    typeof (d as V2).count === 'number',
};

describe('Storage', () => {
  it('devolve defaults quando não há dado', async () => {
    const s = createStorage(createMemoryKv());
    expect(await s.load('x', specV2)).toEqual({ name: '', count: 0 });
  });

  it('grava e lê de volta', async () => {
    const s = createStorage(createMemoryKv());
    await s.save('x', { name: 'a', count: 3 }, 2);
    expect(await s.load('x', specV2)).toEqual({ name: 'a', count: 3 });
  });

  it('aplica migrações de versões antigas', async () => {
    const kv = createMemoryKv({ 'recreio:x': { v: 1, data: { name: 'velho' } } });
    const s = createStorage(kv);
    expect(await s.load('x', specV2)).toEqual({ name: 'velho', count: 0 });
  });

  it('tolera dado corrompido, sem migração ou de versão futura', async () => {
    const kv = createMemoryKv({
      'recreio:a': 'lixo',
      'recreio:b': { v: 1, data: null },
      'recreio:c': { v: 9, data: { name: 'futuro', count: 1 } },
      'recreio:d': { v: 2, data: { name: 1 } },
    });
    const s = createStorage(kv);
    for (const key of ['a', 'b', 'c', 'd']) {
      expect(await s.load(key, specV2)).toEqual({ name: '', count: 0 });
    }
  });

  it('removeWhere não apaga chaves de nome parecido', async () => {
    const s = createStorage(createMemoryKv());
    await s.save('progress:a', 1, 1);
    await s.save('progress:ab', 1, 1);
    await s.removeWhere('progress:a');
    expect(Object.keys((await s.exportAll()).entries)).toEqual(['progress:ab']);
  });

  it('importAll remove o que não veio no backup', async () => {
    const s = createStorage(createMemoryKv());
    await s.save('velho', 1, 1);
    await s.importAll({
      app: 'recreio',
      format: 1,
      exportedAt: '',
      entries: { novo: { v: 1, data: 2 } },
    });
    expect(Object.keys((await s.exportAll()).entries)).toEqual(['novo']);
  });

  it('removeWhere apaga só o prefixo pedido', async () => {
    const s = createStorage(createMemoryKv());
    await s.save('progress:mistura', 1, 1);
    await s.save('progress:mistura:extra', 1, 1);
    await s.save('progress:outro', 1, 1);
    await s.removeWhere('progress:mistura');
    const keys = Object.keys((await s.exportAll()).entries);
    expect(keys).toEqual(['progress:outro']);
  });
});

describe('export / import', () => {
  it('faz ida e volta entre armazenamentos', async () => {
    const a = createStorage(createMemoryKv());
    await a.save('settings', { lang: 'en' }, 1);
    await a.save('progress:mistura', { currentLevel: 4 }, 1);
    const backup = JSON.parse(JSON.stringify(await a.exportAll()));

    const b = createStorage(createMemoryKv());
    await b.save('lixo', 1, 1);
    expect(await b.importAll(backup)).toEqual({ ok: true, imported: 2 });
    expect(Object.keys((await b.exportAll()).entries).sort()).toEqual([
      'progress:mistura',
      'settings',
    ]);
  });

  it('rejeita arquivos inválidos sem tocar nos dados atuais', async () => {
    const s = createStorage(createMemoryKv());
    await s.save('keep', 1, 1);
    const bad = [
      null,
      'texto',
      {},
      { app: 'outro', format: 1, entries: {} },
      { app: 'recreio', format: 99, entries: {} },
      { app: 'recreio', format: 1, entries: { x: 'não é envelope' } },
    ];
    for (const raw of bad) expect(await s.importAll(raw)).toEqual({ ok: false, reason: 'invalid' });
    expect(Object.keys((await s.exportAll()).entries)).toEqual(['keep']);
  });
});

describe('progresso', () => {
  it('completeLevel avança a fase, guarda a melhor estrela e reabastece power-ups', () => {
    let p: LevelsProgress = { ...levelsDefaults(), powerUps: { undo: 2 } };
    p = completeLevel(p, 1, 2);
    expect(p).toMatchObject({ currentLevel: 2, highestCompleted: 1, powerUps: {} });
    p = completeLevel(p, 1, 1);
    expect(p.stars[1]).toBe(2);
    p = completeLevel(p, 1);
    expect(p.currentLevel).toBe(2);
  });

  it('recordScore mantém o recorde e um histórico curto', () => {
    let p = scoreDefaults();
    for (let i = 1; i <= HISTORY_LIMIT + 3; i++) p = recordScore(p, i * 10);
    p = recordScore(p, 5);
    expect(p.best).toBe((HISTORY_LIMIT + 3) * 10);
    expect(p.history).toHaveLength(HISTORY_LIMIT);
    expect(p.history[0]).toBe(5);
  });

  it('GameStorage persiste, valida e reseta', async () => {
    const storage = createStorage(createMemoryKv());
    const g = createGameStorage(storage, 'mistura');
    expect(await g.loadLevels()).toEqual(levelsDefaults());
    await g.saveLevels(completeLevel(levelsDefaults(), 3));
    expect((await g.loadLevels()).currentLevel).toBe(4);
    // dado de outro modo no mesmo slot é tratado como inválido
    await g.saveScore({ best: 1, history: [1] });
    expect(await g.loadLevels()).toEqual(levelsDefaults());
    await g.reset();
    expect(await g.loadScore()).toEqual(scoreDefaults());
  });
});
