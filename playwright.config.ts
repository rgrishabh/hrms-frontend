import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. They run against an installation loaded with the backend's synthetic
 * demo data (`demo` command) — locally (vite + API) or in CI — never against real data.
 *   E2E_BASE_URL   default http://localhost:5173
 *   E2E_DOMAIN     the demo logins' email domain (default example.test)
 *   E2E_PASSWORD   the demo password (from demo-credentials.txt; never commit it)
 * Privileged personas need MFA_ENFORCEMENT=off on the target (local/CI only).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
