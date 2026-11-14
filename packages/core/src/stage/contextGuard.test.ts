import { describe, expect, it, vi } from 'vitest';
import { watchContext } from './contextGuard';

describe('watchContext', () => {
  it('cancela o evento de perda (para o navegador poder restaurar) e avisa', () => {
    const target = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    watchContext(target, { onLost, onRestored });

    const lost = new Event('webglcontextlost', { cancelable: true });
    target.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();
    expect(onRestored).not.toHaveBeenCalled();

    target.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it('a função devolvida remove os listeners', () => {
    const target = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const stop = watchContext(target, { onLost, onRestored });
    stop();
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    target.dispatchEvent(new Event('webglcontextrestored'));
    expect(onLost).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });
});
