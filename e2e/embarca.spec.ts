import { expect, test } from '@playwright/test';
import { createState, generateLevel, isFree } from '@recreio/game-embarca/logic';
import { canvasData, collectErrors, waitFrames, waitIdle } from './helpers';
import {
  expectViewMatchesState,
  findStuckSequence,
  openEmbarca,
  playSolution,
  readVehicles,
  seedEmbarcaLevel,
  tapVehicle,
} from './embarca';

test('a Embarca abre pelo cartão, desenha sem erros e o canvas tem nome acessível', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('card-embarca')).toBeVisible();
  await openEmbarca(page);
  await waitFrames(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('aria-label', /Tabuleiro de estacionamento/);
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 1');
  expect((await readVehicles(page)).length).toBe(generateLevel(1).state.level.vehicles.length);
  await page.screenshot({ path: 'test-results/embarca-fase1-390x844.png' });
  expect(errors).toEqual([]);
});

test('o toque é generoso: poucos px fora do veículo ainda o escolhem', async ({ page }) => {
  const errors = collectErrors(page);
  await openEmbarca(page);
  const first = generateLevel(1).solution[0]!.vehicle;
  const box = (await readVehicles(page)).find((v) => v.id === first)!;
  const before = await canvasData(page, 'state');
  await tapVehicle(page, first, { dx: box.w / 2 + 15 });
  await waitIdle(page);
  // Algum veículo foi escolhido: o estado mudou ou houve uma batida.
  const changed = (await canvasData(page, 'state')) !== before;
  const bumped = (await canvasData(page, 'bumps')) !== '0';
  expect(changed || bumped).toBe(true);
  expect(errors).toEqual([]);
});

test('joga a fase 1 pelo toque (inclusive interrompendo animações), conclui e avança', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openEmbarca(page);
  // Só a primeira jogada espera a animação; as outras tocam durante a anterior (foco 1).
  await playSolution(page, 1, { rushFrom: 1 });
  await expectViewMatchesState(page);
  await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: 'test-results/embarca-fase-concluida-390x844.png' });
  await page.getByRole('button', { name: 'Próxima fase' }).click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  await expect.poll(() => canvasData(page, 'level')).toBe('2');
  await expectViewMatchesState(page);

  // O progresso persiste depois de recarregar.
  await page.reload(); // continua na rota do jogo
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  expect(errors).toEqual([]);
});

test('tocar num veículo bloqueado conta uma batida e não muda o estado', async ({ page }) => {
  const errors = collectErrors(page);
  let target: { level: number; id: number } | null = null;
  for (let level = 1; level <= 15 && target === null; level++) {
    const state = createState(generateLevel(level).state.level);
    const blocked = state.onBoard.find((id) => !isFree(state, id));
    if (blocked !== undefined) target = { level, id: blocked };
  }
  expect(target).not.toBeNull();
  await seedEmbarcaLevel(page, target!.level);
  await openEmbarca(page);
  const before = await canvasData(page, 'state');
  await tapVehicle(page, target!.id);
  await waitIdle(page);
  expect(await canvasData(page, 'bumps')).toBe('1');
  expect(await canvasData(page, 'state')).toBe(before);
  await expectViewMatchesState(page);
  await page.screenshot({ path: 'test-results/embarca-bate-e-volta-390x844.png' });
  expect(errors).toEqual([]);
});

test.describe('sem jogadas', () => {
  const setup = findStuckSequence();

  test('o aviso oferece Reiniciar, que volta ao início da fase', async ({ page }) => {
    const errors = collectErrors(page);
    expect(setup).not.toBeNull();
    await seedEmbarcaLevel(page, setup!.level);
    await openEmbarca(page);
    const initial = await canvasData(page, 'state');
    for (const move of setup!.moves) {
      await tapVehicle(page, move.vehicle);
      await waitIdle(page);
    }
    const dialog = page.getByRole('dialog', { name: 'Sem jogadas' });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: 'test-results/embarca-sem-jogadas-390x844.png' });
    await dialog.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(dialog).toBeHidden();
    expect(await canvasData(page, 'state')).toBe(initial);
    await expectViewMatchesState(page);
    expect(errors).toEqual([]);
  });
});

test('girar a tela no meio da partida mantém o enquadramento e o toque', async ({ page }) => {
  const errors = collectErrors(page);
  await openEmbarca(page);
  const portrait = JSON.stringify(await readVehicles(page));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => JSON.stringify(await readVehicles(page))).not.toBe(portrait);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => JSON.stringify(await readVehicles(page))).toBe(portrait);

  const first = generateLevel(1).solution[0]!.vehicle;
  const before = await canvasData(page, 'state');
  await tapVehicle(page, first);
  await waitIdle(page);
  expect(await canvasData(page, 'state')).not.toBe(before);
  expect(errors).toEqual([]);
});

test('entrar e sair do jogo várias vezes não aumenta geometrias nem texturas', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/');
  const samples: { geometries: string; textures: string }[] = [];
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('card-embarca').click();
    await expect(page.locator('canvas')).toBeVisible();
    await waitFrames(page);
    samples.push({
      geometries: await canvasData(page, 'geometries'),
      textures: await canvasData(page, 'textures'),
    });
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(Number(samples[0]!.geometries)).toBeGreaterThan(0);
  // Da segunda entrada em diante nada cresce.
  for (const s of samples.slice(2)) expect(s).toEqual(samples[1]);
  expect(errors).toEqual([]);
});

test('reiniciar com a animação em andamento deixa o estado inicial e sem animação', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openEmbarca(page);
  const initial = await canvasData(page, 'state');
  const first = generateLevel(1).solution[0]!.vehicle;
  await tapVehicle(page, first); // não espera a animação
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await waitIdle(page);
  expect(await canvasData(page, 'state')).toBe(initial);
  await expectViewMatchesState(page);
  expect(errors).toEqual([]);
});

test('uma fase alta (41) abre sem erros e mostra todos os veículos dentro do canvas', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedEmbarcaLevel(page, 41);
  await openEmbarca(page);
  await waitFrames(page);
  const vehicles = await readVehicles(page);
  expect(vehicles).toHaveLength(generateLevel(41).state.level.vehicles.length);
  const canvas = (await page.locator('canvas').boundingBox())!;
  for (const v of vehicles) {
    expect(v.x).toBeGreaterThanOrEqual(-1);
    expect(v.y).toBeGreaterThanOrEqual(-1);
    expect(v.x + v.w).toBeLessThanOrEqual(canvas.width + 1);
    expect(v.y + v.h).toBeLessThanOrEqual(canvas.height + 1);
  }
  await page.screenshot({ path: 'test-results/embarca-fase41-390x844.png' });
  expect(errors).toEqual([]);
});
