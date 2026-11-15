import { expect, type Page } from '@playwright/test';
import {
  applyMove,
  createState,
  generateLevel,
  hint,
  isStuck,
  isWin,
  legalMoves,
  type Move,
} from '@recreio/game-embarca/logic';
import { canvasData, waitIdle } from './helpers';

export interface VehicleBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Abre a Embarca pela tela inicial e espera o palco 3D e os retângulos dos veículos. */
export async function openEmbarca(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('card-embarca').click();
  await expect(page).toHaveURL(/\/jogo\/embarca/);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('hud-level')).toBeVisible();
  await expect
    .poll(async () => (await readVehicles(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
}

/**
 * Grava a fase atual do progresso da Embarca direto no IndexedDB (atalho de teste para abrir
 * fases altas). Deve ser chamado numa página do portal já carregada (ex.: `/`).
 */
export async function seedEmbarcaLevel(page: Page, level: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Recreio' }).waitFor();
  await page.evaluate(async (n) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('recreio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(
        { v: 1, data: { currentLevel: n, highestCompleted: n - 1, stars: {}, powerUps: {} } },
        'recreio:progress:embarca',
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, level);
}

/** Retângulos dos veículos no tabuleiro, em px do canvas (publicados pelo jogo). */
export async function readVehicles(page: Page): Promise<VehicleBox[]> {
  const raw = await page.locator('canvas').getAttribute('data-vehicles');
  return raw ? (JSON.parse(raw) as VehicleBox[]) : [];
}

/** Toca no centro do veículo `id` (com um deslocamento opcional em px). */
export async function tapVehicle(
  page: Page,
  id: number,
  offset: { dx?: number; dy?: number } = {},
): Promise<void> {
  const box = (await readVehicles(page)).find((v) => v.id === id);
  if (!box) throw new Error(`o veículo ${id} não está no tabuleiro`);
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('canvas sem caixa');
  await page.mouse.click(
    canvas.x + box.x + box.w / 2 + (offset.dx ?? 0),
    canvas.y + box.y + box.h / 2 + (offset.dy ?? 0),
  );
}

/**
 * Joga a solução plantada da fase pelo toque. Por padrão espera cada animação; com `settle`
 * falso pelo menos as `rushFrom` últimas jogadas interrompem a anterior (sem esperar).
 */
export async function playSolution(
  page: Page,
  level: number,
  opts: { rushFrom?: number } = {},
): Promise<void> {
  const solution = generateLevel(level).solution;
  const rushFrom = opts.rushFrom ?? solution.length;
  for (const [i, move] of solution.entries()) {
    await tapVehicle(page, move.vehicle);
    if (i < rushFrom) await waitIdle(page);
  }
}

/** Texto `b:..|s:..|q:..` do estado ou do visual, separado nas três partes. */
function parts(text: string): { b: string; s: string; q: string } {
  const get = (key: string) =>
    text
      .split('|')
      .find((p) => p.startsWith(`${key}:`))
      ?.slice(2) ?? '';
  return { b: get('b'), s: get('s'), q: get('q') };
}

/** O que o render mostra (`data-view`) tem de coincidir com o estado lógico (`data-state`). */
export async function expectViewMatchesState(page: Page): Promise<void> {
  await waitIdle(page);
  const state = parts(await canvasData(page, 'state'));
  const view = parts(await canvasData(page, 'view'));
  expect(view.b).toBe(state.b);
  // Vaga do estado: `veículo:ocupados` ou `-`; a do visual: só o veículo.
  expect(view.s).toBe(
    state.s
      .split(',')
      .map((slot) => slot.split(':')[0])
      .join(','),
  );
  expect(view.q).toBe(state.q.split('/')[0]);
}

export interface StuckSetup {
  level: number;
  /** Jogadas legais (a partir do início da fase) que terminam em "sem jogadas". */
  moves: Move[];
}

/**
 * Procura, de forma determinística, a sequência mais curta de jogadas legais que termina em
 * "sem jogadas" (partidas escolhidas por um sorteio congruencial fixo). Percorre as fases de
 * `from` a `to`.
 */
export function findStuckSequence(
  from = 1,
  to = 40,
  playouts = 400,
  maxMoves = 14,
): StuckSetup | null {
  let best: StuckSetup | null = null;
  for (let level = from; level <= to; level++) {
    const initial = createState(generateLevel(level).state.level);
    for (let p = 0; p < playouts; p++) {
      let state = initial;
      let r = (level * 7919 + p * 104729) | 1;
      const moves: Move[] = [];
      let deadEnd = false;
      while (moves.length < maxMoves && !isWin(state) && !isStuck(state)) {
        const options = legalMoves(state);
        r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff;
        const move = options[r % options.length] as Move;
        const result = applyMove(state, move);
        if (!result.ok) break;
        moves.push(move);
        state = result.state;
        // Nenhum passo intermediário pode ser um beco sem solução: o aviso "Sem saída" abriria
        // no meio do caminho e bloquearia os toques seguintes.
        if (!isStuck(state) && !isWin(state) && hint(state).status === 'unsolvable') {
          deadEnd = true;
          break;
        }
      }
      if (!deadEnd && isStuck(state) && (best === null || moves.length < best.moves.length)) {
        best = { level, moves };
      }
    }
    if (best !== null && best.moves.length <= 5) break;
  }
  return best;
}

/**
 * Procura, de forma determinística, a sequência mais curta de jogadas legais que termina numa
 * posição **não travada e sem solução** (ainda há jogadas, mas o solver prova que nenhuma
 * vence). Percorre as fases de `from` a `to`; as fases do tutorial (1 e 2) não checam isso.
 */
export function findDeadEndSequence(
  from = 3,
  to = 40,
  playouts = 300,
  maxMoves = 14,
): StuckSetup | null {
  let best: StuckSetup | null = null;
  for (let level = from; level <= to; level++) {
    const initial = createState(generateLevel(level).state.level);
    for (let p = 0; p < playouts; p++) {
      let state = initial;
      let r = (level * 6007 + p * 92821) | 1;
      const moves: Move[] = [];
      while (moves.length < maxMoves && !isWin(state) && !isStuck(state)) {
        const options = legalMoves(state);
        r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff;
        const move = options[r % options.length] as Move;
        const result = applyMove(state, move);
        if (!result.ok) break;
        moves.push(move);
        state = result.state;
        if (!isWin(state) && !isStuck(state) && hint(state).status === 'unsolvable') {
          if (best === null || moves.length < best.moves.length)
            best = { level, moves: [...moves] };
          break;
        }
      }
    }
    if (best !== null && best.moves.length <= 4) break;
  }
  return best;
}
