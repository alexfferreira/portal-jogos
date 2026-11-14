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

/** Eventos que um jogo emite para o portal (seção 4.1). */
export interface GameEvents {
  'level-complete': { level: number; stars?: number };
  'game-over': { score?: number };
  score: { score: number };
}
