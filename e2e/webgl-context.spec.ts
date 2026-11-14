import { expect, test, type Page } from '@playwright/test';
import { canvasData, collectErrors, openMistura, playMove, solutionFor } from './helpers';

/** Perde o contexto WebGL do canvas atual, como o sistema faz ao tirar o app do segundo plano. */
async function loseContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __ext?: unknown }).__ext = ext;
    ext.loseContext();
  });
}

async function restoreContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __ext: { restoreContext(): void } }).__ext.restoreContext();
  });
}

test('a cena volta sozinha quando o contexto WebGL é restaurado', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  await page.waitForTimeout(500);
  const stage = page.getByTestId('stage');
  const before = (await stage.screenshot()).length;

  await loseContext(page);
  await expect(page.getByTestId('graphics-recovering')).toBeVisible();

  await restoreContext(page);
  await expect(page.getByTestId('graphics-recovering')).toBeHidden();
  await page.waitForTimeout(600);

  await page.screenshot({ path: 'test-results/context-restored-390x844.png' });
  // Uma cena desenhada comprime muito pior que um quadro em branco.
  const after = (await stage.screenshot()).length;
  expect(after).toBeGreaterThan(before * 0.6);

  // O jogo continua jogável: uma jogada é aceita e o desfazer a devolve.
  const initial = await canvasData(page, 'state');
  await playMove(page, solutionFor(1)[0]!);
  expect(await canvasData(page, 'state')).not.toBe(initial);
  await page.getByTestId('powerup-undo').click();
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('4');
  expect(await canvasData(page, 'state')).toBe(initial);
  expect(errors).toEqual([]);
});

test('com o app em segundo plano o aviso de gráficos presos não aparece', async ({ page }) => {
  await openMistura(page);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  // No celular: vai para o segundo plano e o sistema derruba o contexto.
  await setVisibility('hidden');
  await loseContext(page);
  const stuck = page.getByRole('dialog', { name: 'Gráficos interrompidos' });
  await page.waitForTimeout(5500); // mais que os 4 s do aviso
  await expect(stuck).toBeHidden();

  // Ao voltar, o navegador restaura o contexto: nenhum aviso bloqueante deve ter aparecido.
  await setVisibility('visible');
  await restoreContext(page);
  await page.waitForTimeout(600);
  await expect(stuck).toBeHidden();
  await expect(page.getByTestId('graphics-recovering')).toBeHidden();
});

test('sem restauração o portal oferece recarregar o jogo', async ({ page }) => {
  await openMistura(page);
  await loseContext(page);

  const dialog = page.getByRole('dialog', { name: 'Gráficos interrompidos' });
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: 'test-results/context-stuck-390x844.png' });

  await dialog.getByRole('button', { name: 'Recarregar jogo' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('powerup-hint-count')).toHaveText('1');
  await page.waitForTimeout(500);
  const gameCanvasLive = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    return gl ? !gl.isContextLost() : false;
  });
  expect(gameCanvasLive).toBe(true);
});
