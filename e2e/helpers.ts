import { expect, type Page } from '@playwright/test';
import { generateLevel, type Move } from '@recreio/game-mistura/logic';

/** Coleta erros de console e exceções da página. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Abre o jogo pela tela inicial e espera o palco 3D aparecer. */
export async function openMistura(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('card-mistura').click();
  await expect(page).toHaveURL(/\/jogo\/mistura/);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('hud-level')).toBeVisible();
  await waitForBoard(page);
}

/** Espera o tabuleiro estar pronto (o jogo publica os tubos em px no dataset do canvas). */
export async function waitForBoard(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readTubes(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
}

/**
 * Grava a fase atual do progresso da Mistura direto no IndexedDB (atalho de teste para
 * abrir fases altas). Deve ser chamado numa página do portal já carregada (ex.: `/`).
 */
export async function seedLevel(page: Page, level: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Recreio' }).waitFor();
  await page.evaluate(async (n) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('recreio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(
        { v: 1, data: { currentLevel: n, highestCompleted: n - 1, stars: {}, powerUps: {} } },
        'recreio:progress:mistura',
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, level);
}

export interface TubeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulos de toque dos tubos, em px do canvas (publicados pelo jogo). */
export async function readTubes(page: Page): Promise<TubeBox[]> {
  const raw = await page.locator('canvas').getAttribute('data-tubes');
  return raw ? (JSON.parse(raw) as TubeBox[]) : [];
}

/** Atributo `data-*` do canvas (estado do jogo publicado para os testes). */
export async function canvasData(page: Page, name: string): Promise<string> {
  return (await page.locator('canvas').getAttribute(`data-${name}`)) ?? '';
}

/** Toca no centro do tubo `index`. */
export async function tapTube(page: Page, index: number): Promise<void> {
  const tubes = await readTubes(page);
  const t = tubes[index];
  if (!t) throw new Error(`tubo ${index} não existe (${tubes.length} tubos)`);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas sem caixa');
  await page.mouse.click(box.x + t.x, box.y + t.y);
}

/** Espera o jogo ficar sem animações (o canvas publica `data-moving`). */
export async function waitIdle(page: Page): Promise<void> {
  await expect.poll(() => canvasData(page, 'moving'), { timeout: 20_000 }).toBe('0');
}

/** Espera alguns quadros terem sido desenhados (o diagnóstico publica `data-fps` a cada 0,5 s). */
export async function waitFrames(page: Page): Promise<void> {
  await expect.poll(() => canvasData(page, 'fps'), { timeout: 20_000 }).not.toBe('');
}

/**
 * Uma jogada: toca na origem e depois no destino. Por padrão espera a animação terminar;
 * com `settle: false` volta logo (para testar interrupções de propósito).
 */
export async function playMove(
  page: Page,
  move: Move,
  opts: { settle?: boolean } = {},
): Promise<void> {
  await tapTube(page, move.from);
  await tapTube(page, move.to);
  if (opts.settle ?? true) await waitIdle(page);
}

/** A solução da fase, calculada pelo solver do pacote do jogo (a mesma que o jogo usa). */
export function solutionFor(level: number): Move[] {
  return generateLevel(level).solution;
}

/** Estado (`data-state`) em lista de tubos; cada tubo é a lista de tokens ("?" = oculto). */
export async function readState(page: Page): Promise<string[][]> {
  const raw = await canvasData(page, 'state');
  return raw.split('|').map((t) => t.trim().split(/\s+/).filter(Boolean));
}

/** Resolvido: todo tubo vazio ou cheio (`capacity`) de uma só cor, sem "?". */
export function isSolvedState(tubes: string[][], capacity: number): boolean {
  return tubes.every(
    (t) => t.length === 0 || (t.length === capacity && t.every((c) => c !== '?' && c === t[0])),
  );
}

/** O que o render mostra (`data-view`) tem de coincidir com o estado lógico (`data-state`). */
export async function expectViewMatchesState(page: Page): Promise<void> {
  await waitIdle(page);
  expect(await canvasData(page, 'view')).toBe(await canvasData(page, 'state'));
}

/**
 * Completa a fase `level` (a partir do início dela) seguindo a solução do solver.
 * As primeiras jogadas esperam a animação; as demais interrompem a anterior.
 * Termina quando o modal "Fase concluída" aparece.
 */
export async function completeLevelWithSolver(page: Page, level = 1): Promise<void> {
  const moves = solutionFor(level);
  for (const [i, move] of moves.entries()) {
    await playMove(page, move, { settle: i < 2 });
  }
  await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
    timeout: 20_000,
  });
}
