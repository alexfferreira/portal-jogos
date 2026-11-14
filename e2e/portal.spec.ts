import { expect, test } from '@playwright/test';
import { collectErrors, openMistura, playUntilLevelComplete } from './helpers';

test('início mostra o cartão da Mistura com o progresso', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  await expect(page.getByTestId('card-mistura')).toContainText('Mistura');
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 1');
  await page.screenshot({ path: 'test-results/home-390x844.png' });
  expect(errors).toEqual([]);
});

test('jogo abre com HUD, power-ups e responde ao toque', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 1');
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('5');
  await expect(page.getByTestId('powerup-extraTube-count')).toHaveText('1');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/game-390x844.png' });

  await page.getByTestId('powerup-undo').click();
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('4');
  await page.getByTestId('powerup-extraTube').click();
  await expect(page.getByTestId('powerup-extraTube')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('pausar abre o modal e Esc continua', async ({ page }) => {
  await openMistura(page);
  await page.getByRole('button', { name: 'Pausar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pausado' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: 'test-results/pause-390x844.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Sair do jogo' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('concluir a fase abre o modal, avança e o progresso persiste', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  await playUntilLevelComplete(page);
  const dialog = page.getByRole('dialog', { name: 'Fase concluída' });
  await expect(dialog).toContainText('Você completou a fase 1.');
  await page.screenshot({ path: 'test-results/level-complete-390x844.png' });

  await dialog.getByRole('button', { name: 'Próxima fase' }).click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('5');

  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');
  await page.reload();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');
  expect(errors).toEqual([]);
});

test('todos os botões do jogo têm área de toque de pelo menos 44 px', async ({ page }) => {
  await openMistura(page);
  const targets = page.locator('button:visible');
  const count = await targets.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    const name =
      (await targets.nth(i).getAttribute('aria-label')) ?? (await targets.nth(i).innerText());
    expect(box?.height, `altura de "${name}"`).toBeGreaterThanOrEqual(43.5);
    expect(box?.width, `largura de "${name}"`).toBeGreaterThanOrEqual(43.5);
  }
});

test('jogo inexistente mostra aviso e volta ao início', async ({ page }) => {
  await page.goto('/jogo/nao-existe');
  await expect(page.getByText('Jogo não encontrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('entrar e sair do jogo libera o canvas e o contexto WebGL', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('card-mistura').click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      (window as unknown as { __canvas?: HTMLCanvasElement }).__canvas =
        document.querySelector('canvas') ?? undefined;
    });
    await page.getByRole('button', { name: 'Voltar' }).click();
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

test('o canvas acompanha o redimensionamento da janela', async ({ page }) => {
  await openMistura(page);
  const canvas = page.locator('canvas');
  expect((await canvas.boundingBox())?.width).toBeCloseTo(390, 0);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect
    .poll(async () => (await canvas.boundingBox())?.width, { timeout: 15_000 })
    .toBeCloseTo(820, 0);
});
