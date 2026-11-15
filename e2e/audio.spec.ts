import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openMistura, playMove, solutionFor, tapTube } from './helpers';

/** Conta os osciladores iniciados e guarda o estado do AudioContext (prova que o som é gerado). */
async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { ctxs: [] as AudioContext[], oscStarts: 0 };
    (window as unknown as { __audio: typeof log }).__audio = log;
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        log.ctxs.push(this);
        const create = this.createOscillator.bind(this);
        this.createOscillator = () => {
          const osc = create();
          const start = osc.start.bind(osc);
          osc.start = (...a: Parameters<OscillatorNode['start']>) => {
            log.oscStarts++;
            return start(...a);
          };
          return osc;
        };
      }
    };
  });
}

const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as { __audio: { ctxs: AudioContext[]; oscStarts: number } })
      .__audio;
    return { state: a.ctxs[0]?.state ?? 'none', oscillators: a.oscStarts };
  });

test('o jogo toca sons: seleção e despejo geram osciladores com o contexto "running"', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await instrumentAudio(page);
  await openMistura(page);

  const move = solutionFor(1)[0]!;
  const before = await audioState(page);
  await tapTube(page, move.from);
  await expect
    .poll(async () => (await audioState(page)).oscillators)
    .toBeGreaterThan(before.oscillators);
  const afterSelect = await audioState(page);
  expect(afterSelect.state).toBe('running');

  await tapTube(page, move.to);
  // O despejo toca o som "pour" (3 tons) além do clique.
  await expect
    .poll(async () => (await audioState(page)).oscillators)
    .toBeGreaterThanOrEqual(afterSelect.oscillators + 3);
  expect(errors).toEqual([]);
});

test('jogada seguida de outra continua tocando (o contexto não fica preso)', async ({ page }) => {
  await instrumentAudio(page);
  await openMistura(page);
  const moves = solutionFor(1);
  await playMove(page, moves[0]!);
  const mid = await audioState(page);
  await playMove(page, moves[1]!);
  await expect
    .poll(async () => (await audioState(page)).oscillators)
    .toBeGreaterThan(mid.oscillators);
});

test('Configurações: "Testar som" toca e informa o estado', async ({ page }) => {
  await instrumentAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Testar som' }).click();
  await expect(page.getByTestId('sound-test')).toContainText('O som tocou');
  const s = await audioState(page);
  expect(s.state).toBe('running');
  expect(s.oscillators).toBeGreaterThan(0);
});
