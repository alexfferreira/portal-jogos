// SOMENTE PARA TESTE LOCAL, NÃO PARA PRODUÇÃO (sem compressão, sem HTTPS, sem limites).
//
// Servidor estático mínimo para o build (`apps/portal/build`), com o mesmo comportamento que a
// hospedagem de produção precisa ter: fallback SPA (200.html) para rotas do app e cabeçalhos de
// cache (service worker e manifest sem cache agressivo; arquivos com hash por um ano).
//
// Por que não `vite preview`: ele não serve `200.html`, então o service worker não consegue
// pré-cachear o fallback e rotas como /jogo/xyz dão 404 offline. Este servidor é o caminho
// recomendado para testar o PWA (e o que os testes e2e usam).
//
// Uso: node scripts/serve-build.mjs [--port 4173] [--host] [--dir apps/portal/build]
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function cacheControl(pathname) {
  if (pathname.startsWith('/_app/immutable/')) return 'public, max-age=31536000, immutable';
  // service-worker.js, manifest, HTML, ícones: sempre revalidar.
  return 'no-cache';
}

/**
 * Cria o servidor (sem iniciar). `transform` é um gancho para testes: recebe o caminho e o
 * conteúdo de um arquivo e pode devolver outro conteúdo (ex.: simular uma segunda versão do
 * service worker).
 *
 * @param {{ dir?: string, transform?: (pathname: string, body: Buffer) => Buffer | null | undefined }} [options]
 */
export function createBuildServer(options = {}) {
  const dir = resolve(root, options.dir ?? 'apps/portal/build');

  /** Arquivo que atende o caminho, ou `null` para 404. Rotas sem extensão caem no fallback SPA. */
  async function locate(pathname) {
    const clean = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
    const candidate = resolve(dir, clean);
    if (candidate !== dir && !candidate.startsWith(dir + sep)) return null;
    if (clean && (await isFile(candidate))) return candidate;
    if (await isFile(candidate + '.html')) return candidate + '.html';
    if (await isFile(join(candidate, 'index.html'))) return join(candidate, 'index.html');
    if (extname(clean) === '') return join(dir, '200.html');
    return null;
  }

  return createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      const file = await locate(pathname);
      if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
        res.writeHead(file ? 405 : 404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(file ? 'method not allowed' : 'not found');
        return;
      }
      const headers = {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': cacheControl(pathname),
      };
      if (options.transform) {
        const changed = options.transform(pathname, await readFile(file));
        if (changed === null) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('not found');
          return;
        }
        if (changed) {
          res.writeHead(200, { ...headers, 'content-length': changed.length });
          res.end(req.method === 'HEAD' ? undefined : changed);
          return;
        }
      }
      res.writeHead(200, { ...headers, 'content-length': (await stat(file)).size });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      // pipeline fecha os dois lados se o cliente abortar ou o arquivo sumir no meio.
      await pipeline(createReadStream(file), res).catch(() => res.destroy());
    } catch {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('bad request');
    }
  });
}

// Execução direta: `node scripts/serve-build.mjs`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
  };
  const port = Number(opt('port', '4173'));
  const dir = opt('dir', 'apps/portal/build');
  // Sem `--host` só aceita conexões locais; com `--host` outros aparelhos da rede podem abrir.
  const host = args.includes('--host') ? undefined : '127.0.0.1';
  createBuildServer({ dir }).listen(port, host, () => {
    console.log(`Servindo ${resolve(root, dir)} em http://127.0.0.1:${port}`);
  });
}
