/** Um "tom" sintetizado: oscilador com envelope e glissando opcional. */
export interface Tone {
  type: OscillatorType;
  /** Frequência em Hz, ou [início, fim] para um glissando. */
  freq: number | [number, number];
  /** Atraso a partir do início do som, em segundos. */
  at: number;
  duration: number;
  /** Ganho de pico, 0..1. */
  gain: number;
}

export type SoundName = 'click' | 'pour' | 'complete' | 'win' | 'error';

/** Receitas dos sons do portal. Dados puros: trocáveis por arquivos depois. */
export const SOUNDS: Record<SoundName, readonly Tone[]> = {
  click: [{ type: 'triangle', freq: [660, 880], at: 0, duration: 0.06, gain: 0.35 }],
  pour: [
    { type: 'sine', freq: [520, 300], at: 0, duration: 0.18, gain: 0.3 },
    { type: 'sine', freq: [480, 260], at: 0.12, duration: 0.18, gain: 0.25 },
    { type: 'sine', freq: [440, 240], at: 0.24, duration: 0.2, gain: 0.2 },
  ],
  complete: [
    { type: 'triangle', freq: 784, at: 0, duration: 0.12, gain: 0.35 },
    { type: 'triangle', freq: 1175, at: 0.1, duration: 0.2, gain: 0.35 },
  ],
  win: [
    { type: 'triangle', freq: 523, at: 0, duration: 0.14, gain: 0.35 },
    { type: 'triangle', freq: 659, at: 0.12, duration: 0.14, gain: 0.35 },
    { type: 'triangle', freq: 784, at: 0.24, duration: 0.14, gain: 0.35 },
    { type: 'triangle', freq: 1047, at: 0.36, duration: 0.4, gain: 0.4 },
  ],
  error: [{ type: 'square', freq: [220, 160], at: 0, duration: 0.16, gain: 0.18 }],
};

/** Duração total de um som, em segundos. */
export function soundDuration(tones: readonly Tone[]): number {
  return tones.reduce((max, t) => Math.max(max, t.at + t.duration), 0);
}

export interface AudioService {
  /** Cria/retoma o AudioContext. Chame dentro de um gesto do usuário. */
  unlock(): void;
  play(name: SoundName): void;
  /** Registra/substitui um som por outra implementação (ex.: arquivo via Howler depois). */
  register(name: string, player: () => void): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  dispose(): void;
}

export function createAudio(initial: { sfxVolume: number; musicVolume: number }): AudioService {
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let sfxVolume = initial.sfxVolume;
  // A música ainda não existe (sem assets); o volume fica guardado para quando houver.
  let musicVolume = initial.musicVolume;
  const custom = new Map<string, () => void>();

  const ensure = (): AudioContext | undefined => {
    if (ctx) return ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext === 'undefined' ? undefined : AudioContext;
    if (!Ctor) return undefined;
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
    return ctx;
  };

  const playTones = (tones: readonly Tone[]): void => {
    const c = ctx;
    if (!c || !master || sfxVolume <= 0) return;
    const start = c.currentTime;
    for (const tone of tones) {
      const osc = c.createOscillator();
      const g = c.createGain();
      const t0 = start + tone.at;
      const t1 = t0 + tone.duration;
      osc.type = tone.type;
      if (Array.isArray(tone.freq)) {
        osc.frequency.setValueAtTime(tone.freq[0], t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.freq[1]), t1);
      } else {
        osc.frequency.setValueAtTime(tone.freq, t0);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain * sfxVolume), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    play(name) {
      const override = custom.get(name);
      if (override) return override();
      // Sem gesto prévio o contexto não existe: nada toca (política de autoplay).
      playTones(SOUNDS[name]);
    },
    register(name, player) {
      custom.set(name, player);
    },
    setSfxVolume(v) {
      sfxVolume = Math.min(1, Math.max(0, v));
    },
    setMusicVolume(v) {
      musicVolume = Math.min(1, Math.max(0, v));
      void musicVolume;
    },
    dispose() {
      void ctx?.close();
      ctx = undefined;
      master = undefined;
      custom.clear();
    },
  };
}
