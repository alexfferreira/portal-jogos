/**
 * Pilha de desfazer para puzzles. Guarda estados IMUTÁVEIS anteriores:
 * chame `push(estadoAntes)` antes de aplicar uma jogada e `undo()` para recuperá-lo.
 * Com `limit`, os estados mais antigos são descartados.
 */
export class UndoStack<S> {
  private items: S[] = [];

  constructor(private readonly limit: number = Infinity) {
    if (!(limit >= 1)) throw new RangeError('UndoStack: limit deve ser >= 1');
  }

  get size(): number {
    return this.items.length;
  }

  canUndo(): boolean {
    return this.items.length > 0;
  }

  push(state: S): void {
    this.items.push(state);
    if (this.items.length > this.limit) this.items.shift();
  }

  /** Remove e devolve o estado mais recente guardado (ou `undefined` se vazia). */
  undo(): S | undefined {
    return this.items.pop();
  }

  /** Espia o estado mais recente sem removê-lo. */
  peek(): S | undefined {
    return this.items[this.items.length - 1];
  }

  clear(): void {
    this.items = [];
  }
}
