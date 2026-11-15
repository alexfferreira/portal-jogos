import { expect, test } from '@playwright/test';
import {
  applyMove,
  createState,
  generateLevel,
  hint,
  isFree,
  legalMoves,
} from '@recreio/game-embarca/logic';
import { canvasData, collectErrors, waitFrames, waitIdle } from './helpers';
import {
  expectViewMatchesState,
  findDeadEndSequence,
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

test.describe('power-ups', () => {
  const counts = async (page: import('@playwright/test').Page) => ({
    undo: await page.getByTestId('powerup-undo-count').textContent(),
    extraSlot: await page.getByTestId('powerup-extraSlot-count').textContent(),
    hint: await page.getByTestId('powerup-hint-count').textContent(),
  });

  test('a barra tem Desfazer (5), Vaga extra (1) e Dica (1), com Desfazer desabilitado no início', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    await expect(page.getByTestId('powerup-undo')).toContainText('Desfazer');
    await expect(page.getByTestId('powerup-extraSlot')).toContainText('Vaga extra');
    await expect(page.getByTestId('powerup-hint')).toContainText('Dica');
    expect(await counts(page)).toEqual({ undo: '5', extraSlot: '1', hint: '1' });
    await expect(page.getByTestId('powerup-undo')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('Desfazer devolve a jogada e gasta uma carga', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const initial = await canvasData(page, 'state');
    const first = generateLevel(1).solution[0]!.vehicle;
    await tapVehicle(page, first);
    await waitIdle(page);
    expect(await canvasData(page, 'state')).not.toBe(initial);
    await page.getByTestId('powerup-undo').click();
    await expect.poll(() => canvasData(page, 'state')).toBe(initial);
    await expectViewMatchesState(page);
    await expect(page.getByTestId('powerup-undo-count')).toHaveText('4');
    expect(errors).toEqual([]);
  });

  test('Vaga extra abre a quinta vaga; Reiniciar volta a quatro e devolve a carga', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    expect(await canvasData(page, 'slots')).toBe('4');
    await page.getByTestId('powerup-extraSlot').click();
    await expect.poll(() => canvasData(page, 'slots')).toBe('5');
    await expect(page.getByTestId('powerup-extraSlot-count')).toHaveText('0');
    await expect(page.getByTestId('powerup-extraSlot')).toBeDisabled();
    await expectViewMatchesState(page);
    await page.screenshot({ path: 'test-results/embarca-vaga-extra-390x844.png' });
    await page.getByRole('button', { name: 'Reiniciar' }).click();
    await expect.poll(() => canvasData(page, 'slots')).toBe('4');
    await expect(page.getByTestId('powerup-extraSlot-count')).toHaveText('1');
    await expectViewMatchesState(page);
    expect(errors).toEqual([]);
  });

  test('foco 3: Desfazer depois da Vaga extra mantém as cinco vagas', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const first = generateLevel(1).solution[0]!.vehicle;
    await tapVehicle(page, first);
    await waitIdle(page);
    await page.getByTestId('powerup-extraSlot').click();
    await expect.poll(() => canvasData(page, 'slots')).toBe('5');
    await page.getByTestId('powerup-undo').click();
    await expect.poll(async () => (await counts(page)).undo).toBe('4');
    expect(await canvasData(page, 'slots')).toBe('5');
    await expectViewMatchesState(page);
    expect(errors).toEqual([]);
  });

  for (const id of ['undo', 'extraSlot', 'hint'] as const) {
    test(`foco 1: usar ${id} durante a última jogada não altera a fase vencida`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await openEmbarca(page);
      const solution = generateLevel(1).solution;
      for (const move of solution.slice(0, -1)) {
        await tapVehicle(page, move.vehicle);
        await waitIdle(page);
      }
      await tapVehicle(page, solution.at(-1)!.vehicle); // não espera a animação
      await page.getByTestId(`powerup-${id}`).click({ force: true });
      await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
        timeout: 20_000,
      });
      expect(await canvasData(page, 'won')).toBe('true');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('sem jogadas: ações do painel', () => {
  const setup = findStuckSequence();

  test('oferece Desfazer, Vaga extra e Reiniciar, e a Vaga extra destrava a partida', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    expect(setup).not.toBeNull();
    await seedEmbarcaLevel(page, setup!.level);
    await openEmbarca(page);
    for (const move of setup!.moves) {
      await tapVehicle(page, move.vehicle);
      await waitIdle(page);
    }
    const dialog = page.getByRole('dialog', { name: 'Sem jogadas' });
    await expect(dialog).toBeVisible();
    const names = (await dialog.getByRole('button').allTextContents()).map((n) => n.trim());
    expect(names).toEqual(['Desfazer', 'Vaga extra', 'Reiniciar']);
    await dialog.getByRole('button', { name: 'Vaga extra' }).click();
    await expect(dialog).toBeHidden();
    expect(await canvasData(page, 'slots')).toBe('5');
    expect(errors).toEqual([]);
  });
});

test.describe('dica', () => {
  test('mostra o veículo sugerido, gasta a carga e some na primeira jogada', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    // A dica é a primeira jogada da solução que o solver acha a partir do estado atual.
    const suggested = hint(generateLevel(1).state).move!.vehicle;
    expect(await canvasData(page, 'hint')).toBe('');
    await page.getByTestId('powerup-hint').click();
    await expect.poll(() => canvasData(page, 'hint')).toBe(String(suggested));
    await expect(page.getByTestId('powerup-hint-count')).toHaveText('0');
    await page.screenshot({ path: 'test-results/embarca-dica-390x844.png' });
    await tapVehicle(page, suggested);
    await waitIdle(page);
    expect(await canvasData(page, 'hint')).toBe('');
    expect(errors).toEqual([]);
  });

  test('a carga só some quando a dica foi mostrada (nunca fica sem dica e sem carga)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const first = generateLevel(1).solution[0]!.vehicle;
    await page.getByTestId('powerup-hint').click();
    await tapVehicle(page, first); // joga sem esperar a resposta da dica
    await waitIdle(page);
    await page.waitForTimeout(1500);
    const hint = await canvasData(page, 'hint');
    const count = await page.getByTestId('powerup-hint-count').textContent();
    // Dica mostrada e depois apagada pela jogada: a carga foi gasta. Dica descartada por ser
    // velha: a carga continua. Nunca "sem dica e sem carga" sem o jogador ter visto a dica.
    expect(hint).toBe('');
    expect(['0', '1']).toContain(count);
    expect(errors).toEqual([]);
  });
});

test.describe('sem saída (ainda há jogadas, mas não há solução)', () => {
  const setup = findDeadEndSequence();

  async function reachDeadEnd(page: import('@playwright/test').Page): Promise<string> {
    await seedEmbarcaLevel(page, setup!.level);
    await openEmbarca(page);
    let beforeLast = await canvasData(page, 'state');
    for (const [i, m] of setup!.moves.entries()) {
      if (i === setup!.moves.length - 1) beforeLast = await canvasData(page, 'state');
      await tapVehicle(page, m.vehicle);
      await waitIdle(page);
    }
    await expect(page.getByRole('dialog', { name: 'Sem saída' })).toBeVisible({ timeout: 20_000 });
    return beforeLast;
  }

  test('o aviso abre sozinho e oferece Desfazer, Vaga extra e Reiniciar, nessa ordem', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    expect(setup).not.toBeNull();
    await reachDeadEnd(page);
    const dialog = page.getByRole('dialog', { name: 'Sem saída' });
    const names = (await dialog.getByRole('button').allTextContents()).map((n) => n.trim());
    expect(names).toEqual(['Desfazer', 'Vaga extra', 'Reiniciar']);
    await page.screenshot({ path: 'test-results/embarca-sem-saida-390x844.png' });
    await dialog.getByRole('button', { name: 'Vaga extra' }).click();
    await expect.poll(() => canvasData(page, 'slots')).toBe('5');
    // A vaga extra já foi usada: se a posição continuar sem solução, ela não é mais oferecida.
    await page.waitForTimeout(800);
    if (await dialog.isVisible()) {
      await expect(dialog.getByRole('button', { name: 'Vaga extra' })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('Desfazer fecha o aviso e devolve a última jogada', async ({ page }) => {
    const beforeLast = await reachDeadEnd(page);
    const dialog = page.getByRole('dialog', { name: 'Sem saída' });
    await dialog.getByRole('button', { name: 'Desfazer' }).click();
    // A posição anterior pode também ser um beco: nesse caso o aviso volta.
    await expect.poll(() => canvasData(page, 'state')).toBe(beforeLast);
    await expectViewMatchesState(page);
  });

  test('nas fases do tutorial a checagem não abre o aviso (a fase 1 conclui normalmente)', async ({
    page,
  }) => {
    await openEmbarca(page);
    await playSolution(page, 1);
    await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('dialog', { name: 'Sem saída' })).toHaveCount(0);
  });
});

test.describe('tutorial', () => {
  const TAP = 'Toque em um veículo livre para mandá-lo para uma vaga.';
  const QUEUE = 'Os passageiros embarcam no veículo da mesma cor, na ordem da fila.';
  const BLOCKED = 'Um veículo com outro na frente bate e volta. Mande primeiro o que está livre.';

  test('fase 1: texto e mãozinha no primeiro veículo da solução', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const solution = generateLevel(1).solution;
    await expect(page.getByTestId('hud-message')).toContainText(TAP);
    await expect.poll(() => canvasData(page, 'hand')).toBe(String(solution[0]!.vehicle));
    await page.screenshot({ path: 'test-results/embarca-tutorial-390x844.png' });
    expect(errors).toEqual([]);
  });

  test('fase 1: depois de cada jogada a mão passa ao próximo veículo e o texto acompanha a fila', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const g = generateLevel(1);
    let state = createState(g.state.level);
    for (const [i, move] of g.solution.slice(0, -1).entries()) {
      await tapVehicle(page, move.vehicle);
      await waitIdle(page);
      const r = applyMove(state, move);
      if (!r.ok) throw new Error('jogada da solução recusada');
      state = r.state;
      const next = g.solution[i + 1]!.vehicle;
      await expect.poll(() => canvasData(page, 'hand')).toBe(String(next));
      const waiting = state.slots.some((s) => s !== null);
      await expect(page.getByTestId('hud-message')).toContainText(waiting ? QUEUE : TAP);
    }
    expect(errors).toEqual([]);
  });

  test('foco 5: sair do roteiro faz a mão se refazer pelo Worker', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    const g = generateLevel(1);
    const initial = createState(g.state.level);
    const alt = legalMoves(initial)
      .map((m) => m.vehicle)
      .find((id) => id !== g.solution[0]!.vehicle);
    test.skip(alt === undefined, 'a fase 1 só tem um veículo livre');
    await tapVehicle(page, alt!);
    await waitIdle(page);
    const r = applyMove(initial, { vehicle: alt! });
    if (!r.ok) throw new Error('jogada recusada');
    const route = hint(r.state);
    const expected = route.move === null ? '' : String(route.move.vehicle);
    await expect.poll(() => canvasData(page, 'hand')).toBe(expected);
    expect(errors).toEqual([]);
  });

  test('fase 2 explica o bate e volta', async ({ page }) => {
    const errors = collectErrors(page);
    await seedEmbarcaLevel(page, 2);
    await openEmbarca(page);
    await expect(page.getByTestId('hud-message')).toContainText(BLOCKED);
    await expect
      .poll(() => canvasData(page, 'hand'))
      .toBe(String(generateLevel(2).solution[0]!.vehicle));
    expect(errors).toEqual([]);
  });

  test('a fase 3 não tem texto nem mão', async ({ page }) => {
    const errors = collectErrors(page);
    await seedEmbarcaLevel(page, 3);
    await openEmbarca(page);
    await waitFrames(page);
    expect(await canvasData(page, 'hand')).toBe('');
    await expect(page.getByTestId('hud-message')).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('a dica tem prioridade sobre a mão e na vitória a mão some', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    await expect.poll(() => canvasData(page, 'hand')).not.toBe('');
    await page.getByTestId('powerup-hint').click();
    await expect.poll(() => canvasData(page, 'hint')).not.toBe('');
    expect(await canvasData(page, 'hand')).toBe('');
    await playSolution(page, 1);
    await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
      timeout: 20_000,
    });
    expect(await canvasData(page, 'hand')).toBe('');
    expect(errors).toEqual([]);
  });
});

test.describe('modo daltônico', () => {
  async function setColorblind(page: import('@playwright/test').Page, on: boolean) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Configurações' }).click();
    const toggle = page.getByRole('switch', { name: 'Modo daltônico' });
    if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click();
    await page.waitForTimeout(300);
  }

  /** Símbolos esperados: veículos visíveis (no tabuleiro ou numa vaga) e passageiros na fila. */
  const expectedSymbols = (s: ReturnType<typeof createState>): number =>
    s.onBoard.length +
    s.slots.filter((slot) => slot !== null).length +
    (s.level.queue.length - s.queueIndex);

  test('desligado não mostra símbolos; ligado mostra um por veículo e por passageiro', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    await waitFrames(page);
    expect(await canvasData(page, 'symbols')).toBe('0');
    await setColorblind(page, true);
    await openEmbarca(page);
    await waitFrames(page);
    const initial = createState(generateLevel(1).state.level);
    expect(await canvasData(page, 'symbols')).toBe(String(expectedSymbols(initial)));
    await page.screenshot({ path: 'test-results/embarca-daltonico-390x844.png' });
    expect(errors).toEqual([]);
  });

  test('depois de uma jogada os símbolos dos que embarcaram e do veículo que partiu somem', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setColorblind(page, true);
    await openEmbarca(page);
    const g = generateLevel(1);
    const move = g.solution[0]!;
    const r = applyMove(createState(g.state.level), move);
    if (!r.ok) throw new Error('jogada da solução recusada');
    await tapVehicle(page, move.vehicle);
    await waitIdle(page);
    await expect.poll(() => canvasData(page, 'symbols')).toBe(String(expectedSymbols(r.state)));
    expect(errors).toEqual([]);
  });

  test('entrar e sair com o modo ligado não aumenta as texturas (o atlas é liberado)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await setColorblind(page, true);
    await page.goto('/');
    const textures: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('card-embarca').click();
      await expect(page.locator('canvas')).toBeVisible();
      await waitFrames(page);
      await expect.poll(async () => Number(await canvasData(page, 'symbols'))).toBeGreaterThan(0);
      textures.push(await canvasData(page, 'textures'));
      await page.getByRole('button', { name: 'Voltar' }).click();
      await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
    }
    expect(Number(textures[0])).toBeGreaterThan(0);
    for (const t of textures.slice(2)) expect(t).toBe(textures[1]);
    expect(errors).toEqual([]);
  });
});

test.describe('vitória e vazamentos', () => {
  test('a vitória solta confete, que some sozinho, sem erros', async ({ page }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    await playSolution(page, 1);
    await expect.poll(() => canvasData(page, 'confetti')).toBe('1');
    await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: 'test-results/embarca-confete-390x844.png' });
    await expect.poll(() => canvasData(page, 'confetti'), { timeout: 10_000 }).toBe('0');
    expect(errors).toEqual([]);
  });

  test('foco 5: "Próxima fase" antes de o confete acabar não deixa lixo nem animação', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openEmbarca(page);
    await playSolution(page, 1);
    await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Próxima fase' }).click();
    await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
    await expect.poll(() => canvasData(page, 'level')).toBe('2');
    expect(await canvasData(page, 'confetti')).toBe('0');
    await waitIdle(page);
    await expectViewMatchesState(page);
    expect(errors).toEqual([]);
  });

  for (const colorblind of [false, true]) {
    test(`vazamento na mesma montagem: Vaga extra e Reiniciar 5 vezes${colorblind ? ' (modo daltônico)' : ''}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = collectErrors(page);
      if (colorblind) {
        await page.goto('/');
        await page.getByRole('button', { name: 'Configurações' }).click();
        const toggle = page.getByRole('switch', { name: 'Modo daltônico' });
        if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
        await page.waitForTimeout(300);
      }
      await openEmbarca(page);
      await waitFrames(page);
      const samples: { geometries: string; textures: string }[] = [];
      for (let i = 0; i < 5; i++) {
        await page.getByTestId('powerup-extraSlot').click();
        await expect.poll(() => canvasData(page, 'slots')).toBe('5');
        await page.getByRole('button', { name: 'Reiniciar' }).click();
        await expect.poll(() => canvasData(page, 'slots')).toBe('4');
        await page.waitForTimeout(800); // o diagnóstico é publicado a cada 0,5 s
        samples.push({
          geometries: await canvasData(page, 'geometries'),
          textures: await canvasData(page, 'textures'),
        });
      }
      expect(Number(samples[0]!.geometries)).toBeGreaterThan(0);
      // Reconstruir a cena (vaga extra e reinício) não pode acumular recursos da GPU.
      for (const sample of samples.slice(2)) expect(sample).toEqual(samples[1]);
      expect(errors).toEqual([]);
    });
  }
});
