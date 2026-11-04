import { test, expect } from '@playwright/test';
import { noErrors, settled, expectNavHidden } from '../helpers';
import { mockApi } from './api';

test('noErrors passes on a healthy page', async ({ page }) => {
  await mockApi(page);
  await page.goto('/leave');
  await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();
  await noErrors(page);
});

test('noErrors fails when a real error is on screen', async ({ page }) => {
  await mockApi(page, { fail: ['/leave/requests'] });
  await page.goto('/leave');
  await expect(page.getByRole('heading', { level: 1, name: 'Leave' })).toBeVisible();
  await settled(page);
  await expect(noErrors(page)).rejects.toThrow();
});

test('noErrors fails on a page that never rendered the shell', async ({ page }) => {
  await page.route('**/api/v1/**', (r) => r.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Unknown host', status: 404 }) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This address is not configured' })).toBeVisible();
  test.setTimeout(30_000);
  await expect(noErrors(page)).rejects.toThrow();
});

test('settled waits for a slow request, and only then passes', async ({ page }) => {
  await mockApi(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/api/v1/leave/balances', async (route) => { await gate; await route.fulfill({ json: { period: { start: '2026-01-01', end: '2026-12-31' }, items: [] } }); });
  await page.goto('/leave');
  await expect(page.getByTestId('app-main')).not.toHaveAttribute('data-inflight', '0');
  release();
  await settled(page);
});

test('hidden-menu checks reject a label that does not exist', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expectNavHidden(page, ['Payroll']);
  await expect(expectNavHidden(page, ['Recruitment setup'])).rejects.toThrow(/not a navigation label/);
});
