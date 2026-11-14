import { expect, test } from '@playwright/test';
import { canvasData, collectErrors, openMistura, seedLevel, waitFrames } from './helpers';

/** Mediana de uma lista de números. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const MB = 1024 * 1024;
/** Crescimento máximo aceito do heap JS depois do aquecimento (veja DECISIONS, marco 7). */
const MAX_HEAP_GROWTH_MB = 4;
const WARMUP = 3;
const MEASURED = 10;

test('entrar e sair da Mistura 10 vezes não vaza memória (heap, geometrias e texturas)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await seedLevel(page, 30);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  async function heapUsed(): Promise<number> {
    // Duas coletas: a primeira libera, a segunda pega o que dependia de finalizadores.
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
  }

  const heaps: number[] = [];
  const gl: { geometries: string; textures: string }[] = [];
  for (let i = 0; i < WARMUP + MEASURED; i++) {
    await page.getByTestId('card-mistura').click();
    await expect(page.locator('canvas')).toBeVisible();
    await waitFrames(page);
    gl.push({
      geometries: await canvasData(page, 'geometries'),
      textures: await canvasData(page, 'textures'),
    });
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    heaps.push(await heapUsed());
  }

  // Medianas de 3 amostras (depois do aquecimento e no fim) tiram o ruído do coletor de lixo.
  const baseline = median(heaps.slice(WARMUP, WARMUP + 3));
  const final = median(heaps.slice(-3));
  const growthMb = (final - baseline) / MB;
  console.log(
    `heap (MB) por saída: ${heaps.map((h) => (h / MB).toFixed(1)).join(' ')} | ` +
      `crescimento (mediana final - mediana pós-aquecimento): ${growthMb.toFixed(2)} MB (limite ${MAX_HEAP_GROWTH_MB} MB)`,
  );
  expect(growthMb).toBeLessThan(MAX_HEAP_GROWTH_MB);

  // O renderer não acumula recursos: depois do aquecimento (a 1ª visita pode criar texturas de
  // forma preguiçosa) toda visita tem exatamente os mesmos números da última do aquecimento.
  const settled = gl[WARMUP - 1];
  for (const sample of gl.slice(WARMUP)) expect(sample).toEqual(settled);
  expect(errors).toEqual([]);
});

test('fase 260: custo de desenho do renderer (draw calls e triângulos)', async ({ page }) => {
  await seedLevel(page, 260);
  await openMistura(page);
  await waitFrames(page);
  const calls = Number(await canvasData(page, 'calls'));
  const triangles = Number(await canvasData(page, 'triangles'));
  const geometries = Number(await canvasData(page, 'geometries'));
  const textures = Number(await canvasData(page, 'textures'));
  // O fps deste runner é por software e NÃO representa um celular; só registramos o custo.
  console.log(
    `fase 260: ${calls} chamadas de desenho, ${triangles} triângulos, ${geometries} geometrias, ${textures} texturas, fps do runner ${await canvasData(page, 'fps')} (software)`,
  );
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(250);
  expect(triangles).toBeLessThan(80_000);
});
