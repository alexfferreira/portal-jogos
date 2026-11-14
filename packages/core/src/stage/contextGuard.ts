export interface ContextHandlers {
  onLost(): void;
  onRestored(): void;
}

/**
 * Observa a perda e a volta do contexto WebGL de um canvas. No `lost` chama
 * `preventDefault()`: sem isso o navegador nunca tenta restaurar o contexto.
 * Retorna a função que remove os listeners.
 */
export function watchContext(target: EventTarget, handlers: ContextHandlers): () => void {
  const lost = (e: Event): void => {
    e.preventDefault();
    handlers.onLost();
  };
  const restored = (): void => handlers.onRestored();
  target.addEventListener('webglcontextlost', lost);
  target.addEventListener('webglcontextrestored', restored);
  return () => {
    target.removeEventListener('webglcontextlost', lost);
    target.removeEventListener('webglcontextrestored', restored);
  };
}
