import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Consistência do pré-cache sobre o build já gerado (`apps/portal/build`). Se o build não existe
 * (ex.: `pnpm test` antes do primeiro `pnpm build`) o teste é pulado; o e2e `pwa-offline.spec.ts`
 * repete a conferência olhando o Cache Storage de verdade.
 */
const buildDir = fileURLToPath(new URL('../../build', import.meta.url));
const hasBuild = existsSync(join(buildDir, 'service-worker.js'));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (f: string) => relative(buildDir, f).split(sep).join('/');

describe.skipIf(!hasBuild)('pré-cache do service worker (build gerado)', () => {
  const sw = hasBuild ? readFileSync(join(buildDir, 'service-worker.js'), 'utf8') : '';
  // O Vite embute as listas de `$app/manifest` como `{path:`...`}`.
  const listed = new Set([...sw.matchAll(/\{path:`([^`]+)`\}/g)].map((m) => m[1]!));
  const onDisk = hasBuild ? walk(buildDir).map(rel) : [];

  it('tem uma lista de arquivos (o regex ainda reconhece o formato do build)', () => {
    expect(listed.size).toBeGreaterThan(20);
  });

  it('todo arquivo de _app/immutable está no pré-cache (chunks, jogo, worker, fontes, CSS)', () => {
    const immutable = onDisk.filter((f) => f.startsWith('_app/immutable/'));
    expect(immutable.length).toBeGreaterThan(20);
    expect(immutable.filter((f) => !listed.has(f))).toEqual([]);
    expect(immutable.some((f) => /^_app\/immutable\/workers\/logic\.worker-.*\.js$/.test(f))).toBe(
      true,
    );
    expect(immutable.some((f) => f.endsWith('.woff2'))).toBe(true);
    expect(immutable.some((f) => f.endsWith('.css'))).toBe(true);
  });

  it('manifest e ícones estão no pré-cache', () => {
    for (const f of [
      'manifest.webmanifest',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
      'apple-touch-icon.png',
      'favicon.svg',
      'favicon.ico',
    ]) {
      expect(listed.has(f), f).toBe(true);
    }
  });

  it('o worker não pré-cacheia nada que não exista (a instalação falharia)', () => {
    expect([...listed].filter((f) => !onDisk.includes(f))).toEqual([]);
  });

  it('a página de fallback existe e o worker a usa', () => {
    expect(onDisk).toContain('200.html');
    expect(sw).toContain('200.html');
  });

  it('version.json está no pré-cache só como reserva offline', () => {
    // Entra por constante do worker (não vem do `$app/manifest`), então o arquivo precisa existir.
    expect(onDisk).toContain('_app/version.json');
    expect(sw).toContain('_app/version.json');
  });
});
