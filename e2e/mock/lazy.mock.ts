import { test, expect, type Page } from '@playwright/test';
import { ALL_FEATURES, mockApi } from './api';

function chunkRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => { const m = /\/assets\/([A-Za-z]+)-[\w-]+\.js$/.exec(new URL(r.url()).pathname); if (m) seen.push(m[1]!); });
  return seen;
}

test('feature chunks are not requested when their flag is off, even by URL', async ({ page }) => {
  const seen = chunkRequests(page);
  const features = { ...ALL_FEATURES, FEATURE_PAYROLL: false, FEATURE_PAYSLIPS: false, FEATURE_RECRUITMENT: false };
  await mockApi(page, { persona: 'hr', features });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const path of ['/payroll', '/payslips', '/recruitment']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  }
  const nav = page.getByLabel('Main navigation');
  await expect(nav.getByRole('link', { name: 'Payroll', exact: true })).toHaveCount(0);
  for (const chunk of ['Payroll', 'Payslips', 'Recruitment']) expect(seen, chunk).not.toContain(chunk);
});

test('the same chunk is requested when the flag is on, and only on visiting the page', async ({ page }) => {
  const seen = chunkRequests(page);
  await mockApi(page, { persona: 'hr' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(seen).not.toContain('Payroll');
  await page.getByLabel('Main navigation').getByRole('link', { name: 'Payroll', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Payroll' })).toBeVisible();
  expect(seen).toContain('Payroll');
  expect(seen).not.toContain('Recruitment');
});

test('sign-in downloads no page chunks and no QR library', async ({ page }) => {
  const seen = chunkRequests(page);
  await mockApi(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  for (const chunk of ['Dashboard', 'Leave', 'Payroll', 'Mfa']) expect(seen, chunk).not.toContain(chunk);
});

test('a permission-gated page shows access denied and does not load its chunk', async ({ page }) => {
  const seen = chunkRequests(page);
  await mockApi(page, { persona: 'employee' });
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeVisible();
  expect(seen).not.toContain('Payroll');
});
