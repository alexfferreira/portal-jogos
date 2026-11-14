export type Listener<T> = (payload: T) => void;

/** Emissor de eventos tipado e minimalista. */
export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    // Cópia: um listener pode se remover durante a emissão.
    for (const fn of [...(this.listeners.get(type) ?? [])]) (fn as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Um botão da barra de power-ups, descrito pelo jogo e desenhado pelo portal. */
export interface PowerUpState {
  id: string;
  /** Chave i18n do rótulo. */
  labelKey: string;
  /** Nome de ícone do `@recreio/ui`. */
  icon: string;
  /** Usos restantes. */
  count: number;
  disabled?: boolean;
}

/** O que o jogo informa ao HUD comum do portal. */
export interface HudState {
  /** Fase atual (modo `levels`). */
  level?: number;
  powerUps: PowerUpState[];
}

/** Eventos que um jogo emite para o portal (seção 4.1). */
export interface GameEvents {
  'level-complete': { level: number; stars?: number };
  'game-over': { score?: number };
  score: { score: number };
  hud: HudState;
  /** O contexto WebGL foi perdido; o palco pausa e tenta voltar sozinho. */
  'graphics-lost': Record<string, never>;
  /** O contexto WebGL voltou e a cena foi refeita. */
  'graphics-restored': Record<string, never>;
}
