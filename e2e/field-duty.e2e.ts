import { test, expect, type Page } from '@playwright/test';
import { login, noErrors } from './helpers';

const approve = async (page: Page, summary: RegExp) => {
  await page.goto('/approvals');
  const row = page.getByRole('row').filter({ hasText: summary });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Request (approved|pending)/)).toBeVisible();
};
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test('field duty: report on a site visit, request a trip, the manager approves, attendance shows on-duty days', async ({ page }) => {
  await login(page, 'sampler');
  await page.goto('/field-duty');
  const mine = page.getByRole('table', { name: 'My field duty' });
  await expect(mine).toBeVisible();

  // 1. The client visit from last week has no report yet.
  const unreported = mine.getByRole('row').filter({ has: page.getByRole('button', { name: 'Report', exact: true }) });
  if (await unreported.count()) {
    const row = unreported.first();
    await row.getByRole('button', { name: 'Report', exact: true }).click();
    const form = page.getByRole('dialog', { name: /^Field duty report/ });
    await form.getByLabel('Outcome').selectOption('partly_completed');
    await form.getByLabel(/What was not done/).fill('Monitoring schedule agreed; two reports to resend after correction');
    await form.getByRole('button', { name: 'Save report' }).click();
    await expect(page.getByText('Report saved')).toBeVisible();
    await expect(mine).toContainText('Partly completed');
  }

  // 2. A two-day sampling trip ahead: well clear of the demo's own field duty, and on an even offset so a rerun on the
  // same data (another minute) picks a trip that does not overlap the last one.
  const start = plus(istToday(), 20 + 2 * (Math.floor(Date.now() / 60_000) % 30));
  await page.getByRole('button', { name: 'Request field duty' }).click();
  const form = page.getByRole('dialog', { name: 'Request field duty' });
  await form.getByLabel('From', { exact: true }).fill(start);
  await form.getByLabel('To', { exact: true }).fill(plus(start, 1));
  await expect(form.getByLabel(/^Day/)).toBeDisabled();             // half days are for a single date
  await form.getByLabel('Purpose').selectOption('field_sampling');
  await form.getByLabel(/^Place/).fill('Lote Parshuram MIDC — CETP inlet');
  await form.getByLabel(/^Client/).fill('Lote CETP Co-op Society');
  await form.getByLabel(/^Work order/).fill('WO-E2E');
  await form.getByLabel('Reason').fill('24-hour composite sampling at the CETP inlet and outlet');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Field duty requested; sent for approval')).toBeVisible();
  const trip = mine.getByRole('row').filter({ hasText: 'Lote Parshuram MIDC' }).first();
  await expect(trip).toContainText('Pending');

  // 3. The manager approves (the summary names the place, not just "field duty").
  await login(page, 'director');
  await approve(page, /Pooja Yadav: field sampling at Lote Parshuram MIDC/);

  // 4. Approved for the sampler; their attendance shows the past site days as on duty.
  await login(page, 'sampler');
  await page.goto('/field-duty');
  await expect(trip).toContainText('Approved');
  await expect(trip.getByRole('button', { name: 'Cancel' })).toBeVisible();   // not started: the employee may still cancel
  await page.goto('/attendance/me');
  let days = page.getByRole('button', { name: /On field duty$/ });
  if (!(await days.count())) { await page.getByRole('button', { name: 'Previous month' }).click(); days = page.getByRole('button', { name: /On field duty$/ }); }
  await expect(days.first()).toBeVisible();
  await days.first().click();
  await expect(page.locator('.stat').filter({ hasText: /^Field duty/ })).toContainText(/full day|half day/);
  await noErrors(page);
});

test('HR sees who is out on field duty and can record it for an employee', async ({ page }) => {
  await login(page, 'hr.head');
  await page.goto('/field-duty');
  await page.getByRole('tab', { name: 'Everyone' }).click();
  await expect(page.getByRole('table', { name: 'Field duty' })).toContainText('Sample Collection');
  await page.getByRole('button', { name: 'Record field duty' }).click();
  const form = page.getByRole('dialog', { name: 'Record field duty for an employee' });
  await expect(form.getByRole('combobox').first()).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await noErrors(page);
});
