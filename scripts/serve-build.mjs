// SOMENTE PARA TESTE LOCAL, NÃO PARA PRODUÇÃO (sem compressão, sem HTTPS, sem limites).
//
// Servidor estático mínimo para o build (`apps/portal/build`). Ele aplica o `vercel.json` da raiz:
// cabeçalhos de cache/segurança e fallback SPA (`rewrites` para `/200.html`). Assim o que os testes
// e2e e o `pnpm serve` mostram é o que a Vercel deve entregar. Como na Vercel: arquivo que existe
// vence; rota sem extensão (fora de `/_app/`) cai no `200.html`; o resto é 404 (um chunk
// inexistente nunca vira HTML).
//
// Por que não `vite preview`: ele não serve `200.html`, então o service worker não consegue
// pré-cachear o fallback e rotas como /jogo/xyz dão 404 offline.
//
// Uso: node scripts/serve-build.mjs [--port 4173] [--host] [--dir apps/portal/build]
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { headersFor, loadPolicy, rewriteFor } from './vercel-policy.mjs';

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

/**
 * Cria o servidor (sem iniciar). `transform` é um gancho para testes: recebe o caminho e o
 * conteúdo de um arquivo e pode devolver outro conteúdo (ex.: simular uma segunda versão do
 * service worker) ou `null` para responder 404.
 *
 * @param {{ dir?: string, policy?: ReturnType<typeof loadPolicy>, transform?: (pathname: string, body: Buffer) => Buffer | null | undefined }} [options]
 */
export function createBuildServer(options = {}) {
  const dir = resolve(root, options.dir ?? 'apps/portal/build');
  const policy = options.policy ?? loadPolicy();

  /** Arquivo que atende o caminho, ou `null` para 404. */
  async function locate(pathname) {
    const clean = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
    const candidate = resolve(dir, clean);
    if (candidate !== dir && !candidate.startsWith(dir + sep)) return null;
    if (clean === '')
      return (await isFile(join(dir, 'index.html'))) ? join(dir, 'index.html') : null;
    if (await isFile(candidate)) return candidate;
    // Só rotas do app (regras `rewrites` do vercel.json): sem extensão e fora de /_app/.
    const destination = rewriteFor(policy, pathname);
    return destination ? join(dir, destination) : null;
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
        ...headersFor(policy, pathname),
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
