import { expect, test, type Page } from '@playwright/test';
import {
  canvasData,
  collectErrors,
  completeLevelWithSolver,
  expectViewMatchesState,
  isSolvedState,
  openMistura,
  playMove,
  readState,
  readTubes,
  seedLevel,
  solutionFor,
  tapTube,
  waitFrames,
  waitIdle,
} from './helpers';
import { findStuckSequence } from './stuck';

test('a cena renderiza sem erros e mostra o tutorial da fase 1', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  await waitFrames(page);
  expect((await readTubes(page)).length).toBe(5);
  await expect(page.getByTestId('hud-message')).toContainText('Toque em um tubo');
  expect(await canvasData(page, 'hand')).not.toBe('');
  // O canvas tem nome acessível.
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('aria-label', /Tabuleiro com tubos/);
  await page.screenshot({ path: 'test-results/mistura-fase1-390x844.png' });
  expect(errors).toEqual([]);
});

test('toda a área de toque dos tubos tem pelo menos 44 px', async ({ page }) => {
  await seedLevel(page, 260);
  await openMistura(page);
  const tubes = await readTubes(page);
  expect(tubes.length).toBeGreaterThanOrEqual(16);
  for (const t of tubes) {
    expect(t.w).toBeGreaterThanOrEqual(44);
    expect(t.h).toBeGreaterThanOrEqual(44);
  }
  await waitFrames(page);
  await page.screenshot({ path: 'test-results/mistura-fase260-390x844.png' });
});

test('camadas ocultas não vazam a cor em data-state', async ({ page }) => {
  await seedLevel(page, 260);
  await openMistura(page);
  const state = await canvasData(page, 'state');
  expect(state).toContain('?');
  expect(state).not.toMatch(/\d\?/);
  expect(await canvasData(page, 'view')).toBe(state);
});

test('seleção, despejo e conclusão da fase 1 com o solver; próxima fase e persistência', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openMistura(page);
  const [first] = solutionFor(1);
  await tapTube(page, first!.from);
  await expect.poll(() => canvasData(page, 'selected')).toBe(String(first!.from));
  await waitIdle(page);
  await page.screenshot({ path: 'test-results/mistura-selecionado-390x844.png' });
  await tapTube(page, first!.to);
  await expect.poll(() => canvasData(page, 'moving')).toBe('1');
  await page.screenshot({ path: 'test-results/mistura-despejo-390x844.png' });
  await waitIdle(page);
  // Recomeça do zero: desfaz a jogada e joga a solução inteira.
  await page.getByTestId('powerup-undo').click();
  await completeLevelWithSolver(page, 1);
  await waitFrames(page);
  await page.screenshot({ path: 'test-results/mistura-vitoria-390x844.png' });

  const dialog = page.getByRole('dialog', { name: 'Fase concluída' });
  await dialog.getByRole('button', { name: 'Próxima fase' }).click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('5');
  await expect(page.getByTestId('powerup-hint-count')).toHaveText('1');
  await expect.poll(async () => (await readTubes(page)).length).toBeGreaterThan(0);
  await expectViewMatchesState(page);
  await page.screenshot({ path: 'test-results/mistura-fase2-390x844.png' });

  // Persistência: recarregar continua na fase 2 e o cartão mostra "Fase 2".
  await page.goto('/');
  await expect(page.getByTestId('progress-mistura')).toHaveText('Fase 2');
  await page.getByTestId('card-mistura').click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  expect(errors).toEqual([]);
});

test('jogada inválida e toque em tubo vazio não corrompem o estado', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  const before = await canvasData(page, 'state');
  const tubes = before.split(' | ');
  const empty = tubes.findIndex((t) => t.trim() === '');
  expect(empty).toBeGreaterThanOrEqual(0);

  await tapTube(page, empty); // origem vazia: não seleciona
  expect(await canvasData(page, 'selected')).toBe('');

  // Duas cores de topo diferentes: jogada recusada.
  const tops = tubes.map((t) => t.trim().split(' ').pop());
  let a = -1;
  let b = -1;
  tops.forEach((c, i) => {
    if (!c) return;
    const j = tops.findIndex(
      (d, k) => k !== i && d && d !== c && tubes[k]!.trim().split(' ').length >= 3,
    );
    if (a < 0 && j >= 0 && tubes[i]!.trim().split(' ').length >= 3) {
      a = i;
      b = j;
    }
  });
  expect(a).toBeGreaterThanOrEqual(0);
  await tapTube(page, a);
  await tapTube(page, b);
  await waitIdle(page);
  expect(await canvasData(page, 'state')).toBe(before);
  expect(await canvasData(page, 'selected')).toBe('');

  // Tocar na origem de novo cancela a seleção.
  await tapTube(page, a);
  expect(await canvasData(page, 'selected')).toBe(String(a));
  await tapTube(page, a);
  expect(await canvasData(page, 'selected')).toBe('');
  await expect(page.getByTestId('powerup-undo')).toBeDisabled();
  await expectViewMatchesState(page);
  expect(errors).toEqual([]);
});

test('interrupções: o visual sempre converge para o estado lógico', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  const moves = solutionFor(1);
  const initial = await canvasData(page, 'state');

  // (1) uma jogada normal
  await playMove(page, moves[0]!);
  await expectViewMatchesState(page);

  // (2) a 2ª e a 3ª jogadas interrompem a anterior (sem esperar o fim)
  await playMove(page, moves[1]!, { settle: false });
  await playMove(page, moves[2]!, { settle: false });
  await expectViewMatchesState(page);
  await page.screenshot({ path: 'test-results/mistura-rapido-390x844.png' });

  // (3) desfazer durante a animação
  await playMove(page, moves[3]!, { settle: false });
  await page.getByTestId('powerup-undo').click();
  await expectViewMatchesState(page);

  // (4) reiniciar durante a animação volta ao estado inicial
  await playMove(page, moves[3]!, { settle: false });
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await expectViewMatchesState(page);
  expect(await canvasData(page, 'state')).toBe(initial);
  expect(await canvasData(page, 'selected')).toBe('');
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('5');

  // (5) joga tudo e passa para a fase 2
  for (const m of moves.slice(0, -1)) await playMove(page, m, { settle: false });
  await playMove(page, moves.at(-1)!);
  await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Próxima fase' }).click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
  await expectViewMatchesState(page);
  expect(errors).toEqual([]);
});

test('reiniciar durante a animação não deixa lixo (mão, dica, seleção)', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  const initial = await canvasData(page, 'state');
  const [m] = solutionFor(1);
  await tapTube(page, m!.from);
  await tapTube(page, m!.to);
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await waitIdle(page);
  expect(await canvasData(page, 'state')).toBe(initial);
  expect(await canvasData(page, 'selected')).toBe('');
  expect(await canvasData(page, 'hint')).toBe('');
  await expectViewMatchesState(page);
  // O jogo segue jogável depois do reinício.
  await playMove(page, m!);
  expect(await canvasData(page, 'state')).not.toBe(initial);
  expect(errors).toEqual([]);
});

/** Executa o ato do bug de "vitória atrasada": a fase só termina com o tabuleiro resolvido. */
async function lastMoveThenInterrupt(page: Page, action: () => Promise<void>): Promise<void> {
  const moves = solutionFor(1);
  for (const m of moves.slice(0, -1)) await playMove(page, m, { settle: false });
  await waitIdle(page);
  await playMove(page, moves.at(-1)!, { settle: false });
  await action();
}

for (const powerUp of ['undo', 'extraTube', 'hint'] as const) {
  test(`usar "${powerUp}" durante o último despejo não altera a fase vencida`, async ({ page }) => {
    const errors = collectErrors(page);
    await openMistura(page);
    await lastMoveThenInterrupt(page, async () => {
      // O botão pode já estar desabilitado se a vitória foi mais rápida; ambos os casos valem.
      const button = page.getByTestId(`powerup-${powerUp}`);
      if (await button.isEnabled()) await button.click({ timeout: 2000 }).catch(() => {});
    });
    await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
      timeout: 20_000,
    });
    await waitIdle(page);
    expect(await canvasData(page, 'won')).toBe('true');
    const capacity = 4;
    expect(isSolvedState(await readState(page), capacity)).toBe(true);
    expect(await canvasData(page, 'selected')).toBe('');
    expect(await canvasData(page, 'tube-count')).toBe('5');
    expect(await canvasData(page, 'view')).toBe(await canvasData(page, 'state'));
    expect(errors).toEqual([]);
  });
}

test('tocar durante o último despejo não seleciona tubo nem altera a fase vencida', async ({
  page,
}) => {
  await openMistura(page);
  await lastMoveThenInterrupt(page, async () => {
    await tapTube(page, 0);
    await tapTube(page, 1);
  });
  await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await canvasData(page, 'won')).toBe('true');
  expect(isSolvedState(await readState(page), 4)).toBe(true);
  expect(await canvasData(page, 'selected')).toBe('');
});

test('power-ups: desfazer, tubo extra e dica', async ({ page }) => {
  const errors = collectErrors(page);
  await openMistura(page);
  const initial = await canvasData(page, 'state');
  const moves = solutionFor(1);

  await playMove(page, moves[0]!);
  expect(await canvasData(page, 'state')).not.toBe(initial);
  await page.getByTestId('powerup-undo').click();
  await expect(page.getByTestId('powerup-undo-count')).toHaveText('4');
  expect(await canvasData(page, 'state')).toBe(initial);

  const tubesBefore = (await readTubes(page)).length;
  await page.getByTestId('powerup-extraTube').click();
  await expect(page.getByTestId('powerup-extraTube-count')).toHaveText('0');
  await expect.poll(async () => (await readTubes(page)).length).toBe(tubesBefore + 1);
  expect(await canvasData(page, 'tube-count')).toBe(String(tubesBefore + 1));
  await expectViewMatchesState(page);

  expect(await canvasData(page, 'hint')).toBe('');
  await page.getByTestId('powerup-hint').click();
  await expect.poll(() => canvasData(page, 'hint')).toMatch(/^\d+,\d+$/);
  await expect(page.getByTestId('powerup-hint-count')).toHaveText('0');
  await waitFrames(page);
  await page.screenshot({ path: 'test-results/mistura-dica-390x844.png' });

  // Qualquer jogada apaga a dica.
  await playMove(page, moves[0]!);
  expect(await canvasData(page, 'hint')).toBe('');
  expect(errors).toEqual([]);
});

test.describe('sem jogadas', () => {
  const setup = findStuckSequence();

  async function reachStuck(page: Page): Promise<{ beforeLast: string; initial: string }> {
    await seedLevel(page, setup!.level);
    await openMistura(page);
    const initial = await canvasData(page, 'state');
    let beforeLast = initial;
    for (const [i, m] of setup!.moves.entries()) {
      if (i === setup!.moves.length - 1) beforeLast = await canvasData(page, 'state');
      await playMove(page, m);
    }
    await expect(page.getByRole('dialog', { name: 'Sem jogadas' })).toBeVisible();
    return { beforeLast, initial };
  }

  test('desfazer fecha o aviso e devolve a jogada; tubo extra abre jogadas', async ({ page }) => {
    const errors = collectErrors(page);
    expect(setup).not.toBeNull();
    const { beforeLast } = await reachStuck(page);
    const dialog = page.getByRole('dialog', { name: 'Sem jogadas' });
    await page.screenshot({ path: 'test-results/mistura-sem-jogadas-390x844.png' });

    await dialog.getByRole('button', { name: 'Desfazer' }).click();
    await expect(dialog).toBeHidden();
    expect(await canvasData(page, 'state')).toBe(beforeLast);
    await expectViewMatchesState(page);

    // Refaz o beco e usa o tubo extra.
    await playMove(page, setup!.moves.at(-1)!);
    await expect(dialog).toBeVisible();
    const tubes = Number(await canvasData(page, 'tube-count'));
    await dialog.getByRole('button', { name: 'Tubo extra' }).click();
    await expect(dialog).toBeHidden();
    expect(await canvasData(page, 'tube-count')).toBe(String(tubes + 1));
    await expectViewMatchesState(page);
    expect(errors).toEqual([]);
  });

  test('reiniciar fecha o aviso e volta ao início da fase', async ({ page }) => {
    const { initial } = await reachStuck(page);
    const dialog = page.getByRole('dialog', { name: 'Sem jogadas' });
    await dialog.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(dialog).toBeHidden();
    expect(await canvasData(page, 'state')).toBe(initial);
    await expectViewMatchesState(page);
  });
});

test('modo daltônico mostra um símbolo em cada unidade', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('switch', { name: 'Modo daltônico' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await openMistura(page);
  // Fase 1: 3 cores x 4 unidades.
  await expect.poll(() => canvasData(page, 'symbols')).toBe('12');
  await waitFrames(page);
  await page.screenshot({ path: 'test-results/mistura-daltonico-390x844.png' });
  expect(errors).toEqual([]);
});

test('sem modo daltônico não há símbolos nas fases sem camadas ocultas', async ({ page }) => {
  await openMistura(page);
  await waitFrames(page);
  expect(await canvasData(page, 'symbols')).toBe('0');
});

test('fase alta (41) renderiza sem erros e publica diagnóstico', async ({ page }) => {
  const errors = collectErrors(page);
  await seedLevel(page, 41);
  await openMistura(page);
  await waitFrames(page);
  expect(Number(await canvasData(page, 'geometries'))).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/mistura-fase41-390x844.png' });
  expect(errors).toEqual([]);
});

test('entrar e sair várias vezes não faz crescer geometrias nem texturas', async ({ page }) => {
  const errors = collectErrors(page);
  await seedLevel(page, 30);
  const samples: { geometries: string; textures: string; canvases: number }[] = [];
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('card-mistura').click();
    await expect(page.locator('canvas')).toBeVisible();
    await waitFrames(page);
    samples.push({
      geometries: await canvasData(page, 'geometries'),
      textures: await canvasData(page, 'textures'),
      canvases: await page.locator('canvas').count(),
    });
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(samples.at(-1)).toEqual(samples[0]);
  expect(samples.every((s) => s.canvases === 1)).toBe(true);
  expect(errors).toEqual([]);
});
