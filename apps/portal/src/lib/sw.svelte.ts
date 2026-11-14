import { dev } from '$app/env';
import { resolve } from '$app/paths';
import { createUpdateController, type ContainerLike, type UpdateStatus } from './updates';

/** Estado reativo do aviso de nova versão (lido por `UpdateBanner.svelte`). */
export const update = $state<{ status: UpdateStatus }>({ status: 'none' });

let controller: ReturnType<typeof createUpdateController> | undefined;

/**
 * Registra o service worker. Fica desligado no `vite dev` (evita confusão de cache); para testar
 * o worker em desenvolvimento, suba com `VITE_SW_DEV=1`. No build, sempre liga.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (dev && import.meta.env.VITE_SW_DEV !== '1') return;
  const container = navigator.serviceWorker as unknown as ContainerLike;
  controller = createUpdateController({
    container,
    reload: () => location.reload(),
    onChange: (status) => (update.status = status),
    inGame: () => location.pathname.startsWith('/jogo/'),
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
  // O SvelteKit publica o worker em `service-worker.js`, na raiz do app (respeita `paths.base`).
  const url = `${resolve('/')}service-worker.js`;
  // Espera o carregamento da página: o pré-cache de tudo não disputa banda com o primeiro uso.
  const start = () => void controller?.start(url).catch((e) => console.warn('service worker', e));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') controller?.check();
  });
}

export const applyUpdate = () => controller?.apply();
export const reloadNow = () => controller?.reloadNow();
export const dismissUpdate = () => controller?.dismiss();
