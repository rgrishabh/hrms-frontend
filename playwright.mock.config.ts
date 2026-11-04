import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests that need no backend: the production build under `vite preview` (same strict CSP as
 * nginx) with API routes mocked. They cover what jsdom cannot see: real layout, contrast, CSP, lazy
 * chunks and the service worker. The specs in e2e/*.e2e.ts remain the full-stack suite.
 */
export default defineConfig({
  testDir: './e2e/mock',
  testMatch: /.*\.mock\.ts$/,
  fullyParallel: true,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, stdout: 'ignore' },
});
