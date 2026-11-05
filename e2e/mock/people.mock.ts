import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { noErrors } from '../helpers';
import { mockApi, PERSONAS } from './api';

const problem = (status: number, title: string) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status }) });

/** The admin persona plus compensation access, which offer work needs. */
async function withCompensation(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { views: [], mode: 'multi', salaryLevel: 0, user: { id: 'u1', email: 'i@example.test', displayName: 'Ishaan Verma', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: PERSONAS.admin.roles, permissions: [...PERSONAS.admin.permissions, 'recruitment.compensation'], csrfToken: 'token', organization: { id: 'o1', name: 'Example Laboratories' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } } }));
}

test('requisition: a failed Hold stays open with the reason, then succeeds on retry', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let fail = true;
  await page.route('**/api/v1/recruitment/requisitions/r1/hold', (r) => (fail ? r.fulfill(problem(409, 'Open offers block this')) : r.fulfill({ json: { ok: true } })));
  await page.goto('/recruitment?tab=requisitions');
  await page.getByRole('row').filter({ hasText: 'REQ-0001' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Hold requisition' });
  await dlg.getByLabel(/Comment/).fill('Budget freeze');
  await dlg.getByRole('button', { name: 'Put on hold' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Open offers block this');
  await expect(dlg.getByLabel(/Comment/)).toHaveValue('Budget freeze');
  fail = false;
  await dlg.getByRole('button', { name: 'Put on hold' }).click();
  await expect(page.getByText('Requisition on hold')).toBeVisible();
  await expect(dlg).toHaveCount(0);
});

test('new requisition: an empty form shows errors at the fields and sends nothing', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let posted = false;
  await page.route('**/api/v1/recruitment/requisitions', (r) => { if (r.request().method() === 'POST') posted = true; return r.fallback(); });
  await page.goto('/recruitment?tab=requisitions');
  await page.getByRole('button', { name: 'New requisition' }).click();
  const form = page.getByRole('dialog', { name: 'New job requisition' });
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(form.getByLabel('Position title')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Position title')).toBeFocused();
  expect(posted).toBe(false);
  await form.getByLabel('Position title').fill('Analyst');
  await expect(form.getByLabel('Position title')).not.toHaveAttribute('aria-invalid', 'true');
});

test('an offer can be edited, and the whole offer goes back in the PUT', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await withCompensation(page);
  let body: Record<string, unknown> = {};
  await page.route('**/api/v1/recruitment/offers/o1', (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, aboveBudget: false } }); });
  await page.goto('/recruitment?tab=requisitions&application=app1');
  await page.getByRole('button', { name: 'Edit offer' }).click();
  const form = page.getByRole('dialog', { name: 'Edit offer' });
  await expect(form.getByLabel('Branch')).toHaveValue('b1');
  await form.getByLabel(/Annual CTC/).fill('650000');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
  expect(body).toMatchObject({ annualCtc: 650000, branchId: 'b1', legalEntityId: 'l1', departmentId: 'd1', probationMonths: 6 });
});

test('a task marked done can be undone', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  const calls: string[] = [];
  await page.route('**/api/v1/lifecycle/tasks/t2/*', (r) => { calls.push(new URL(r.request().url()).pathname.split('/').pop()!); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/lifecycle?tab=tasks');
  await page.getByRole('row').filter({ hasText: 'Issue laptop' }).getByRole('button', { name: 'Mark done' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Reopened')).toBeVisible();
  expect(calls).toEqual(['done', 'reopen']);
  await noErrors(page);
});

test('an onboarding checklist can be cancelled with a reason; a failure stays open', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let fail = true;
  let reason = '';
  await page.route('**/api/v1/lifecycle/checklists/cl1/cancel', (r) => { if (fail) return r.fulfill(problem(409, 'Only open checklists can be cancelled')); reason = r.request().postDataJSON().reason; return r.fulfill({ json: { ok: true } }); });
  await page.goto('/lifecycle?tab=onboarding');
  await page.getByRole('row').filter({ hasText: 'EMP-2026' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Cancel checklist' }).click();
  const dlg = page.getByRole('dialog', { name: 'Cancel onboarding' });
  await dlg.getByLabel(/Comment/).fill('Did not join');
  await dlg.getByRole('button', { name: 'Cancel onboarding' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Only open checklists can be cancelled');
  fail = false;
  await dlg.getByRole('button', { name: 'Cancel onboarding' }).click();
  await expect(page.getByText('Checklist cancelled')).toBeVisible();
  expect(reason).toBe('Did not join');
});

test('exit interview opens with what is on file; a failed save keeps it', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/api/v1/lifecycle/separations/s1/exit-interview', (r) => r.fulfill(problem(500, 'Could not save')));
  await page.goto('/lifecycle?tab=separations');
  await page.getByRole('row').filter({ hasText: 'Contract end' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Exit interview' }).click();
  const form = page.getByRole('dialog', { name: 'Exit interview' });
  await expect(form.getByLabel('What worked well')).toHaveValue('The team');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('alert')).toContainText('Could not save');
});

test('review: the manager submits, Finalize stays hidden, and short comments are refused inline', async ({ page }) => {
  await mockApi(page, { persona: 'manager' });
  let body: Record<string, unknown> = {};
  await page.route('**/api/v1/performance/reviews/rv1/manager', (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/performance?tab=team');
  await page.getByRole('row').filter({ hasText: 'EMP-2026' }).getByRole('button').first().click();
  const dlg = page.getByRole('dialog', { name: 'Performance review' });
  await dlg.getByLabel('Overall rating').selectOption('3');
  await dlg.getByLabel('Comments').fill('Short');
  await dlg.getByRole('button', { name: 'Submit' }).click();
  await expect(dlg.getByText('Write at least 20 characters.')).toBeVisible();
  await dlg.getByLabel('Comments').fill('Reliable on delivery and quality across the year.');
  await dlg.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  expect(body).toMatchObject({ rating: 3, goalRatings: {}, expectedVersion: 3 });
  await expect(dlg.getByLabel('Final rating')).toHaveCount(0);
});

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

/** Dialogs live outside main, so the page checks do not see them. */
async function dialogIsClean(page: Page, shot: string) {
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(360);
  const wide = await dialog.evaluate((d) => [...d.querySelectorAll<HTMLElement>('*')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && el.getBoundingClientRect().width > 0 && !el.closest('.visually-hidden')).slice(0, 5).map((el) => `${el.tagName}.${el.className}`));
  expect(wide).toEqual([]);
  await expect(dialog.locator('table:not(.pay-lines__table)')).toHaveCount(0);
  const small = await dialog.evaluate((d) => [...d.querySelectorAll<HTMLElement>('button, a.btn, select, input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map((el) => `${el.tagName} ${(el.textContent ?? '').slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}`));
  expect(small).toEqual([]);
  await page.evaluate(AXE);
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: string, o: object) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe.run('[role="dialog"]', { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 160)}`));
  expect(violations).toEqual([]);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/dialog-${shot}-360.png`, fullPage: false });
}

test.describe('dialogs at 360', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('application, offer, schedule and feedback', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await withCompensation(page);
    await page.goto('/recruitment?tab=requisitions&application=app1');
    await dialogIsClean(page, 'application');
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await dialogIsClean(page, 'feedback');
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await page.getByRole('button', { name: 'Edit offer' }).click();
    await dialogIsClean(page, 'offer');
  });
  test('requisition and candidate detail', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/recruitment?tab=requisitions');
    await page.getByRole('listitem').filter({ hasText: 'REQ-0001' }).getByRole('button').first().click();
    await dialogIsClean(page, 'requisition');
    await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: 'Candidates' }).click();
    await page.getByRole('button', { name: /Venkata/ }).click();
    await dialogIsClean(page, 'candidate');
  });
  test('checklist, separation and template', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/lifecycle?tab=onboarding');
    await page.getByRole('listitem').filter({ hasText: 'EMP-2026' }).getByRole('button').first().click();
    await dialogIsClean(page, 'checklist');
    await page.goto('/lifecycle?tab=separations');
    await page.getByRole('listitem').filter({ hasText: 'Contract end' }).getByRole('button').first().click();
    await dialogIsClean(page, 'separation');
    await page.goto('/lifecycle?tab=templates');
    await page.getByRole('button', { name: /^Edit/ }).first().click();
    await dialogIsClean(page, 'template');
  });
  test('performance review', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/performance?tab=all');
    await page.getByRole('listitem').filter({ hasText: 'EMP-2026' }).getByRole('button').first().click();
    await dialogIsClean(page, 'review');
  });
});
