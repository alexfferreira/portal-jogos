export type Easing = (t: number) => number;

export const easing = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} satisfies Record<string, Easing>;

export interface TweenOptions {
  /** Duração em segundos. */
  duration: number;
  /** Atraso inicial em segundos. */
  delay?: number;
  ease?: Easing;
  /** Chamado a cada quadro com o progresso já suavizado (0..1). */
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export interface TweenHandle {
  /** Interrompe. Por padrão salta para o valor final (mantém o estado consistente). */
  cancel(jumpToEnd?: boolean): void;
  readonly finished: Promise<void>;
}

interface Active {
  opts: TweenOptions;
  elapsed: number;
  done: boolean;
  resolve: () => void;
}

/** Gerenciador de tweens. Avance com `update(dt)` a partir do loop do palco. */
export class Tweens {
  private active = new Set<Active>();

  add(opts: TweenOptions): TweenHandle {
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const tween: Active = { opts, elapsed: -(opts.delay ?? 0), done: false, resolve };
    this.active.add(tween);
    return {
      finished,
      cancel: (jumpToEnd = true) => this.finish(tween, jumpToEnd),
    };
  }

  update(dt: number): void {
    for (const tween of [...this.active]) {
      if (tween.done) continue;
      tween.elapsed += dt;
      if (tween.elapsed < 0) continue;
      const t = tween.opts.duration <= 0 ? 1 : Math.min(1, tween.elapsed / tween.opts.duration);
      tween.opts.onUpdate((tween.opts.ease ?? easing.linear)(t));
      if (t >= 1) this.finish(tween, false);
    }
  }

  get size(): number {
    return this.active.size;
  }

  /** Cancela tudo (usado no destroy do jogo). */
  clear(jumpToEnd = false): void {
    for (const tween of [...this.active]) this.finish(tween, jumpToEnd);
  }

  /** Descarta tudo sem chamar onComplete (só libera quem aguarda `finished`). Usado no dispose. */
  dispose(): void {
    for (const tween of [...this.active]) {
      tween.done = true;
      this.active.delete(tween);
      tween.resolve();
    }
  }

  private finish(tween: Active, jumpToEnd: boolean): void {
    if (tween.done) return;
    tween.done = true;
    this.active.delete(tween);
    if (jumpToEnd) tween.opts.onUpdate((tween.opts.ease ?? easing.linear)(1));
    tween.opts.onComplete?.();
    tween.resolve();
  }
}
