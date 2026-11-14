import { defineConfig, devices } from '@playwright/test';

const BUILD_PORT = 4173;
// Fora da 5173 (padrão do `pnpm dev`) para não colidir com um dev server já aberto.
const DEV_PORT = 5174;

/** Testes que também rodam contra o dev server (falhas que só existem no Vite dev, ex.: 403 do fs.allow). */
const DEV_SPECS = /worker\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // O WebGL de teste é por software (lento): folga para jogar fases inteiras.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
  },
  projects: [
    // Suíte completa contra o site estático (o que vai para a Vercel), servido por
    // scripts/serve-build.mjs: fallback SPA + 200.html, que o `vite preview` não tem.
    {
      name: 'build',
      use: { baseURL: `http://127.0.0.1:${BUILD_PORT}` },
    },
    // Só o smoke do Worker contra o dev server (o Vite dev serve arquivos de outro jeito).
    {
      name: 'dev',
      testMatch: DEV_SPECS,
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: `pnpm build && node scripts/serve-build.mjs --port ${BUILD_PORT}`,
      url: `http://127.0.0.1:${BUILD_PORT}`,
      // VITE_E2E=1 liga os data-* de teste do canvas; um servidor reaproveitado poderia não tê-los.
      env: { VITE_E2E: '1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      // Diretório gerado próprio: o build roda em paralelo e usaria o mesmo `.svelte-kit`.
      env: { VITE_E2E: '1', SVELTEKIT_OUT_DIR: '.svelte-kit-dev' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
