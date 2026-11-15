import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { computeReport } from './report-size.mjs';

/**
 * Orçamentos de tamanho sobre o build gerado (pulado se não houver build). Medido em 2026-11-14:
 * tela inicial 47,1 KB gzip de JS; jogo sob demanda 160,1 + 3,6 KB; worker 3,1 KB. Com a Embarca
 * (2026-11-15): tela inicial 48,1 KB; jogo 178,6 + 3,6 KB; um Worker por jogo, o da Embarca com
 * ~5,2 KB gzip (gerador e solver). Os tetos têm
 * ~50% de folga: pegam regressões grandes (ex.: Three.js entrando na tela inicial) sem ficar frágeis.
 */
const buildDir = fileURLToPath(new URL('../apps/portal/build', import.meta.url));
// SEM BUILD estes testes são PULADOS (não falham): `pnpm build` é pré-requisito para valer.
const hasBuild = existsSync(join(buildDir, 'index.html'));

interface Size {
  files: number;
  raw: number;
  gzip: number;
}
interface Group {
  js: Size;
  css: Size;
  list: string[];
}

const KB = 1024;
/** Nomes de classes do Three.js que sobrevivem à minificação (são nomes de exportação). */
const THREE = /WebGLRenderer|PerspectiveCamera/;

describe.skipIf(!hasBuild)('orçamentos de tamanho do build', () => {
  const report = hasBuild
    ? (computeReport(buildDir) as {
        initial: Group;
        gameRoute: Group;
        onDemand: Group;
        worker: Group;
        fonts: { all: Size };
      })
    : undefined!;

  it('o relatório separa tela inicial, jogo e worker (e acha arquivos em cada um)', () => {
    expect(report.initial.js.files).toBeGreaterThan(5);
    expect(report.gameRoute.js.files).toBeGreaterThan(0);
    expect(report.onDemand.js.files).toBeGreaterThan(0);
    // Um Worker por jogo (Mistura e Embarca).
    expect(report.worker.js.files).toBe(2);
  });

  it('JS da tela inicial abaixo de 70 KB gzip e CSS abaixo de 8 KB gzip', () => {
    expect(report.initial.js.gzip).toBeLessThan(70 * KB);
    expect(report.initial.css.gzip).toBeLessThan(8 * KB);
  });

  it('o jogo (rota + sob demanda) fica abaixo de 240 KB gzip de JS', () => {
    expect(report.gameRoute.js.gzip + report.onDemand.js.gzip).toBeLessThan(240 * KB);
  });

  it('Three.js NÃO está na tela inicial (com controle positivo: está nos chunks sob demanda)', () => {
    const hasThree = (f: string) => THREE.test(readFileSync(join(buildDir, f), 'utf8'));
    // Controle positivo: sem ele o teste passaria por vacuidade se a regex deixasse de casar
    // (ex.: minificação trocar os nomes) ou se o Three.js mudasse de lugar.
    expect(report.onDemand.list.filter((f) => f.endsWith('.js')).some(hasThree)).toBe(true);
    for (const f of report.initial.list.filter((x) => x.endsWith('.js'))) {
      expect(hasThree(f), f).toBe(false);
    }
  });

  it('cada Worker é pequeno (abaixo de 6 KB gzip) e não carrega three nem idb', () => {
    const files = report.worker.list.filter((f) => f.endsWith('.js'));
    expect(files).toHaveLength(2);
    for (const f of files) {
      const bytes = readFileSync(join(buildDir, f));
      expect(gzipSync(bytes, { level: 9 }).length, f).toBeLessThan(6 * KB);
      expect(bytes.length, f).toBeLessThan(14 * KB);
      expect(bytes.toString('utf8'), f).not.toMatch(
        /WebGLRenderer|PerspectiveCamera|indexedDB|three/i,
      );
    }
  });

  it('fontes: no máximo 200 KB no total (só os subconjuntos usados são baixados)', () => {
    expect(report.fonts.all.raw).toBeLessThan(200 * KB);
  });
});
