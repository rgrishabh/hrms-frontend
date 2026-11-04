import { test, expect } from '@playwright/test';
import { forceTheme, mockApi } from './api';
import type { Screen } from './fixtures/types';
import { SCREENS } from './routes';

const OUT = process.env.SCREENSHOT_DIR ?? 'test-results/screens';
const PAGES: Screen[] = [...SCREENS, { name: 'dashboard-employee', path: '/', persona: 'employee', minRows: 0 }];

for (const width of [360, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    for (const p of PAGES) {
      test(`${p.name} ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
        await forceTheme(page, theme);
        await mockApi(page, { persona: p.persona });
        await page.goto(p.path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${OUT}/${p.name}-${width}-${theme}.png`, fullPage: width === 360 });
      });
    }
    test(`login ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
      await forceTheme(page, theme);
      await mockApi(page, { signedIn: false });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/login-${width}-${theme}.png` });
    });
  }
}
