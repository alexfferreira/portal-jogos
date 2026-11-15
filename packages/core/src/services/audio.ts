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

/** Estado do áudio: `none` até o primeiro gesto do usuário criar o contexto. */
export type AudioStatus = 'none' | AudioContextState | 'interrupted';

export interface AudioService {
  /**
   * Cria/retoma o AudioContext. Chame a cada gesto do usuário (barato): o navegador só
   * libera o som depois de um gesto, e no celular só `pointerup`/`touchend`/`click`/`keydown`
   * contam (não `pointerdown`).
   */
  unlock(): void;
  play(name: SoundName): void;
  /** `none` (sem gesto ainda), `running` (tocando), `suspended`/`interrupted` (bloqueado). */
  readonly status: AudioStatus;
  /** Registra/substitui um som por outra implementação (ex.: arquivo via Howler depois). */
  register(name: string, player: () => void): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  dispose(): void;
}

export interface AudioOptions {
  /** Fábrica do AudioContext (testes). Padrão: o AudioContext do navegador. */
  createContext?: () => AudioContext | undefined;
}

/** Se o contexto só voltar a tocar depois disto (ms), o som já ficou velho e é descartado. */
export const LATE_SOUND_MS = 400;

/** Ganho geral: os blips são curtos e o alto-falante do celular é fraco. */
const MASTER_GAIN = 1.6;

function defaultCreateContext(): AudioContext | undefined {
  const g = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : undefined;
}

export function createAudio(
  initial: { sfxVolume: number; musicVolume: number },
  options: AudioOptions = {},
): AudioService {
  const createContext = options.createContext ?? defaultCreateContext;
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let primed = false;
  let sfxVolume = initial.sfxVolume;
  // A música ainda não existe (sem assets); o volume fica guardado para quando houver.
  let musicVolume = initial.musicVolume;
  const custom = new Map<string, () => void>();

  const ensure = (): AudioContext | undefined => {
    if (ctx) return ctx;
    const created = createContext();
    if (!created) return undefined;
    ctx = created;
    master = created.createGain();
    master.gain.value = MASTER_GAIN;
    // O compressor evita estourar quando vários tons somam.
    const limiter = created.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(created.destination);
    return created;
  };

  const playTones = (c: AudioContext, tones: readonly Tone[]): void => {
    if (!master || sfxVolume <= 0) return;
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

  /** Toca uma amostra silenciosa: destrava a sessão de áudio no iOS, que exige isso num gesto. */
  const prime = (c: AudioContext): void => {
    if (primed) return;
    primed = true;
    try {
      const source = c.createBufferSource();
      source.buffer = c.createBuffer(1, 1, 22050);
      source.connect(c.destination);
      source.start(0);
    } catch {
      // Sem suporte: o resume() já basta nos outros navegadores.
    }
  };

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state !== 'running') void c.resume().catch(() => {});
      prime(c);
    },
    play(name) {
      const override = custom.get(name);
      if (override) return override();
      const c = ctx;
      // Sem gesto prévio o contexto não existe: nada toca (política de autoplay).
      if (!c) return;
      const tones = SOUNDS[name];
      if (c.state === 'running') return playTones(c, tones);
      // Suspenso (autoplay, app em segundo plano): tenta retomar e toca só se voltar logo.
      // Agendar numa linha do tempo parada faria o som sair tarde, em rajada.
      const asked = performance.now();
      c.resume()
        .then(() => {
          if (c.state === 'running' && performance.now() - asked < LATE_SOUND_MS) {
            playTones(c, tones);
          }
        })
        .catch(() => {});
    },
    get status(): AudioStatus {
      return ctx ? (ctx.state as AudioStatus) : 'none';
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
      primed = false;
      custom.clear();
    },
  };
}
