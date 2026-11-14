export interface Haptics {
  /** Vibração curta (ms). Não faz nada se estiver desligada ou sem suporte. */
  tap(ms?: number): void;
  setEnabled(enabled: boolean): void;
}

export function createHaptics(enabled: boolean): Haptics {
  let on = enabled;
  return {
    tap(ms = 12) {
      if (!on || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
      }
      navigator.vibrate(ms);
    },
    setEnabled(next) {
      on = next;
    },
  };
}
