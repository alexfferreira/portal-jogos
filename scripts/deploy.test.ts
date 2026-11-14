import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { createBuildServer } from './serve-build.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { compileSource, headersFor, loadPolicy, rewriteFor } from './vercel-policy.mjs';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const config = JSON.parse(read('../vercel.json')) as Record<string, unknown>;
const policy = loadPolicy();

const IMMUTABLE = 'public, max-age=31536000, immutable';

describe('vercel.json', () => {
  it('comandos, saída e opções que evitam redirecionamentos (cleanUrls/trailingSlash)', () => {
    expect(config.framework).toBeNull();
    expect(config.installCommand).toBe('pnpm install --frozen-lockfile');
    expect(config.buildCommand).toBe('pnpm build');
    expect(config.outputDirectory).toBe('apps/portal/build');
    expect(config.cleanUrls).toBe(false);
    expect(config.trailingSlash).toBe(false);
  });

  it('sem segredos, variáveis de ambiente ou CSP não testada', () => {
    const text = read('../vercel.json');
    expect(config.env).toBeUndefined();
    expect(config.build).toBeUndefined();
    expect(text).not.toMatch(/Content-Security-Policy/i);
  });

  it('fallback SPA: rotas do app vão para /200.html; arquivos e /_app/ não', () => {
    for (const p of ['/', '/jogo/mistura', '/configuracoes', '/rota/que/nao/existe']) {
      expect(rewriteFor(policy, p), p).toBe('/200.html');
    }
    for (const p of [
      '/_app/immutable/chunks/abc.js',
      '/_app/qualquer',
      '/icon-192.png',
      '/service-worker.js',
      '/200.html',
      '/arquivo.inexistente.js',
    ]) {
      expect(rewriteFor(policy, p), p).toBeUndefined();
    }
  });

  it('cabeçalhos de cache: revalidar o que muda, um ano para o que tem hash', () => {
    const cc = (p: string) => headersFor(policy, p)['cache-control'];
    expect(cc('/service-worker.js')).toBe('no-cache');
    expect(cc('/manifest.webmanifest')).toBe('no-cache');
    expect(cc('/200.html')).toBe('no-cache');
    expect(cc('/index.html')).toBe('no-cache');
    expect(cc('/jogo/mistura')).toBe('no-cache');
    expect(cc('/')).toBe('no-cache');
    expect(cc('/_app/version.json')).toBe('no-cache');
    expect(cc('/_app/immutable/entry/app.abc.js')).toBe(IMMUTABLE);
    expect(cc('/_app/immutable/workers/logic.worker-X.js')).toBe(IMMUTABLE);
    expect(cc('/icon-192.png')).toBe('public, max-age=86400');
    expect(cc('/apple-touch-icon.png')).toBe('public, max-age=86400');
    expect(cc('/favicon.svg')).toBe('public, max-age=86400');
    expect(headersFor(policy, '/service-worker.js')['service-worker-allowed']).toBe('/');
    expect(headersFor(policy, '/manifest.webmanifest')['content-type']).toMatch(
      /application\/manifest\+json/,
    );
  });

  it('cabeçalhos de segurança em tudo, sem imobilizar Worker/WebGL (sem CSP)', () => {
    for (const p of ['/', '/service-worker.js', '/_app/immutable/x.js', '/icon-192.png']) {
      const h = headersFor(policy, p);
      expect(h['x-content-type-options'], p).toBe('nosniff');
      expect(h['referrer-policy'], p).toBeTruthy();
      expect(h['permissions-policy'], p).toBeTruthy();
      expect(h['x-frame-options'], p).toBe('DENY');
    }
  });

  it('para cada caminho representativo, no máximo UMA regra define Cache-Control', () => {
    // A Vercel não documenta o que acontece com a mesma chave vinda de duas regras.
    const paths = [
      '/',
      '/service-worker.js',
      '/manifest.webmanifest',
      '/200.html',
      '/index.html',
      '/_app/version.json',
      '/_app/immutable/x.js',
      '/_app/immutable/workers/logic.worker-X.js',
      '/icon-192.png',
      '/icon-512.png',
      '/apple-touch-icon.png',
      '/favicon.ico',
      '/favicon.svg',
      '/jogo/mistura',
      '/configuracoes',
      '/rota/que/nao/existe',
    ];
    const rules = (config.headers as Array<{ source: string; headers: { key: string }[] }>)
      .filter((r) => r.headers.some((h) => h.key.toLowerCase() === 'cache-control'))
      .map((r) => ({ source: r.source, match: compileSource(r.source) as RegExp }));
    for (const p of paths) {
      const hits = rules.filter((r) => r.match.test(p)).map((r) => r.source);
      expect(hits.length, `${p}: ${hits.join(' | ')}`).toBeLessThanOrEqual(1);
    }
    // E os caminhos do app têm mesmo uma regra de Cache-Control (nada fica sem política).
    for (const p of paths) expect(headersFor(policy, p)['cache-control'], p).toBeTruthy();
  });

  it('todo source usa só o subconjunto suportado: sem ":" nem "*" fora de parênteses', () => {
    // O path-to-regexp da Vercel dá outro sentido a `:nome` e `*` fora de grupos; aqui só vale
    // texto literal e grupos entre parênteses (veja o topo de scripts/vercel-policy.mjs).
    const outside = (source: string) => {
      let depth = 0;
      let text = '';
      for (const ch of source) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0) text += ch;
      }
      return text;
    };
    const sources = [
      ...(config.headers as Array<{ source: string }>),
      ...(config.rewrites as Array<{ source: string }>),
    ].map((r) => r.source);
    expect(sources.length).toBeGreaterThan(5);
    for (const s of sources) {
      expect(outside(s), s).not.toMatch(/[:*]/);
      expect(s, s).not.toContain('(?:');
    }
  });

  it('compileSource trata literais e grupos', () => {
    expect(compileSource('/service-worker.js').test('/service-worker.js')).toBe(true);
    expect(compileSource('/service-worker.js').test('/service-workerXjs')).toBe(false);
    expect(compileSource('/_app/immutable/(.*)').test('/_app/immutable/a/b.js')).toBe(true);
  });
});

interface NginxLocation {
  /** Cabeçalho do bloco, ex.: `= /service-worker.js` ou `~ \.[^/]+$`. */
  head: string;
  body: string;
}

/** Tira comentários (# até o fim da linha; o arquivo não usa # dentro de strings). */
const stripComments = (text: string) => text.replace(/#.*$/gm, '');

/** Extrai os blocos `location ... { ... }` por contagem de chaves (sem depender de indentação). */
function parseLocations(text: string): NginxLocation[] {
  const src = stripComments(text);
  const result: NginxLocation[] = [];
  const re = /\blocation\s+([^{;]+?)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    result.push({ head: m[1]!.trim(), body: src.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return result;
}

describe('nginx (deploy/nginx.conf)', () => {
  const nginx = read('../deploy/nginx.conf');
  const headers = read('../deploy/recreio-headers.conf');
  // Só os blocos do server HTTPS (o server da porta 80 tem o seu próprio `location /`).
  const locations = parseLocations(nginx.slice(nginx.indexOf('listen 443')));
  const httpLocations = parseLocations(nginx.slice(0, nginx.indexOf('listen 443')));
  const find = (head: string) => {
    const loc = locations.find((l) => l.head === head);
    expect(loc, `location ${head}`).toBeDefined();
    return loc!.body;
  };

  it('o parser acha os blocos esperados', () => {
    expect(locations.length).toBeGreaterThanOrEqual(10);
  });

  it('"/" entrega index.html; rotas sem extensão caem no 200.html; arquivo inexistente é 404', () => {
    expect(find('= /')).toMatch(/try_files \/index\.html =404;/);
    expect(find('/')).toMatch(/try_files \$uri \/200\.html;/);
    expect(find('~ \\.[^/]+$')).toMatch(/try_files \$uri =404;/);
    expect(find('^~ /_app/')).toMatch(/try_files \$uri =404;/);
    expect(find('^~ /_app/immutable/')).toMatch(/try_files \$uri =404;/);
    // O fallback para o 200.html só existe em `location /` (nada com extensão cai nele).
    const withFallback = locations.filter((l) => /200\.html/.test(l.body));
    expect(withFallback.map((l) => l.head)).toEqual(['/']);
  });

  it('service worker, manifest e version.json sem cache; hash com immutable', () => {
    expect(find('= /service-worker.js')).toMatch(/Cache-Control "no-cache" always;/);
    expect(find('= /service-worker.js')).toContain('Service-Worker-Allowed');
    expect(find('= /manifest.webmanifest')).toMatch(/Cache-Control "no-cache" always;/);
    expect(find('= /manifest.webmanifest')).toContain('application/manifest+json');
    expect(find('= /_app/version.json')).toMatch(/Cache-Control "no-cache" always;/);
    expect(find('^~ /_app/immutable/')).toContain(`"${IMMUTABLE}"`);
    expect(find('= /')).toMatch(/Cache-Control "no-cache" always;/);
    expect(find('/')).toMatch(/Cache-Control "no-cache" always;/);
  });

  it('HTTPS, HTTP/2, redirecionamento 80 -> 443, certbot e gzip', () => {
    expect(nginx).toMatch(/listen 80;/);
    expect(nginx).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
    expect(httpLocations.find((l) => l.head === '^~ /.well-known/acme-challenge/')?.body).toMatch(
      /root \/var\/www\/certbot;/,
    );
    expect(nginx).toMatch(/listen 443 ssl;/);
    expect(nginx).toMatch(/http2 on;/);
    expect(nginx).toMatch(/ssl_certificate\s+\/etc\/letsencrypt\/live\//);
    expect(nginx).toMatch(/gzip on;/);
    expect(nginx).toMatch(/brotli/);
  });

  it('server_tokens off nos dois servers e arquivos ocultos bloqueados sem atrapalhar o certbot', () => {
    const src = stripComments(nginx);
    expect(src.match(/server_tokens off;/g)).toHaveLength(2);
    expect(find('~ /\\.(?!well-known)')).toMatch(/return 404;/);
    // O desafio do certbot (porta 80) usa ^~, que tem prioridade sobre qualquer regex.
    expect(httpLocations.some((l) => l.head === '^~ /.well-known/acme-challenge/')).toBe(true);
  });

  it('todo location que define add_header inclui os cabeçalhos de segurança', () => {
    const withHeaders = locations.filter((l) => /add_header/.test(l.body));
    expect(withHeaders.length).toBeGreaterThan(5);
    for (const l of withHeaders) expect(l.body, l.head).toContain('recreio-headers.conf');
    expect(headers).toContain('X-Content-Type-Options');
    expect(headers).toContain('Permissions-Policy');
  });

  it('os mesmos valores de cache do vercel.json', () => {
    expect(nginx).toContain(IMMUTABLE);
    expect(nginx).toContain('public, max-age=86400');
  });
});

describe('nginx etapa A (deploy/nginx-http.conf)', () => {
  const http = read('../deploy/nginx-http.conf');
  const locations = parseLocations(http);

  it('só HTTP: sem certificado, com o desafio do certbot e o site respondendo', () => {
    expect(http).not.toMatch(/ssl_certificate|listen 443/);
    expect(locations.find((l) => l.head === '^~ /.well-known/acme-challenge/')?.body).toMatch(
      /root \/var\/www\/certbot;/,
    );
    expect(locations.find((l) => l.head === '= /')?.body).toMatch(/try_files \/index\.html/);
    expect(stripComments(http)).toMatch(/server_tokens off;/);
  });
});

describe('serve-build aplica o vercel.json', () => {
  let dir: string;
  let server: ReturnType<typeof createBuildServer>;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'recreio-serve-'));
    mkdirSync(join(dir, '_app', 'immutable'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<html>index</html>');
    writeFileSync(join(dir, '200.html'), '<html>fallback</html>');
    writeFileSync(join(dir, 'service-worker.js'), '// sw');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
    writeFileSync(join(dir, '_app', 'immutable', 'a.js'), 'export {}');
    server = createBuildServer({ dir });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it('rota do app responde o 200.html (200) sem redirecionar e com no-cache', async () => {
    const res = await fetch(`${base}/jogo/mistura`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('fallback');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('/200.html existe e não redireciona (cleanUrls desligado)', async () => {
    const res = await fetch(`${base}/200.html`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it('arquivo com hash: cache de um ano; inexistente: 404 (nunca HTML)', async () => {
    const ok = await fetch(`${base}/_app/immutable/a.js`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe(IMMUTABLE);
    for (const p of ['/_app/immutable/b.js', '/_app/algo', '/imagem.png', '/x.js']) {
      const res = await fetch(`${base}${p}`);
      expect(res.status, p).toBe(404);
      expect(await res.text()).not.toContain('fallback');
    }
  });

  it('service worker e manifest: no-cache e tipo certo', async () => {
    const sw = await fetch(`${base}/service-worker.js`);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    expect(sw.headers.get('service-worker-allowed')).toBe('/');
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.headers.get('content-type')).toMatch(/application\/manifest\+json/);
  });
});
