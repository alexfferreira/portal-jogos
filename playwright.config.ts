import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // O WebGL de teste é por software (lento): folga para jogar fases inteiras.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // VITE_E2E=1 liga os data-* de teste do canvas; um servidor reaproveitado poderia não tê-los.
    env: { VITE_E2E: '1' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
