import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Toca em pontos de uma grade sobre o palco até algum cubo reagir. */
async function tapUntilScored(page: Page): Promise<void> {
  const box = await page.getByTestId('stage').boundingBox();
  if (!box) throw new Error('palco sem caixa');
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 3; col++) {
      await page.mouse.click(
        box.x + box.width * (0.25 + col * 0.25),
        box.y + box.height * (0.25 + row * 0.1),
      );
      if ((await page.getByTestId('score').textContent()) !== '0') return;
    }
  }
}

test('demo renderiza o palco 3D sem erros e reage ao toque', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/demo');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('hint')).toHaveText('Toque nos cubos para fazê-los pular.');
  await page.waitForTimeout(500); // alguns quadros
  await page.screenshot({ path: 'test-results/demo-390x844.png' });

  await tapUntilScored(page);
  await expect(page.getByTestId('score')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('o canvas ocupa o palco e se ajusta ao redimensionar', async ({ page }) => {
  await page.goto('/demo');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const before = await canvas.boundingBox();
  expect(before?.width).toBeCloseTo(390, 0);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBeCloseTo(820, 0);
});

test('idioma e configurações persistem após recarregar (IndexedDB)', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByTestId('hint')).toHaveText(/Toque nos cubos/);
  await page.getByRole('button', { name: 'en' }).click();
  await expect(page.getByTestId('hint')).toHaveText('Tap the cubes to make them jump.');
  await page.getByRole('checkbox').check();
  // dá tempo da gravação assíncrona terminar
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.getByTestId('hint')).toHaveText('Tap the cubes to make them jump.');
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('entrar e sair da demo libera o canvas e o contexto WebGL', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('link', { name: 'Cena de demonstração' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      (window as unknown as { __canvas?: HTMLCanvasElement }).__canvas =
        document.querySelector('canvas') ?? undefined;
    });
    await page.getByRole('link', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();

    const released = await page.evaluate(() => {
      const c = (window as unknown as { __canvas?: HTMLCanvasElement }).__canvas;
      const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
      return { detached: c ? !c.isConnected : false, lost: gl ? gl.isContextLost() : false };
    });
    expect(released).toEqual({ detached: true, lost: true });
    expect(await page.locator('canvas').count()).toBe(0);
  }
  expect(errors).toEqual([]);
});
