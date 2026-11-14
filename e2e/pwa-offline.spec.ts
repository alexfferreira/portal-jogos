import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
// @ts-expect-error módulo .mjs sem tipos (script compartilhado com o `pnpm serve`)
import { createBuildServer } from '../scripts/serve-build.mjs';
import {
  collectErrors,
  completeLevelWithSolver,
  openMistura,
  playMove,
  solutionFor,
} from './helpers';

const buildDir = fileURLToPath(new URL('../apps/portal/build', import.meta.url));

/** Espera o service worker ficar ativo E controlando esta página (após a primeira visita). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? 'nenhum'), {
      timeout: 20_000,
    })
    .toBe('activated');
}

/** Registra respostas com erro e requisições que falharam (offline não pode gerar nenhuma). */
function collectNetworkProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => problems.push(`FALHOU ${r.url()} (${r.failure()?.errorText})`));
  return problems;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Caminhos (sem barra inicial) que estão no Cache Storage do app. */
async function cachedPaths(page: Page): Promise<{ names: string[]; paths: string[] }> {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('recreio-precache-'));
    const paths: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const path = new URL(req.url).pathname.slice(1);
        // A entrada de metadados do worker (instante da instalação) não é um arquivo do build.
        if (path !== '__recreio-meta.json') paths.push(path);
      }
    }
    return { names, paths };
  });
}

async function visitOnline(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  await waitForServiceWorker(page);
  return page;
}

test('a primeira visita registra e ativa o service worker e pré-cacheia o build inteiro', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  await waitForServiceWorker(page);

  const scriptUrl = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL,
  );
  expect(scriptUrl).toMatch(/\/service-worker\.js$/);

  // O Cache Storage tem exatamente o que está no disco: nada faltando e nada inexistente.
  const { names, paths } = await cachedPaths(page);
  expect(names).toHaveLength(1);
  const onDisk = walk(buildDir).map((f) => relative(buildDir, f).split(sep).join('/'));
  const immutable = onDisk.filter((f) => f.startsWith('_app/immutable/'));
  expect(immutable.filter((f) => !paths.includes(f))).toEqual([]);
  expect(paths.filter((p) => !onDisk.includes(p))).toEqual([]);
  for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', '200.html']) {
    expect(paths).toContain(f);
  }
  expect(paths.some((p) => /^_app\/immutable\/workers\/logic\.worker-.*\.js$/.test(p))).toBe(true);
  const bytes = paths.reduce((sum, p) => sum + statSync(join(buildDir, p)).size, 0);
  testInfo.annotations.push({
    type: 'pré-cache',
    description: `${paths.length} arquivos, ${(bytes / 1024).toFixed(0)} KB`,
  });
  console.log(`pré-cache: ${paths.length} arquivos, ${(bytes / 1024).toFixed(0)} KB`);
  expect(errors).toEqual([]);
});

test('offline: recarrega, joga a fase 1 inteira com o Worker real e abre as configurações', async ({
  context,
}) => {
  const page = await visitOnline(context);
  const errors = collectErrors(page);
  const problems = collectNetworkProblems(page);
  const fromWorker: boolean[] = [];
  page.on('response', (r) => fromWorker.push(r.fromServiceWorker()));

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();

  // A fonte aplicada vem do cache (o Nunito é a fonte do tema).
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
  });
  expect(fonts.join(',')).toContain('Nunito');

  await openMistura(page);
  await expect
    .poll(() => page.workers().some((w) => /logic\.worker/.test(w.url())), { timeout: 15_000 })
    .toBe(true);
  await completeLevelWithSolver(page, 1);
  await expect(page.getByRole('dialog', { name: 'Fase concluída' })).toBeVisible();
  await page.screenshot({ path: 'test-results/pwa-offline-fase-concluida-390x844.png' });

  // Configurações por navegação completa (não só pelo roteador do app).
  const response = await page.goto('/configuracoes');
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await page.screenshot({ path: 'test-results/pwa-offline-configuracoes-390x844.png' });

  expect(fromWorker.length).toBeGreaterThan(0);
  expect(problems, 'nenhuma requisição pode falhar offline').toEqual([]);
  expect(errors).toEqual([]);
});

test('offline: uma aba nova abre o app, inclusive rotas profundas e desconhecidas', async ({
  context,
}) => {
  await visitOnline(context);
  await context.setOffline(true);

  const fresh = await context.newPage();
  const errors = collectErrors(fresh);
  const problems = collectNetworkProblems(fresh);

  const home = await fresh.goto('/');
  expect(home?.fromServiceWorker()).toBe(true);
  await expect(fresh.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  // Termina de carregar (fontes incluídas) antes de navegar: uma navegação aborta requisições em voo.
  await fresh.waitForLoadState('networkidle');

  const game = await fresh.goto('/jogo/mistura');
  expect(game?.fromServiceWorker()).toBe(true);
  await expect(fresh.locator('canvas')).toBeVisible();
  await expect(fresh.getByTestId('hud-level')).toHaveText('Fase 1');
  await fresh.waitForLoadState('networkidle');

  const unknown = await fresh.goto('/rota/que/nao/existe');
  expect(unknown?.ok()).toBe(true);
  expect(unknown?.fromServiceWorker()).toBe(true);
  await expect(fresh.locator('body')).not.toBeEmpty();

  expect(problems.filter((p) => !p.includes('/rota/que/nao/existe'))).toEqual([]);
  // A rota desconhecida renderiza o erro 404 do próprio app (não o do navegador).
  expect(errors.filter((e) => !/404|Not Found/i.test(e))).toEqual([]);
});

test('o progresso feito online persiste e aparece offline', async ({ context }) => {
  const page = await visitOnline(context);
  await openMistura(page);
  await completeLevelWithSolver(page, 1);
  await page
    .getByRole('dialog', { name: 'Fase concluída' })
    .getByRole('button', { name: 'Próxima fase' })
    .click();
  await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');

  await context.setOffline(true);
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByTestId('card-mistura')).toContainText('Fase 2');
  await fresh.getByTestId('card-mistura').click();
  await expect(fresh.getByTestId('hud-level')).toHaveText('Fase 2');
  // O service worker não toca nos dados do jogador.
  expect(
    await fresh.evaluate(async () => (await caches.keys()).every((n) => n.startsWith('recreio-'))),
  ).toBe(true);
});

test('manifest válido e ícones respondem 200 com o tipo certo', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/manifest\+json|application\/json/);
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: 'Recreio',
    short_name: 'Recreio',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'pt-BR',
  });
  expect(manifest.icons.map((i: { purpose?: string }) => i.purpose)).toContain('maskable');

  const base = new URL('/manifest.webmanifest', page.url());
  for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
    const r = await request.get(new URL(icon.src, base).href);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
    const [w] = icon.sizes.split('x').map(Number);
    expect((await r.body()).readUInt32BE(16)).toBe(w);
  }
  for (const [file, type] of [
    ['/apple-touch-icon.png', 'image/png'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', /icon/],
  ] as const) {
    const r = await request.get(file);
    expect(r.status(), file).toBe(200);
    expect(r.headers()['content-type']).toMatch(type);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('o app é instalável: o Chromium não reporta erros de instalabilidade', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __bip: number }).__bip = 0;
    window.addEventListener('beforeinstallprompt', () => {
      (window as unknown as { __bip: number }).__bip++;
    });
  });
  await page.goto('/');
  await waitForServiceWorker(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const result = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  expect(result.installabilityErrors).toEqual([]);
  const info = (await cdp.send('Page.getAppManifest')) as {
    errors: unknown[];
    url?: string;
    data?: string;
  };
  expect(info.errors).toEqual([]);
  // `beforeinstallprompt` costuma não disparar em headless; registramos o que aconteceu.
  console.log(
    `beforeinstallprompt disparou ${await page.evaluate(() => (window as unknown as { __bip: number }).__bip)}x`,
  );
});

test('o aviso de instalação mostra "Instalar" com o beforeinstallprompt e chama o prompt nativo', async ({
  page,
}) => {
  // O Chromium headless não dispara o evento sozinho; simulamos o que o Android/Chrome envia.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => void w.__prompted++,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  const hint = page.getByTestId('install-hint');
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: 'Instalar' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted))
    .toBe(1);
  await expect(hint).toHaveCount(0);
});

/**
 * Servidor próprio do build que, ligado `enabled`, serve uma "segunda versão" do service worker:
 * o mesmo código com outra versão (e portanto outro cache). É o que a hospedagem faria num deploy.
 * (O `context.route` do Playwright não intercepta a busca de atualização do script do worker.)
 */
const buildVersion = (
  JSON.parse(readFileSync(join(buildDir, '_app/version.json'), 'utf8')) as { version: string }
).version;

/** Chunk da rota /configuracoes (nó 3 do SvelteKit): a Mistura e o início não o carregam. */
const settingsNode = walk(buildDir)
  .map((f) => relative(buildDir, f).split(sep).join('/'))
  .find((f) => /^_app\/immutable\/nodes\/3\.[^/]+\.js$/.test(f))!;

const versionTest = test.extend<{ next: { enabled: boolean; url: string } }>({
  // eslint-disable-next-line no-empty-pattern
  next: async ({}, use) => {
    const state = { enabled: false, url: '' };
    const server = createBuildServer({
      transform(pathname, body) {
        if (!state.enabled) return undefined;
        // Na "segunda versão" o chunk da tela de configurações some do servidor (como um hash
        // antigo some num deploy real): quem ainda roda o código antigo só o acha no cache.
        if (pathname === `/${settingsNode}`) return null;
        if (pathname !== '/service-worker.js') return undefined;
        const text = body.toString('utf8');
        if (!text.includes(buildVersion)) throw new Error('versão do build não aparece no worker');
        // Troca a versão (outro nome de cache) e acrescenta um comentário: o navegador trata
        // qualquer diferença de bytes como worker novo, sem depender do formato da minificação.
        return Buffer.from(
          text
            .replaceAll(buildVersion, `${buildVersion}-next`)
            .replaceAll(settingsNode, '_app/version.json') + '\n// e2e: segunda versão\n',
        );
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await use(state);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  },
  baseURL: async ({ next }, use) => {
    await use(next.url);
  },
});

test.describe('nova versão', () => {
  async function checkForUpdate(page: Page) {
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
  }

  versionTest(
    'mostra o aviso, "Depois" dispensa e nada recarrega sozinho',
    async ({ context, next }) => {
      const page = await visitOnline(context);
      let loads = 0;
      page.on('load', () => loads++);
      await expect(page.getByTestId('update-banner')).toHaveCount(0);

      next.enabled = true;
      await checkForUpdate(page);
      const banner = page.getByTestId('update-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Nova versão disponível');
      await expect(banner.getByRole('button', { name: 'Atualizar' })).toBeVisible();
      await page.screenshot({ path: 'test-results/pwa-nova-versao-390x844.png' });

      await banner.getByRole('button', { name: 'Depois' }).click();
      await expect(banner).toHaveCount(0);
      // Espera curta de propósito: prova um NEGATIVO (nada recarrega sozinho depois de dispensar).
      await page.waitForTimeout(500);
      expect(loads).toBe(0);
    },
  );

  versionTest(
    '"Atualizar" ativa a versão nova e recarrega uma única vez',
    async ({ context, next }) => {
      const page = await visitOnline(context);
      const before = await cachedPaths(page);
      let loads = 0;
      page.on('load', () => loads++);

      next.enabled = true;
      await checkForUpdate(page);
      const banner = page.getByTestId('update-banner');
      await expect(banner).toBeVisible();
      // Antes do clique a versão antiga segue ativa e nada recarregou.
      expect(loads).toBe(0);
      expect((await cachedPaths(page)).names).toHaveLength(2);

      await banner.getByRole('button', { name: 'Atualizar' }).click();
      await expect.poll(() => loads, { timeout: 15_000 }).toBe(1);
      await expect(page.getByRole('heading', { name: 'Recreio' })).toBeVisible();
      // Espera curta de propósito: prova que NÃO houve um segundo reload.
      await page.waitForTimeout(1_000);
      expect(loads).toBe(1);

      // A página nova roda sob o worker novo; o cache da versão anterior fica até a ativação
      // seguinte (abas antigas ainda podem precisar dos chunks com hash antigo).
      await waitForServiceWorker(page);
      const after = await cachedPaths(page);
      expect(after.names).toHaveLength(2);
      expect(after.names).toContain(before.names[0]);
      await expect(page.getByTestId('update-banner')).toHaveCount(0);
    },
  );

  versionTest(
    'dentro da partida o aviso espera; ao voltar aparece; "Atualizar" recarrega uma vez e o progresso fica',
    async ({ context, next }) => {
      const page = await visitOnline(context);
      await openMistura(page);
      await completeLevelWithSolver(page, 1);
      await page
        .getByRole('dialog', { name: 'Fase concluída' })
        .getByRole('button', { name: 'Próxima fase' })
        .click();
      await expect(page.getByTestId('hud-level')).toHaveText('Fase 2');
      let loads = 0;
      page.on('load', () => loads++);

      next.enabled = true;
      await checkForUpdate(page);
      await expect
        .poll(() =>
          page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
        )
        .toBe(true);
      // O worker novo já espera, mas durante a partida o banner não aparece.
      await expect(page.getByTestId('update-banner')).toHaveCount(0);
      expect(loads).toBe(0);

      await page.goBack();
      const banner = page.getByTestId('update-banner');
      await expect(banner).toBeVisible();
      expect(loads).toBe(0);
      await banner.getByRole('button', { name: 'Atualizar' }).click();
      await expect.poll(() => loads, { timeout: 15_000 }).toBe(1);
      await expect(page.getByTestId('card-mistura')).toContainText('Fase 2');
      // Espera curta de propósito: prova que NÃO houve um segundo reload.
      await page.waitForTimeout(1_000);
      expect(loads).toBe(1);
    },
  );

  versionTest(
    'duas abas: a aba parada no portal converge sozinha, com um único reload',
    async ({ context, next }) => {
      const a = await visitOnline(context);
      const b = await visitOnline(context);
      let loadsB = 0;
      b.on('load', () => loadsB++);

      next.enabled = true;
      await checkForUpdate(a);
      await a.getByTestId('update-banner').getByRole('button', { name: 'Atualizar' }).click();
      // A aba B não pediu nada: ao trocar o worker ela recarrega uma vez (não está em partida).
      await expect.poll(() => loadsB, { timeout: 15_000 }).toBe(1);
      await expect(b.getByRole('heading', { name: 'Recreio' })).toBeVisible();
      await waitForServiceWorker(b);
      expect((await cachedPaths(b)).names).toHaveLength(2);
      // Espera curta de propósito: prova que NÃO houve um segundo reload.
      await b.waitForTimeout(1_000);
      expect(loadsB).toBe(1);
    },
  );

  versionTest(
    'duas abas: a aba em partida segue com o código antigo e só recarrega quando o jogador toca',
    async ({ context, next }) => {
      const a = await visitOnline(context);
      const b = await visitOnline(context);
      await openMistura(b);
      const errorsB = collectErrors(b);
      const problemsB = collectNetworkProblems(b);
      let loadsA = 0;
      let loadsB = 0;
      a.on('load', () => loadsA++);
      b.on('load', () => loadsB++);

      next.enabled = true;
      await checkForUpdate(a);
      await a.getByTestId('update-banner').getByRole('button', { name: 'Atualizar' }).click();
      await expect.poll(() => loadsA, { timeout: 15_000 }).toBe(1);

      // B (em partida) continua jogando: uma jogada completa, sem erro nem 404.
      await playMove(b, solutionFor(1)[0]!);
      expect(loadsB).toBe(0);

      // Ao sair da partida o aviso de recarga aparece (prova que o worker novo assumiu em B).
      await b.goBack();
      const banner = b.getByTestId('update-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('data-status', 'reload');
      await expect(banner).toContainText('Recarregue');

      // Outra tela carrega um chunk com hash ANTIGO: vem do cache da versão anterior (no servidor
      // de produção o arquivo antigo não existe mais).
      await b.getByRole('button', { name: 'Configurações' }).click();
      await expect(b.getByRole('heading', { name: 'Configurações' })).toBeVisible();
      expect(loadsB, 'nada recarregou sozinho (nem por chunk antigo faltando)').toBe(0);

      await b.getByTestId('update-banner').getByRole('button', { name: 'Recarregar' }).click();
      await expect.poll(() => loadsB, { timeout: 15_000 }).toBe(1);
      await expect(b.getByRole('heading', { name: 'Configurações' })).toBeVisible();
      await expect(b.getByTestId('update-banner')).toHaveCount(0);

      expect(problemsB).toEqual([]);
      expect(errorsB).toEqual([]);
    },
  );
});
