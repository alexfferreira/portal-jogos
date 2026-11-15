import { describe, expect, it, vi } from 'vitest';
import { createAudio, SOUNDS } from './audio';

/**
 * AudioContext falso: guarda o estado, conta o que foi criado e deixa o teste decidir quando
 * (e se) o `resume()` termina, como o autoplay do navegador faz.
 */
function fakeContext(initial: AudioContextState = 'suspended') {
  const fake = {
    state: initial as AudioContextState,
    currentTime: 0,
    destination: {},
    oscillators: 0,
    bufferSources: 0,
    resumeCalls: 0,
    /** O que `resume()` faz: por padrão, vira `running`. */
    onResume: (): AudioContextState => 'running',
    resolveResume: undefined as undefined | (() => void),
    deferResume: false,
    createGain: () => ({
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (x: unknown) => x,
    }),
    createDynamicsCompressor: () => ({ connect: (x: unknown) => x }),
    createOscillator: () => {
      fake.oscillators++;
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (x: unknown) => x,
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    createBuffer: () => ({}),
    createBufferSource: () => {
      fake.bufferSources++;
      return { buffer: null, connect: vi.fn(), start: vi.fn() };
    },
    resume(): Promise<void> {
      fake.resumeCalls++;
      const finish = () => {
        fake.state = fake.onResume();
      };
      if (!fake.deferResume) {
        finish();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        fake.resolveResume = () => {
          finish();
          resolve();
        };
      });
    },
    close: vi.fn(async () => {}),
  };
  return fake;
}

const setup = (initial: AudioContextState = 'suspended') => {
  const ctx = fakeContext(initial);
  const audio = createAudio(
    { sfxVolume: 1, musicVolume: 1 },
    { createContext: () => ctx as unknown as AudioContext },
  );
  return { ctx, audio };
};

describe('áudio: desbloqueio e retomada', () => {
  it('antes do primeiro gesto não existe contexto e play é silencioso', () => {
    const { ctx, audio } = setup();
    expect(audio.status).toBe('none');
    audio.play('click');
    expect(ctx.oscillators).toBe(0);
    expect(ctx.resumeCalls).toBe(0);
  });

  it('unlock cria o contexto, tenta retomar e destrava a sessão uma vez (iOS)', () => {
    const { ctx, audio } = setup('suspended');
    audio.unlock();
    expect(audio.status).toBe('running');
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.bufferSources).toBe(1);
    audio.unlock();
    audio.unlock();
    expect(ctx.bufferSources).toBe(1); // só uma amostra silenciosa
    expect(ctx.resumeCalls).toBe(1); // já está tocando: não repete o resume
  });

  it('unlock insiste em retomar a cada gesto enquanto estiver bloqueado', () => {
    const { ctx, audio } = setup('suspended');
    ctx.onResume = () => 'suspended'; // o navegador ainda não liberou
    audio.unlock();
    audio.unlock();
    audio.unlock();
    expect(ctx.resumeCalls).toBe(3);
    expect(audio.status).toBe('suspended');
    ctx.onResume = () => 'running'; // o gesto "bom" chegou
    audio.unlock();
    expect(audio.status).toBe('running');
  });

  it('tocando: play cria um oscilador por tom da receita', () => {
    const { ctx, audio } = setup('running');
    audio.unlock();
    audio.play('pour');
    expect(ctx.oscillators).toBe(SOUNDS.pour.length);
  });

  it('suspenso: play retoma o contexto e toca o som quando ele volta logo', async () => {
    const { ctx, audio } = setup('suspended');
    audio.unlock();
    ctx.state = 'suspended'; // ex.: o app voltou do segundo plano
    audio.play('click');
    expect(ctx.oscillators).toBe(0); // não agenda numa linha do tempo parada
    await vi.waitFor(() => expect(ctx.oscillators).toBe(SOUNDS.click.length));
  });

  it('suspenso e o navegador não libera: play não toca nada (nem depois)', async () => {
    const { ctx, audio } = setup('suspended');
    audio.unlock();
    ctx.state = 'suspended';
    ctx.onResume = () => 'suspended';
    audio.play('win');
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.oscillators).toBe(0);
  });

  it('som que só poderia tocar muito depois é descartado (não sai em rajada)', async () => {
    const { ctx, audio } = setup('running');
    audio.unlock();
    ctx.state = 'suspended';
    ctx.deferResume = true;
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    audio.play('click');
    now.mockReturnValue(1000 + 5000); // o resume só terminou 5 s depois
    ctx.resolveResume?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.oscillators).toBe(0);
    now.mockRestore();
  });

  it('volume de efeitos zero não toca', () => {
    const { ctx, audio } = setup('running');
    audio.unlock();
    audio.setSfxVolume(0);
    audio.play('click');
    expect(ctx.oscillators).toBe(0);
  });

  it('dispose fecha o contexto e volta ao estado "none"', () => {
    const { ctx, audio } = setup('running');
    audio.unlock();
    audio.dispose();
    expect(ctx.close).toHaveBeenCalled();
    expect(audio.status).toBe('none');
  });
});
