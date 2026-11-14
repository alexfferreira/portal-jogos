import { expect, test } from '@playwright/test';

test('portal abre sem erros no console', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  expect(errors).toEqual([]);
});
