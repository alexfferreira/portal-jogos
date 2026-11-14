import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { collectErrors, completeLevelWithSolver, openMistura } from './helpers';

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/configuracoes/);
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
}

test('idioma e opções persistem após recarregar', async ({ page }) => {
  const errors = collectErrors(page);
  await openSettings(page);
  await page.screenshot({ path: 'test-results/settings-390x844.png', fullPage: true });

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('switch', { name: 'Colorblind mode' }).click();
  await page.getByRole('button', { name: 'Low' }).click();
  await page.waitForTimeout(300); // gravação assíncrona

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Colorblind mode' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(errors).toEqual([]);
});

test('os controles têm área de toque de pelo menos 44 px', async ({ page }) => {
  await openSettings(page);
  const targets = page.locator('button:visible, [role="switch"]:visible');
  const count = await targets.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    const name = await targets.nth(i).innerText();
    expect(box?.height, `altura de "${name}"`).toBeGreaterThanOrEqual(43.5);
    expect(box?.width, `largura de "${name}"`).toBeGreaterThanOrEqual(43.5);
  }
});

test('exportar e importar o progresso (backup)', async ({ page }, testInfo) => {
  // Cria progresso: conclui a fase 1 e muda uma configuração.
  await openMistura(page);
  await completeLevelWithSolver(page, 1);
  await page.getByRole('button', { name: 'Próxima fase' }).click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('switch', { name: 'Modo daltônico' }).click();
  await page.waitForTimeout(300);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar progresso' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^recreio-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = testInfo.outputPath('backup.json');
  await download.saveAs(path);
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.app).toBe('recreio');
  expect(Object.keys(backup.entries)).toEqual(
    expect.arrayContaining(['settings', 'progress:mistura']),
  );

  // Apaga o progresso e restaura pelo arquivo.
  await page.getByRole('button', { name: 'Reiniciar progresso' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar progresso' }).click();
  await expect(page.getByTestId('message')).toHaveText('Progresso apagado.');

  const reload = page.waitForEvent('load');
  await page.getByTestId('backup-file').setInputFiles(path);
  const confirm = page.getByRole('dialog', { name: 'Importar este backup?' });
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByTestId('message')).toContainText('itens importados');
  await reload;

  await expect(page.getByRole('switch', { name: 'Modo daltônico' })).toBeChecked();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');
});

test('arquivo inválido não altera nada', async ({ page }, testInfo) => {
  await openSettings(page);
  const bad = testInfo.outputPath('ruim.json');
  await import('node:fs/promises').then((fs) => fs.writeFile(bad, '{"qualquer":"coisa"}'));
  const confirm = page.getByRole('dialog', { name: 'Importar este backup?' });
  // Cancelar não faz nada.
  await page.getByTestId('backup-file').setInputFiles(bad);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('message')).toHaveText('');
  // Confirmar com um arquivo que não é backup é recusado sem tocar nos dados.
  await page.getByTestId('backup-file').setInputFiles(bad);
  await confirm.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByTestId('message')).toHaveText('Arquivo inválido. Nada foi alterado.');
});

test('reiniciar progresso pede confirmação dentro do app', async ({ page }) => {
  await openMistura(page);
  await completeLevelWithSolver(page, 1);
  await page.getByRole('button', { name: 'Próxima fase' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');
  await page.getByRole('button', { name: 'Configurações' }).click();

  let nativeDialogs = 0;
  page.on('dialog', async (d) => {
    nativeDialogs++;
    await d.dismiss();
  });

  await page.getByRole('button', { name: 'Reiniciar progresso' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reiniciar o progresso de Mistura?' });
  await expect(dialog).toBeVisible();
  // O foco abre no botão seguro e o fundo fica inerte (fora do alcance de Tab e leitor de tela).
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  expect(await page.locator('main').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await page.screenshot({ path: 'test-results/reset-confirm-390x844.png' });

  // Cancelar mantém o progresso.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');

  // Confirmar apaga.
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Reiniciar progresso' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar progresso' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 1');
  expect(nativeDialogs).toBe(0);
});
