import { test, expect } from '@playwright/test';
import { signedIn } from './helpers';

test('single mode: no Roles section, /tenant/roles is 404, users still load, and no Manager view', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await signedIn(page, 'admin');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByLabel('Main navigation')).toBeVisible();
  const views = page.getByLabel('Switch view');
  if (await views.count()) await expect(views.locator('option', { hasText: 'Manager' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect((await page.request.get('/api/v1/tenant/roles')).status()).toBe(404);
  failed.length = 0;
  await page.goto('/settings/users');
  await expect(page.getByRole('table', { name: 'Users' }).or(page.getByRole('list', { name: 'Users' }))).toBeVisible();
  await expect(page.getByRole('link', { name: 'Roles', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('dialog', { name: 'Add user' }).getByRole('checkbox', { name: 'Employee' })).toBeVisible();
  expect(failed).toEqual([]);
});
