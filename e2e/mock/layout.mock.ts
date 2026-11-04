import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './api';
import { SCREENS } from './routes';

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Interactive elements smaller than 44px; inline text links are exempt under WCAG 2.5.8. */
const tooSmall = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a.btn, a.bottom-nav__item, a.side__link, select, input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="tab"]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.table-scroll thead'); })
  .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 43.5 || (r.width < 43.5 && !el.classList.contains('btn--link')); })
  .map((el) => `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label')}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));

/** Anything drawn past the right edge, unless it sits in something that scrolls on purpose. */
const overflowing = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main *')]
  .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && el.getBoundingClientRect().width > 0 && !el.closest('.table-scroll, .tabs-bar, .scroll-x, .visually-hidden'))
  .slice(0, 5).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`));

const recordRows = (page: Page) => page.locator('.table-card, .table tbody tr, [data-record]').count();

for (const width of [360, 390, 768]) {
  for (const s of SCREENS) {
    test(`no horizontal scroll at ${width}: ${s.path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await mockApi(page, { persona: s.persona });
      await page.goto(s.path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
      expect(await overflowing(page)).toEqual([]);
      if (s.minRows !== 0) expect(await recordRows(page), 'the mock must show real rows').toBeGreaterThanOrEqual(s.minRows ?? 1);
    });
  }
}

for (const s of SCREENS) {
  test(`phone at 360, cards and 44px targets: ${s.path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await mockApi(page, { persona: s.persona });
    await page.goto(s.path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await tooSmall(page)).toEqual([]);
    await expect(page.locator('main table:not(.pay-lines__table)')).toHaveCount(0);
  });
}

test.describe('phone shell', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('bottom nav has the five tasks, and the drawer can be dismissed without navigating', async ({ page }) => {
    await mockApi(page, { persona: 'employee' });
    await page.goto('/');
    const bottom = page.getByLabel('Quick navigation');
    await expect(bottom.getByRole('link')).toHaveText(['Home', 'Attendance', 'Leave', 'Payslips', 'Profile']);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByLabel('Main navigation');
    await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.mouse.click(350, 400);
    await expect(nav).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await nav.getByRole('link', { name: 'Leave', exact: true }).click();
    await expect(nav).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();
  });
  test('tables are cards with reachable actions, and dialogs are full screen', async ({ page }) => {
    await mockApi(page, { persona: 'manager' });
    await page.goto('/approvals');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('list', { name: 'Awaiting my approval' }).getByRole('button', { name: 'Approve' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Approve request' });
    await expect.poll(async () => { const b = await dialog.boundingBox(); return [b?.x, b?.y, b?.width, b?.height]; }).toEqual([0, 0, 360, 780]); // settles after the entry animation
  });
});

test.describe('desktop shell', () => {
  test('Ctrl+K opens the palette, finds a page and goes there; only reachable pages are listed', async ({ page }) => {
    await mockApi(page, { persona: 'employee' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search pages and actions' });
    await expect(input).toBeFocused();
    await input.fill('payroll');
    await expect(page.getByRole('option')).toHaveCount(0);
    await input.fill('leave');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();
    await expect(page).toHaveTitle('Leave · Example HRMS');
  });
  test('the role switcher lists only held views and changes the menu', async ({ page }) => {
    await mockApi(page, { persona: 'manager' });
    await page.goto('/');
    const sw = page.getByLabel('Switch view');
    await expect(sw.locator('option')).toHaveText(['Manager', 'Employee']);
    const nav = page.getByLabel('Main navigation');
    await expect(nav.getByRole('link', { name: 'Team attendance', exact: true })).toBeVisible();
    await sw.selectOption('employee');
    await expect(nav.getByRole('link', { name: 'Team attendance', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Payslips', exact: true })).toBeVisible();
  });
  test('an employee gets no role switcher', async ({ page }) => {
    await mockApi(page, { persona: 'employee' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel('Switch view')).toHaveCount(0);
  });
  test('the notification centre lists items and links to the full page', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Notifications, 3 unread' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toContainText('Casual Leave approved');
    await panel.getByRole('link', { name: 'View all' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  });
});
