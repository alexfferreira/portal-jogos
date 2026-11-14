// Relatório de tamanho do build (bruto e gzip), separando o que a tela inicial carrega do que só
// carrega ao abrir o jogo. Uso: pnpm report:size   (depois de `pnpm build`)
//   --json   imprime o relatório como JSON
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDir = join(root, 'apps', 'portal', 'build');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Arquivos `_app/immutable/...` referenciados por <link> (preload e CSS) e por import() do HTML. */
function referencedBy(html) {
  const found = new Set();
  for (const m of html.matchAll(
    /(?:href|import\()\s*=?\s*["']((?:\.\.?\/)*_app\/immutable\/[^"']+)["']/g,
  )) {
    found.add(m[1].replace(/^(\.\.?\/)*/, ''));
  }
  return found;
}

function sizeOf(buildDir, files) {
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const data = readFileSync(join(buildDir, f));
    raw += data.length;
    gzip += gzipSync(data, { level: 9 }).length;
  }
  return { files: files.length, raw, gzip };
}

const ext = (f) => f.slice(f.lastIndexOf('.') + 1);

/**
 * @param {string} [buildDir]
 * @returns grupos com contagem de arquivos e tamanhos bruto/gzip, separados por tipo.
 */
export function computeReport(buildDir = defaultDir) {
  const dir = resolve(buildDir);
  const all = walk(dir).map((f) => relative(dir, f).split(sep).join('/'));
  const immutable = all.filter((f) => f.startsWith('_app/immutable/'));
  const initial = new Set(
    [...referencedBy(readFileSync(join(dir, 'index.html'), 'utf8'))].filter((f) =>
      existsSync(join(dir, f)),
    ),
  );
  const gameRoute = new Set(
    [...referencedBy(readFileSync(join(dir, 'jogo', 'mistura.html'), 'utf8'))].filter(
      (f) => existsSync(join(dir, f)) && !initial.has(f),
    ),
  );
  const workers = new Set(immutable.filter((f) => f.startsWith('_app/immutable/workers/')));
  const fonts = immutable.filter((f) => f.endsWith('.woff2'));
  const isCode = (f) => ext(f) === 'js' || ext(f) === 'css';
  const onDemand = immutable.filter(
    (f) => isCode(f) && !initial.has(f) && !gameRoute.has(f) && !workers.has(f),
  );

  const group = (files) => ({
    js: sizeOf(
      dir,
      files.filter((f) => ext(f) === 'js'),
    ),
    css: sizeOf(
      dir,
      files.filter((f) => ext(f) === 'css'),
    ),
    list: files,
  });
  return {
    /** O que a tela inicial (`/`) carrega: HTML + entradas + nós 0 e 2 + CSS. */
    initial: group([...initial]),
    /** Extra da rota /jogo/mistura (nó da rota e dependências estáticas). */
    gameRoute: group([...gameRoute]),
    /** Importado sob demanda (Three.js, palco, jogo, configurações). */
    onDemand: group(onDemand),
    /** Web Worker da lógica (gerador e solver). */
    worker: group([...workers]),
    fonts: { all: sizeOf(dir, fonts), files: fonts },
    totalPrecache: sizeOf(
      dir,
      all.filter(
        (f) => f !== 'service-worker.js' && !f.endsWith('.html') && f !== '_app/version.json',
      ),
    ),
    html: sizeOf(dir, ['index.html', '200.html']),
    serviceWorker: sizeOf(dir, ['service-worker.js']),
  };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function print(report) {
  const row = (label, g) => {
    console.log(
      `${label.padEnd(34)} JS ${String(g.js.files).padStart(2)} arq ${kb(g.js.raw).padStart(9)} / gzip ${kb(g.js.gzip).padStart(9)}` +
        `   CSS ${kb(g.css.raw).padStart(8)} / gzip ${kb(g.css.gzip).padStart(8)}`,
    );
  };
  console.log('Tamanho do build (bruto / gzip nível 9)\n');
  row('Tela inicial (carga em /)', report.initial);
  row('Rota do jogo (extra ao abrir)', report.gameRoute);
  row('Sob demanda (Three.js, jogo, etc.)', report.onDemand);
  row('Web Worker da lógica', report.worker);
  console.log(
    `${'Fontes (todas; só latin é baixada)'.padEnd(34)} ${report.fonts.all.files} arq ${kb(report.fonts.all.raw)} / gzip ${kb(report.fonts.all.gzip)} (woff2 já comprime)`,
  );
  console.log(
    `\nPré-cache total (sem HTML/SW): ${report.totalPrecache.files} arquivos, ${kb(report.totalPrecache.raw)} bruto`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = computeReport();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else print(report);
}
