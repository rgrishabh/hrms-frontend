import { test, expect } from '@playwright/test';
import { noErrors } from '../helpers';
import { mockApi } from './api';

test('apply for leave: the preview gates the button, and the same toast the full-stack spec expects appears', async ({ page }) => {
  await mockApi(page);
  let body: { reason?: string } = {};
  await page.route('**/api/v1/leave/requests', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    body = route.request().postDataJSON();
    return route.fulfill({ json: { days: 1 } });
  });
  await page.goto('/leave');
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for leave' });
  await form.getByLabel('Leave type').selectOption('cl');
  await form.getByLabel('Reason').fill('Family function');
  await expect(form.getByText('1 day(s)')).toBeVisible();
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Leave requested: 1 day(s). Sent for approval.')).toBeVisible();
  await expect(form).toHaveCount(0);
  expect(body.reason).toBe('Family function');
  await noErrors(page);
});

test('approve from the inbox: a row keeps real table semantics', async ({ page }) => {
  await mockApi(page, { persona: 'manager' });
  await page.route('**/api/v1/approvals/a1/act', (r) => r.fulfill({ json: { status: 'approved' } }));
  await page.goto('/approvals');
  const row = page.getByRole('row').filter({ hasText: 'Casual Leave: 1.0 day(s)' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved')).toBeVisible();
});

test('a tab survives reload, and the approval history shows steps', async ({ page }) => {
  await mockApi(page, { persona: 'manager' });
  await page.goto('/approvals');
  await page.getByRole('tab', { name: 'My requests' }).click();
  await expect(page).toHaveURL(/tab=mine/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'My requests' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Earned Leave: 3.0 day(s)' }).click();
  const detail = page.getByRole('dialog', { name: 'Approval history' });
  await expect(detail.getByRole('list', { name: 'Approval steps' })).toContainText('Meera Nair');
});

test('payslip amounts are masked until revealed, and the slip opens', async ({ page }) => {
  await mockApi(page);
  await page.goto('/payslips');
  const row = page.getByRole('row').filter({ hasText: '2026-10' });
  await expect(row).toContainText('••••••');
  await expect(row).not.toContainText('78,270');
  await row.getByRole('button', { name: 'Show Net pay for 2026-10' }).click();
  await expect(row).toContainText('78,270');
  await row.getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('dialog', { name: 'Payslip 2026-10' })).toContainText('Provident fund');
});

test('employee search reaches the server after a pause, and filters reset the page', async ({ page }) => {
  await mockApi(page, { persona: 'hr' });
  const urls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/employees?')) urls.push(r.url()); });
  await page.goto('/employees');
  await page.getByRole('searchbox', { name: 'Search employees' }).pressSequentially('asha', { delay: 20 });
  await expect.poll(() => urls.some((u) => u.includes('search=asha'))).toBe(true);
  expect(urls.filter((u) => /search=a(&|$)/.test(u))).toEqual([]);
  await page.getByLabel('Branch').selectOption('b1');
  await expect.poll(() => urls.some((u) => u.includes('branchId=b1'))).toBe(true);
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('link', { name: 'Asha Rao' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asha Rao' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Employees');
  await noErrors(page);
});

test('a failed load shows the reason and retry works', async ({ page }) => {
  let fail = true;
  await mockApi(page);
  await page.route('**/api/v1/payroll/payslips/mine', (r) => (fail
    ? r.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Payroll is down', status: 500 }) })
    : r.fulfill({ json: { items: [] } })));
  await page.goto('/payslips');
  await expect(page.getByRole('alert')).toContainText('Payroll is down', { timeout: 15_000 });
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No payslips yet')).toBeVisible();
});
