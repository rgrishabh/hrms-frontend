import { test, expect } from '@playwright/test';
import { forceTheme, mockApi, type Persona } from './api';

const OUT = process.env.SCREENSHOT_DIR ?? 'test-results/screens';
const PAGES: { name: string; path: string; persona: Persona }[] = [
  { name: 'dashboard-employee', path: '/', persona: 'employee' }, { name: 'dashboard-hr', path: '/', persona: 'hr' }, { name: 'attendance', path: '/attendance/me', persona: 'employee' },
  { name: 'leave', path: '/leave', persona: 'employee' }, { name: 'leave-team', path: '/leave?tab=team', persona: 'manager' }, { name: 'payslips', path: '/payslips', persona: 'employee' }, { name: 'approvals', path: '/approvals', persona: 'manager' },
  { name: 'notifications', path: '/notifications', persona: 'employee' }, { name: 'employees', path: '/employees', persona: 'hr' }, { name: 'employee', path: '/employees/e1', persona: 'hr' }, { name: 'documents', path: '/documents', persona: 'hr' },
  { name: 'profile', path: '/profile', persona: 'employee' }, { name: 'account', path: '/account', persona: 'employee' }, { name: 'legacy-payroll', path: '/payroll', persona: 'hr' },
];

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
