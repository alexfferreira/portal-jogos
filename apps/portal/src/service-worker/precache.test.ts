import { describe, expect, it } from 'vitest';
import {
  CACHE_PREFIX,
  cacheKeyFor,
  cacheName,
  precacheUrls,
  cachesToDelete,
  isImmutablePath,
  storableResponse,
  isVersionProbe,
  toScopedUrl,
} from './precache';

const scope = 'https://recreio.test/';

describe('precacheUrls', () => {
  it('junta build, static e fallback como URLs absolutas, sem duplicatas', () => {
    const urls = precacheUrls({
      immutable: ['_app/immutable/a.js', '/_app/immutable/workers/logic.worker-X.js'],
      assets: ['manifest.webmanifest', 'icon-192.png', 'robots.txt'],
      scope,
    });
    expect(urls).toEqual([
      'https://recreio.test/_app/immutable/a.js',
      'https://recreio.test/_app/immutable/workers/logic.worker-X.js',
      'https://recreio.test/manifest.webmanifest',
      'https://recreio.test/icon-192.png',
      'https://recreio.test/_app/version.json',
      'https://recreio.test/200.html',
    ]);
    expect(precacheUrls({ immutable: ['a.js', '/a.js'], assets: [], scope })).toEqual([
      'https://recreio.test/a.js',
      'https://recreio.test/_app/version.json',
      'https://recreio.test/200.html',
    ]);
  });

  it('respeita um escopo em subcaminho', () => {
    expect(toScopedUrl('/_app/x.js', 'https://h.test/jogos/')).toBe(
      'https://h.test/jogos/_app/x.js',
    );
    const urls = precacheUrls({ immutable: [], assets: [], scope: 'https://h.test/jogos/' });
    expect(urls).toEqual([
      'https://h.test/jogos/_app/version.json',
      'https://h.test/jogos/200.html',
    ]);
  });
});

describe('caches', () => {
  it('o nome do cache é versionado', () => {
    expect(cacheName('v2')).toBe(`${CACHE_PREFIX}v2`);
  });

  it('mantém o atual e o imediatamente anterior; apaga os mais velhos e só os do app', () => {
    const entries = [
      { name: cacheName('v1'), installedAt: 100 },
      { name: cacheName('v3'), installedAt: 300 },
      { name: cacheName('v2'), installedAt: 200 },
      { name: 'outra-coisa', installedAt: 1 },
      { name: cacheName('v0'), installedAt: 0 },
    ];
    expect(cachesToDelete(entries, cacheName('v3')).sort()).toEqual(
      [cacheName('v0'), cacheName('v1')].sort(),
    );
  });

  it('com só o atual e um anterior não apaga nada', () => {
    const entries = [
      { name: cacheName('v2'), installedAt: 2 },
      { name: cacheName('v1'), installedAt: 1 },
    ];
    expect(cachesToDelete(entries, cacheName('v2'))).toEqual([]);
  });
});

describe('isImmutablePath', () => {
  it('só arquivos com hash do build', () => {
    expect(isImmutablePath(new URL('/_app/immutable/nodes/3.abc.js', scope))).toBe(true);
    expect(isImmutablePath(new URL('/icon-192.png', scope))).toBe(false);
  });
});

describe('storableResponse', () => {
  it('resposta normal passa direto', async () => {
    const r = new Response('ok');
    expect(await storableResponse(r)).toBe(r);
  });

  it('resposta redirecionada vira uma cópia limpa (redirected=false) com o mesmo conteúdo', async () => {
    const r = new Response('<html>spa</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperty(r, 'redirected', { value: true });
    const clean = await storableResponse(r);
    expect(clean.redirected).toBe(false);
    expect(clean.status).toBe(200);
    expect(clean.headers.get('content-type')).toBe('text/html');
    expect(await clean.text()).toBe('<html>spa</html>');
  });
});

describe('cacheKeyFor', () => {
  const precached = new Set(
    precacheUrls({ immutable: ['_app/a.js'], assets: ['icon.png'], scope }),
  );
  const key = (path: string, nav: boolean) =>
    cacheKeyFor(new URL(path, scope), nav, precached, scope);

  it('arquivo do pré-cache responde com ele mesmo, ignorando a query', () => {
    expect(key('/_app/a.js?x=1', false)).toBe('https://recreio.test/_app/a.js');
    expect(key('/icon.png', true)).toBe('https://recreio.test/icon.png');
  });

  it('qualquer navegação (rota conhecida ou não) cai na página de fallback', () => {
    for (const p of ['/', '/jogo/mistura', '/configuracoes', '/rota/que/nao/existe']) {
      expect(key(p, true)).toBe('https://recreio.test/200.html');
    }
  });

  it('o que não é pré-cache nem navegação vai para a rede', () => {
    expect(key('/api/algo', false)).toBeUndefined();
  });
});

describe('isVersionProbe', () => {
  it('reconhece só a consulta de versão do SvelteKit', () => {
    expect(isVersionProbe(new URL('/_app/version.json', scope), scope)).toBe(true);
    expect(isVersionProbe(new URL('/_app/version.json?x=1', scope), scope)).toBe(true);
    expect(isVersionProbe(new URL('/manifest.webmanifest', scope), scope)).toBe(false);
  });
});
