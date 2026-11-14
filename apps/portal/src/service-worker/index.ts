import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';
import {
  cacheKeyFor,
  cacheName,
  cachesToDelete,
  CACHE_PREFIX,
  isImmutablePath,
  isVersionProbe,
  META_FILE,
  precacheUrls,
  storableResponse,
  toScopedUrl,
} from './precache';

const scope = self.registration.scope;
const CACHE = cacheName(version);
const META_URL = toScopedUrl(META_FILE, scope);
const urls = precacheUrls({
  immutable: immutable.map((f) => f.path),
  assets: assets.map((f) => f.path),
  scope,
});
const precached = new Set(urls);

self.addEventListener('install', (event) => {
  // Sem skipWaiting aqui: uma versão nova espera o jogador aceitar (mensagem abaixo), para
  // nunca trocar o código no meio de uma partida. Na primeira instalação não há versão anterior,
  // então ela ativa direto.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        urls.map(async (url) => {
          // `reload` ignora o cache HTTP: o pré-cache nunca guarda um arquivo velho.
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error(`pré-cache: ${response.status} ${url}`);
          await cache.put(url, await storableResponse(response));
        }),
      );
      // Marca quando este cache foi instalado (a ativação mantém o cache da versão anterior).
      await cache.put(META_URL, Response.json({ installedAt: Date.now() }));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const entries = await Promise.all(
        (await caches.keys())
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .map(async (name) => {
            const meta = await (await caches.open(name)).match(META_URL);
            const installedAt = (
              (await meta?.json().catch(() => undefined)) as { installedAt?: number } | undefined
            )?.installedAt;
            return { name, installedAt: installedAt ?? 0 };
          }),
      );
      for (const name of cachesToDelete(entries, CACHE)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = cacheKeyFor(url, request.mode === 'navigate', precached, scope);
  if (!key) {
    if (isImmutablePath(url)) {
      // Aba que ainda roda o código da versão anterior (outra aba atualizou): o chunk com hash
      // antigo não existe mais no servidor, mas segue no cache da versão anterior.
      event.respondWith(
        caches.match(request.url, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)),
      );
    }
    return;
  }
  if (isVersionProbe(url, scope)) {
    // Rede primeiro (é assim que o SvelteKit descobre um deploy novo); offline, a cópia guardada.
    event.respondWith(
      fetch(request).catch(
        async () => (await (await caches.open(CACHE)).match(key)) ?? Response.error(),
      ),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await (await caches.open(CACHE)).match(key);
      // Fora do cache (não deveria acontecer depois da instalação): tenta a rede.
      return hit ?? fetch(request);
    })(),
  );
});
