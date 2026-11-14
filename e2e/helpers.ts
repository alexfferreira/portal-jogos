import { expect, type Page } from '@playwright/test';

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
}

/**
 * Toca em pontos de uma grade sobre o palco até a fase provisória terminar
 * (aparece o modal "Fase concluída").
 */
export async function playUntilLevelComplete(page: Page): Promise<void> {
  const box = await page.getByTestId('stage').boundingBox();
  if (!box) throw new Error('palco sem caixa');
  const dialog = page.getByRole('dialog', { name: 'Fase concluída' });
  for (let pass = 0; pass < 6; pass++) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 3; col++) {
        await page.mouse.click(
          box.x + box.width * (0.2 + col * 0.3),
          box.y + box.height * (0.12 + row * 0.12),
        );
      }
    }
    if (await dialog.isVisible()) return;
  }
  throw new Error('a fase não terminou depois de várias rodadas de toques');
}
