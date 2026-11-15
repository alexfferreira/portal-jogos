import { describe, expect, it } from 'vitest';
import { generateLevel, type GeneratedLevel } from './logic';
import { createLevelLoader, type LevelSource } from './levelLoader';

const noDelay = (): Promise<void> => Promise.resolve();

/** Cliente falso: cada chamada fica pendente até o teste resolver ou rejeitar. */
function manualSource() {
  const calls: {
    level: number;
    resolve(g: GeneratedLevel): void;
    reject(e: Error): void;
  }[] = [];
  const source: LevelSource = {
    generateLevel: (level) =>
      new Promise((resolve, reject) => {
        calls.push({ level, resolve, reject });
      }),
  };
  return { source, calls };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('createLevelLoader', () => {
  it('devolve a fase gerada', async () => {
    const loader = createLevelLoader({ generateLevel: async (l) => generateLevel(l) });
    const r = await loader.load(3);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.gen.level).toBe(3);
  });

  it('falha depois de todas as tentativas e avisa cada erro', async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const loader = createLevelLoader(
      {
        generateLevel: () => {
          calls++;
          return Promise.reject(new Error('worker caiu'));
        },
      },
      { attempts: 3, delay: noDelay, onError: (e) => errors.push(e) },
    );
    expect((await loader.load(2)).status).toBe('failed');
    expect(calls).toBe(3);
    expect(errors).toHaveLength(3);
  });

  it('uma tentativa que dá certo depois de falhar vence', async () => {
    let calls = 0;
    const loader = createLevelLoader(
      {
        generateLevel: async (l) => {
          if (++calls < 2) throw new Error('falha única');
          return generateLevel(l);
        },
      },
      { delay: noDelay },
    );
    expect((await loader.load(2)).status).toBe('ok');
  });

  it('invalidar durante a geração descarta o resultado antigo (restart)', async () => {
    const { source, calls } = manualSource();
    const loader = createLevelLoader(source, { delay: noDelay });
    const pending = loader.load(5);
    await flush();
    loader.invalidate();
    calls[0]?.resolve(generateLevel(5));
    expect((await pending).status).toBe('stale');
  });

  it('um pedido novo torna o anterior obsoleto', async () => {
    const { source, calls } = manualSource();
    const loader = createLevelLoader(source, { delay: noDelay });
    const first = loader.load(4);
    await flush();
    const second = loader.load(5);
    await flush();
    calls[0]?.resolve(generateLevel(4));
    calls[1]?.resolve(generateLevel(5));
    expect((await first).status).toBe('stale');
    const r = await second;
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.gen.level).toBe(5);
  });

  it('falha tardia de um pedido invalidado não vira erro', async () => {
    const { source, calls } = manualSource();
    const errors: unknown[] = [];
    const loader = createLevelLoader(source, { delay: noDelay, onError: (e) => errors.push(e) });
    const pending = loader.load(5);
    await flush();
    loader.invalidate();
    calls[0]?.reject(new Error('cancelado'));
    expect((await pending).status).toBe('stale');
    expect(errors).toHaveLength(0);
  });

  it('usa a fase pré-gerada sem pedir de novo', async () => {
    let calls = 0;
    const loader = createLevelLoader({
      generateLevel: async (l) => {
        calls++;
        return generateLevel(l);
      },
    });
    loader.prefetch(7);
    await flush();
    expect((await loader.load(7)).status).toBe('ok');
    expect(calls).toBe(1);
  });

  it('pré-geração que falhou cai para um pedido normal', async () => {
    let calls = 0;
    const loader = createLevelLoader(
      {
        generateLevel: async (l) => {
          if (++calls === 1) throw new Error('prefetch falhou');
          return generateLevel(l);
        },
      },
      { delay: noDelay },
    );
    loader.prefetch(7);
    expect((await loader.load(7)).status).toBe('ok');
    expect(calls).toBe(2);
  });
});
