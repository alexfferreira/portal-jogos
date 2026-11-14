import { expect, test, type Page } from '@playwright/test';
import { canvasData, collectErrors, completeLevelWithSolver, openMistura } from './helpers';

/**
 * Roda no build E no dev server (veja `projects` em playwright.config.ts). Pega falhas do Worker
 * que só aparecem em um dos dois, como o 403 do `server.fs.allow` no `vite dev`.
 */

/** Espera o Web Worker da lógica da Mistura aparecer (o Playwright emite 'worker' para cada um). */
async function waitForLogicWorker(page: Page): Promise<string> {
  await expect
    .poll(() => page.workers().some((w) => /logic\.worker/.test(w.url())), { timeout: 15_000 })
    .toBe(true);
  return page
    .workers()
    .find((w) => /logic\.worker/.test(w.url()))!
    .url();
}

test('a Mistura abre com um Web Worker real, sem erros, e completa a fase 1', async ({ page }) => {
  const errors = collectErrors(page);
  const failedRequests: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failedRequests.push(`FALHOU ${r.url()}`));

  await openMistura(page);

  // O jogo não pode ter caído no fallback da thread principal sem avisar: o Worker existe.
  const workerUrl = await waitForLogicWorker(page);
  expect(workerUrl).toMatch(/logic\.worker/);

  // A fase só se completa se o Worker (gerador e dica) respondeu de verdade.
  await completeLevelWithSolver(page, 1);

  expect(failedRequests, 'nenhuma requisição deve falhar (ex.: 403/404 do Worker)').toEqual([]);
  expect(errors).toEqual([]);
});

test('a dica usa o Worker e não gera erro', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  await waitForLogicWorker(page);
  await page.getByTestId('powerup-hint').click();
  await expect(page.getByTestId('powerup-hint-count')).toHaveText('0');
  await expect.poll(() => canvasData(page, 'hint')).toMatch(/^\d+,\d+$/);
  expect(errors).toEqual([]);
});
