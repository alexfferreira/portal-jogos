// Lê `vercel.json` (a ÚNICA fonte da política de cache, cabeçalhos e fallback SPA) e a aplica a um
// caminho. É usado pelo `scripts/serve-build.mjs` e pelos testes, para o servidor local se
// comportar como a Vercel e o `deploy/nginx.conf` ter uma referência executável.
//
// SUBCONJUNTO de `source` suportado (o `vercel.json` do projeto só usa isto; um teste em
// scripts/deploy.test.ts falha se algo sair dele):
//   - texto literal (comparado literalmente, `.` é ponto);
//   - grupos entre parênteses com regex JavaScript, ex.: `/_app/immutable/(.*)` ou
//     `/((?!_app/)[^.]*)`. Sem grupo não-capturante `(?:`.
//   - PROIBIDO fora de parênteses: `:nome` e `*`. No path-to-regexp da Vercel eles têm outra
//     semântica (parâmetros nomeados, repetição) que esta RegExp não reproduz.
// Para cada caminho, no máximo UMA regra deve definir o mesmo cabeçalho (a Vercel não documenta o
// que acontece com a mesma chave vinda de duas regras); aqui a última regra venceria.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Converte um `source` da Vercel em RegExp (literal fora dos parênteses, regex dentro deles). */
export function compileSource(source) {
  let out = '';
  let depth = 0;
  for (const ch of source) {
    if (ch === '(') depth++;
    if (depth > 0) out += ch;
    else out += ch.replace(/[.*+?^${}|[\]\\]/g, '\\$&');
    if (ch === ')') depth--;
  }
  return new RegExp(`^${out}$`);
}

/** @param {string} [path] caminho do vercel.json (padrão: o da raiz do repositório) */
export function loadPolicy(path = join(root, 'vercel.json')) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  return {
    config,
    headers: (config.headers ?? []).map((rule) => ({
      match: compileSource(rule.source),
      headers: rule.headers,
    })),
    rewrites: (config.rewrites ?? []).map((rule) => ({
      match: compileSource(rule.source),
      destination: rule.destination,
    })),
  };
}

/** Cabeçalhos que se aplicam ao caminho: todas as regras que casam, a última vence por chave. */
export function headersFor(policy, pathname) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const rule of policy.headers) {
    if (!rule.match.test(pathname)) continue;
    for (const { key, value } of rule.headers) result[key.toLowerCase()] = value;
  }
  return result;
}

/** Destino da reescrita (fallback SPA) para o caminho, ou `undefined`. */
export function rewriteFor(policy, pathname) {
  return policy.rewrites.find((r) => r.match.test(pathname))?.destination;
}
