import { test, expect } from '@playwright/test';
import { noErrors } from '../helpers';
import { mockApi } from './api';

const problem = (status: number, title: string, extra: object = {}) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status, ...extra }) });

test('settings: a value saves, can be undone, and a refused save stays with the reason', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/settings/attendance');
  const grace = page.getByRole('spinbutton', { name: 'Grace minutes for late arrival' });
  await grace.fill('12');
  const row = page.locator('.setting-row').filter({ hasText: 'Grace minutes' });
  await page.route('**/api/v1/tenant/settings/attendance.grace', (r) => r.fulfill(problem(422, 'Must be at most 60')), { times: 1 });
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('alert')).toContainText('Must be at most 60');
  await expect(grace).toHaveValue('12');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Grace minutes for late arrival saved')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Grace minutes for late arrival restored')).toBeVisible();
});

test('settings: sections are links that survive reload, and the current one is marked', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Audit history' }).click();
  await expect(page).toHaveURL(/\/settings\/audit$/);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Audit history' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('table', { name: 'Audit history' })).toBeVisible();
  await noErrors(page);
});

test('settings: on a phone the current section is scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockApi(page, { persona: 'admin' });
  await page.goto('/settings/audit');
  await expect(page.getByRole('link', { name: 'Audit history' })).toBeInViewport({ ratio: 0.9 });
});

test('users: required fields show inline, and a failed reset stays open', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Add user' }).click();
  const add = page.getByRole('dialog', { name: 'Add user' });
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await expect(add.getByLabel('Email')).toBeFocused();
  await add.getByRole('button', { name: 'Cancel' }).click();

  await page.route('**/api/v1/tenant/users/u9', (r) => r.fulfill(problem(500, 'Could not reset')));
  await page.getByRole('row').filter({ hasText: 'Venkata' }).getByRole('button', { name: 'Manage' }).click();
  const form = page.getByRole('dialog', { name: /^Manage/ });
  await form.getByRole('button', { name: 'Reset two-factor authentication' }).click();
  const confirm = page.getByRole('dialog', { name: 'Reset two-factor authentication' });
  await confirm.getByRole('button', { name: 'Reset' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Could not reset');
  await expect(confirm).toBeVisible();
});

test('jobs: a run is queued, and a job that is not set up says why', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/tenant/jobs/leave.accrual/run', (r) => r.fulfill({ status: 202, json: { runId: 'r9', status: 'queued' } }));
  await page.route('**/api/v1/tenant/jobs/documents.expiry/run', (r) => r.fulfill(problem(409, 'Not set up', { code: 'feature_not_configured', reason: 'No mail transport is configured' })));
  await page.goto('/settings/jobs');
  await page.locator('section').filter({ hasText: 'Credits monthly leave' }).getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText('Leave accrual queued. It starts on the next worker pass.')).toBeVisible();
  await page.locator('section').filter({ hasText: 'Principal Regional' }).getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No mail transport is configured' })).toBeVisible();
});

test('roles: create from the filter without an accidental submit, and a failed delete stays open', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/settings/roles');
  await page.getByRole('button', { name: 'New role' }).click();
  const dlg = page.getByRole('dialog', { name: 'New role' });
  await dlg.getByLabel('Role name').fill('Front desk');
  await dlg.getByLabel('Filter permissions').fill('asset');
  await dlg.getByLabel('Filter permissions').press('Enter');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Create role' }).click();
  await expect(dlg.getByText('Choose at least one permission.')).toBeVisible();
  await dlg.getByRole('checkbox', { name: 'Maintain the asset register; issue and receive assets' }).check();
  await expect(dlg).toContainText('must use two-factor authentication');
  await dlg.getByRole('button', { name: 'Create role' }).click();
  await expect(page.getByText('Role "Front desk" created')).toBeVisible();

  await page.route('**/api/v1/tenant/roles/custom_long', (r) => r.fulfill(problem(409, 'Someone holds this role now')));
  await page.getByRole('row').filter({ hasText: 'Principal Regional' }).getByRole('button', { name: 'Delete' }).click();
  const del = page.getByRole('dialog', { name: /^Delete role/ });
  await del.getByRole('button', { name: 'Delete role' }).click();
  await expect(del.getByRole('alert')).toContainText('Someone holds this role now');
});

test('reports: run, rerun, sort, real download, and the row filter', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/reports/payroll_register/export.csv*', (r) => r.fulfill({ body: 'a,b', headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="register-2026-10.csv"' } }));
  let runs = 0;
  await page.route(/\/reports\/payroll_register\?/, (r) => { runs++; return r.fallback(); });
  await page.goto('/reports');
  await page.getByRole('region', { name: 'Pay and statutory compliance' }).getByRole('link', { name: 'Principal Regional' }).click();
  const table = page.getByRole('table', { name: 'Principal Regional Compliance' });
  await expect(table.locator('tfoot')).toContainText('Total');
  expect(runs).toBe(1);
  await page.getByRole('button', { name: 'Run report' }).click();
  await expect.poll(() => runs).toBe(2);
  const sort = table.getByRole('button', { name: 'Paid days' });
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(table.getByRole('columnheader', { name: 'Paid days' })).toHaveAttribute('aria-sort', 'ascending');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toBe('register-2026-10.csv');
  await page.getByRole('searchbox', { name: 'Filter rows' }).fill('no such person');
  await expect(page.getByText('No rows match this filter.')).toBeVisible();
  await noErrors(page);
});

test('reports: removing a schedule asks first, and a failure keeps both dialogs open', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.goto('/reports');
  await page.getByRole('row').filter({ hasText: 'Monthly payroll cost' }).getByRole('button', { name: 'Edit schedule' }).click();
  const form = page.getByRole('dialog', { name: 'Schedule — Monthly payroll cost' });
  await form.getByRole('button', { name: 'Remove schedule' }).click();
  await page.route('**/api/v1/reports/saved/s1/schedule', (r) => r.fulfill(problem(500, 'Could not remove')), { times: 1 });
  const confirm = page.getByRole('dialog', { name: 'Remove schedule' });
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Could not remove');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Schedule removed')).toBeVisible();
  await expect(page.getByText(/Scheduled; next run/)).toHaveCount(0);
});

test('policies: acknowledge from my list, keyboard only', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/v1/policies/versions/v1/acknowledge', (r) => r.fulfill({ json: { ok: true } }));
  await page.goto('/policies');
  await page.getByRole('button', { name: 'Code of conduct' }).focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: /Code of conduct/ });
  await expect(dlg.getByRole('button', { name: 'Acknowledge' })).toBeDisabled();
  await dlg.getByRole('checkbox').check();
  await dlg.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.getByText('acknowledgement recorded')).toBeVisible();
});

test('policies: a failed publish stays open, and details can be edited', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/policies/versions/v9/publish', (r) => r.fulfill(problem(409, 'Someone else already published')));
  await page.goto('/policies?tab=manage');
  await page.getByRole('button', { name: 'Code of conduct' }).click();
  const detail = page.getByRole('dialog', { name: /COC/ });
  await detail.getByRole('button', { name: 'Publish' }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish version' });
  await confirm.getByRole('button', { name: 'Publish' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Someone else already published');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await detail.getByRole('button', { name: 'Edit details' }).click();
  const form = page.getByRole('dialog', { name: 'Edit policy details' });
  await form.getByLabel('Title').fill('');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel('Title').fill('Conduct');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Policy saved')).toBeVisible();
});
