import { describe, expect, it, vi } from 'vitest';
import type { GameInstance, GameModule } from './contract';
import { createCore, type CoreOptions, type StageFactory } from './core';
import type { Quality } from './services/settings';
import type { Stage } from './stage/stage';
import { createMemoryKv } from './storage/kv';

/** Palco falso: só registra chamadas. Permite disparar perda/volta de contexto. */
function fakeStage() {
  const lost = new Set<() => void>();
  const restored = new Set<() => void>();
  const stage = {
    dispose: vi.fn(),
    setQuality: vi.fn<(q: Quality) => void>(),
    onContextLost: (fn: () => void) => {
      lost.add(fn);
      return () => void lost.delete(fn);
    },
    onContextRestored: (fn: () => void) => {
      restored.add(fn);
      return () => void restored.delete(fn);
    },
  };
  return {
    stage: stage as unknown as Stage,
    mock: stage,
    loseContext: () => lost.forEach((fn) => fn()),
    restoreContext: () => restored.forEach((fn) => fn()),
    listeners: () => lost.size + restored.size,
  };
}

async function setup(extra: Partial<CoreOptions> = {}) {
  const fakes: ReturnType<typeof fakeStage>[] = [];
  const stageFactory: StageFactory = () => {
    const f = fakeStage();
    fakes.push(f);
    return f.stage;
  };
  const core = await createCore({
    kv: createMemoryKv(),
    languages: ['pt-BR'],
    stageFactory,
    ...extra,
  });
  return { core, fakes };
}

const container = {} as HTMLElement;
const stageOpts = { camera: 'ortho-top', bounds: { width: 1, depth: 1 } } as const;

describe('GameContext: limpeza automática', () => {
  it('inscrições em settings e i18n somem no dispose', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    const onSettings = vi.fn();
    const onI18n = vi.fn();
    ctx.settings.subscribe(onSettings);
    ctx.i18n.subscribe(onI18n);

    core.settings.set({ colorblind: true });
    core.i18n.setLocale('en');
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onI18n).toHaveBeenCalledTimes(1);

    ctx.dispose();
    core.settings.set({ colorblind: false });
    core.i18n.setLocale('es');
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onI18n).toHaveBeenCalledTimes(1);
  });

  it('inscrição feita depois do dispose é desfeita na hora', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    ctx.dispose();
    const fn = vi.fn();
    ctx.settings.subscribe(fn);
    core.settings.set({ colorblind: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it('outros jogos e o próprio core não são afetados', async () => {
    const { core } = await setup();
    const a = core.gameContext('a');
    const b = core.gameContext('b');
    const fb = vi.fn();
    b.settings.subscribe(fb);
    a.dispose();
    core.settings.set({ colorblind: true });
    expect(fb).toHaveBeenCalledOnce();
    expect(core.i18n.t('common.back')).toBe('Voltar');
  });

  it('o ctx.i18n com escopo continua traduzindo e trocando idioma', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    expect(ctx.i18n.locale).toBe('pt-BR');
    ctx.i18n.setLocale('en');
    expect(ctx.i18n.t('common.back')).toBe('Back');
    expect(core.i18n.locale).toBe('en');
  });

  it('o palco é descartado no dispose, com a qualidade acompanhando as configurações', async () => {
    const { core, fakes } = await setup();
    const ctx = core.gameContext('g');
    await ctx.createStage(container, stageOpts);
    const f = fakes[0]!;

    core.settings.set({ quality: 'low' });
    expect(f.mock.setQuality).toHaveBeenCalledWith('low');

    ctx.dispose();
    expect(f.mock.dispose).toHaveBeenCalledOnce();
    expect(f.listeners()).toBe(0);
    core.settings.set({ quality: 'high' });
    expect(f.mock.setQuality).toHaveBeenCalledTimes(1);
  });

  it('onDestroy roda na ordem inversa e um erro não impede as demais', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    const order: number[] = [];
    ctx.onDestroy(() => order.push(1));
    ctx.onDestroy(() => {
      throw new Error('falha de teste');
    });
    ctx.onDestroy(() => order.push(3));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    ctx.dispose();
    ctx.dispose(); // idempotente
    expect(order).toEqual([3, 1]);
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it('dispose limpa os listeners de eventos do jogo', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    const fn = vi.fn();
    ctx.events.on('score', fn);
    ctx.dispose();
    ctx.events.emit('score', { score: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('createStage que termina depois do dispose descarta o palco e rejeita', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fakeStage();
    const { core } = await setup({
      stageFactory: async () => {
        await gate;
        return f.stage;
      },
    });
    const ctx = core.gameContext('g');
    const pending = ctx.createStage(container, stageOpts);
    ctx.dispose();
    release();
    await expect(pending).rejects.toThrow(/descartado/);
    expect(f.mock.dispose).toHaveBeenCalledOnce();
  });
});

describe('perda de contexto WebGL', () => {
  it('vira eventos graphics-lost e graphics-restored para o portal', async () => {
    const { core, fakes } = await setup();
    const ctx = core.gameContext('g');
    const seen: string[] = [];
    ctx.events.on('graphics-lost', () => seen.push('lost'));
    ctx.events.on('graphics-restored', () => seen.push('restored'));
    await ctx.createStage(container, stageOpts);

    fakes[0]!.loseContext();
    fakes[0]!.restoreContext();
    expect(seen).toEqual(['lost', 'restored']);
  });

  it('depois do dispose os eventos não chegam mais', async () => {
    const { core, fakes } = await setup();
    const ctx = core.gameContext('g');
    const fn = vi.fn();
    ctx.events.on('graphics-lost', fn);
    await ctx.createStage(container, stageOpts);
    ctx.dispose();
    fakes[0]!.loseContext();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('Core.mountGame', () => {
  function gameWith(mount: GameModule['mount'], extra: Partial<GameModule> = {}): GameModule {
    return {
      id: 'g',
      meta: {
        titleKey: 't',
        descriptionKey: 'd',
        icon: 'cube',
        mode: 'score',
        orientation: 'portrait',
      },
      mount,
      ...extra,
    };
  }

  const instance = (destroy: () => void): GameInstance => ({
    pause() {},
    resume() {},
    restart() {},
    destroy,
  });

  it('destroy da instância também faz o dispose do contexto (uma vez)', async () => {
    const { core, fakes } = await setup();
    const inner = vi.fn();
    const sub = vi.fn();
    const game = gameWith(async (c, ctx) => {
      await ctx.createStage(c, stageOpts);
      ctx.settings.subscribe(sub);
      return instance(inner);
    });

    const mounted = await core.mountGame(game, container);
    mounted.destroy();
    mounted.destroy();

    expect(inner).toHaveBeenCalledOnce();
    expect(fakes[0]!.mock.dispose).toHaveBeenCalledOnce();
    core.settings.set({ colorblind: true });
    expect(sub).not.toHaveBeenCalled();
  });

  it('limpa o contexto mesmo se o destroy do jogo lançar', async () => {
    const { core, fakes } = await setup();
    const game = gameWith(async (c, ctx) => {
      await ctx.createStage(c, stageOpts);
      return instance(() => {
        throw new Error('quebrou');
      });
    });
    const mounted = await core.mountGame(game, container);
    expect(() => mounted.destroy()).toThrow('quebrou');
    expect(fakes[0]!.mock.dispose).toHaveBeenCalledOnce();
  });

  it('falha no mount limpa o que já foi criado e propaga o erro', async () => {
    const { core, fakes } = await setup();
    const game = gameWith(async (c, ctx) => {
      await ctx.createStage(c, stageOpts);
      throw new Error('sem WebGL');
    });
    await expect(core.mountGame(game, container)).rejects.toThrow('sem WebGL');
    expect(fakes[0]!.mock.dispose).toHaveBeenCalledOnce();
  });

  it('funciona com instância de classe que usa this', async () => {
    const { core } = await setup();
    class Jogo implements GameInstance {
      paused = false;
      destroyed = 0;
      pause() {
        this.paused = true;
      }
      resume() {
        this.paused = false;
      }
      restart() {}
      next() {}
      destroy() {
        this.destroyed++;
      }
    }
    const inst = new Jogo();
    const mounted = await core.mountGame(
      gameWith(async () => inst),
      container,
    );
    mounted.pause();
    expect(inst.paused).toBe(true);
    mounted.resume();
    expect(inst.paused).toBe(false);
    expect(mounted.next).toBeTypeOf('function');
    expect(mounted.usePowerUp).toBeUndefined();
    mounted.destroy();
    expect(inst.destroyed).toBe(1);
  });

  it('createStage com fábrica que rejeita propaga o erro sem deixar palco', async () => {
    const { core } = await setup({
      stageFactory: async () => {
        throw new Error('sem WebGL');
      },
    });
    const ctx = core.gameContext('g');
    await expect(ctx.createStage(container, stageOpts)).rejects.toThrow('sem WebGL');
    expect(() => ctx.dispose()).not.toThrow();
  });

  it('registra as traduções do jogo e usa o contexto recebido', async () => {
    const { core } = await setup();
    const ctx = core.gameContext('g');
    const game = gameWith(async () => instance(() => {}), {
      messages: { 'pt-BR': { 'g.titulo': 'Meu jogo' }, en: { 'g.titulo': 'My game' } },
    });
    await core.mountGame(game, container, ctx);
    expect(core.i18n.t('g.titulo')).toBe('Meu jogo');
    core.i18n.setLocale('en');
    expect(core.i18n.t('g.titulo')).toBe('My game');
  });
});
