import { test, expect } from '@playwright/test';
import { forceTheme, mockApi } from './api';

/**
 * Key screens against fixed fixtures and a fixed clock. These use the mocked API, not the real one, because demo data is
 * built from today's date and would change every baseline every day. Update with: npm run e2e:visual -- --update-snapshots
 */
const NOW = new Date('2026-11-05T10:30:00+05:30');
const SCREENS = [
  { name: 'signin', path: '/', signedOut: true },
  { name: 'dashboard', path: '/', persona: 'hr' },
  { name: 'employees', path: '/employees', persona: 'hr' },
  { name: 'leave', path: '/leave', persona: 'employee' },
  { name: 'payslips', path: '/payslips', persona: 'employee' },
  { name: 'approvals', path: '/approvals', persona: 'hr' },
  { name: 'account', path: '/account', persona: 'employee' },
] as const;

for (const width of [360, 1440]) {
  for (const s of SCREENS) {
    test(`visual ${s.name} ${width}`, async ({ page }) => {
      test.skip(!process.env.E2E_TODAY, 'Set E2E_TODAY, as npm run e2e:visual does: fixtures depend on it');
      await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
      await page.clock.setFixedTime(NOW);
      await forceTheme(page, 'light');
      await mockApi(page, { persona: 'persona' in s ? s.persona : 'employee' });
      if ('signedOut' in s) await page.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Sign in', status: 401 }) }));
      await page.goto(s.path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${s.name}-${width}.png`, { fullPage: true });
    });
  }
}
