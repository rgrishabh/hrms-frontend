import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack browser tests. They run against the real API, worker and Postgres with the backend's
 * synthetic demo data: `e2e/full/stack.mjs` starts it all, here or in CI, never against real data.
 *   E2E_PROFILE  full (default) | off | single: which flags and mode the stack starts with.
 */
const profile = process.env.E2E_PROFILE ?? 'full';
const web = process.env.E2E_WEB_PORT ?? '4311';

export default defineConfig({
  testDir: './e2e',
  testMatch: profile === 'full' ? /(full\/.*\.full\.ts|.*\.e2e\.ts)$/ : new RegExp(`full/.*\\.${profile}\\.ts$`),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/full.json' }]] : 'list',
  use: {
    baseURL: `http://localhost:${web}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'node e2e/full/stack.mjs up --reset', url: `http://localhost:${web}/api/v1/config/public`, reuseExistingServer: !process.env.CI, timeout: 240_000, stdout: 'pipe' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // 360px, the narrowest phone we support. Chromium so the run needs one browser.
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } } },
  ],
});
