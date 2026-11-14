/**
 * Funções puras do service worker (sem `$app/*` nem globais do worker), para testar no Vitest.
 */

/** Prefixo dos caches do app. Só apagamos caches que começam com ele. */
export const CACHE_PREFIX = 'recreio-precache-';

/** Página que o adapter-static gera como fallback SPA: serve qualquer rota do app. */
export const FALLBACK_PAGE = '200.html';

/**
 * Arquivo que o SvelteKit consulta para saber se há deploy novo. Fica no pré-cache só como
 * reserva: com rede, vai sempre à rede; sem rede, responde a cópia (evita uma requisição falha).
 */
export const VERSION_FILE = '_app/version.json';

/** Arquivos do `static/` que não entram no pré-cache (não são usados pelo app). */
const EXCLUDED_ASSETS = new Set(['robots.txt']);

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Entrada gravada em cada cache na instalação, para saber qual é a versão anterior. */
export const META_FILE = '__recreio-meta.json';

export interface CacheEntry {
  name: string;
  /** Instante da instalação (0 se desconhecido). */
  installedAt: number;
}

/**
 * Caches a apagar na ativação: todos os do app, menos o atual e o IMEDIATAMENTE anterior.
 * Uma aba aberta que ainda roda o código da versão anterior (porque outra aba atualizou) segue
 * achando seus chunks com hash antigo no cache anterior; ele só some na ativação seguinte.
 */
export function cachesToDelete(entries: readonly CacheEntry[], current: string): string[] {
  const stale = entries
    .filter((e) => e.name.startsWith(CACHE_PREFIX) && e.name !== current)
    .sort((a, b) => b.installedAt - a.installedAt);
  return stale.slice(1).map((e) => e.name);
}

/** Arquivo gerado com hash: se não está no pré-cache atual, pode estar no da versão anterior. */
export function isImmutablePath(url: URL): boolean {
  return url.pathname.includes('/_app/immutable/');
}

/**
 * Resposta que pode ir para o cache. Uma resposta que passou por redirecionamento
 * (`redirected`, ex.: `cleanUrls` da hospedagem) NÃO pode ser usada depois para responder uma
 * navegação (o navegador rejeita); guardamos uma cópia limpa, sem a marca de redirecionamento.
 */
export async function storableResponse(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.clone().blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export interface PrecacheInput {
  /** Arquivos gerados pelo Vite (`immutable` de `$app/manifest`): chunks, CSS, fontes, worker. */
  immutable: readonly string[];
  /** Arquivos de `static/` (`assets` de `$app/manifest`): manifest, ícones. */
  assets: readonly string[];
  /** URL do escopo do service worker (ex.: `https://site/` ou `https://site/sub/`). */
  scope: string;
}

/** Normaliza um caminho do `$app/manifest` ou nome de arquivo para uma URL absoluta no escopo. */
export function toScopedUrl(path: string, scope: string): string {
  return new URL(path.replace(/^\/+/, ''), scope).href;
}

/**
 * Lista final de URLs do pré-cache: tudo que o Vite gerou, tudo de `static/` e a página de
 * fallback (mais o `version.json`, só como reserva offline). Sem duplicatas, em ordem estável.
 */
export function precacheUrls({ immutable, assets, scope }: PrecacheInput): string[] {
  const all = [
    ...immutable,
    ...assets.filter((p) => !EXCLUDED_ASSETS.has(p.replace(/^\/+/, ''))),
    VERSION_FILE,
    FALLBACK_PAGE,
  ];
  return [...new Set(all.map((p) => toScopedUrl(p, scope)))];
}

/**
 * Qual URL do cache responde a uma requisição.
 * - Arquivo do pré-cache: ele mesmo (ignora query).
 * - Navegação a qualquer outra rota: a página de fallback (o app é uma SPA; o roteador cuida do resto).
 * - Outra coisa: `undefined` (vai para a rede).
 */
export function cacheKeyFor(
  url: URL,
  isNavigation: boolean,
  precached: ReadonlySet<string>,
  scope: string,
): string | undefined {
  const plain = new URL(url.pathname, url.origin).href;
  if (precached.has(plain)) return plain;
  if (isNavigation) return toScopedUrl(FALLBACK_PAGE, scope);
  return undefined;
}

/** A consulta de versão do SvelteKit: rede primeiro, cópia do cache só se a rede falhar. */
export function isVersionProbe(url: URL, scope: string): boolean {
  return new URL(url.pathname, url.origin).href === toScopedUrl(VERSION_FILE, scope);
}
