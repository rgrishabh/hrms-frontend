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

test('a late evening becomes compensatory off: claim, manager and HR approval, days added to leave', async ({ page }) => {
  // 1. The analyst sees the long evenings attendance recorded; pay is not set up in the demo, compensatory off is.
  await login(page, 'analyst');
  await page.goto('/overtime');
  await expect(page.getByText(/Overtime cannot be taken as pay yet: Overtime pay is not set up/)).toBeVisible();
  const table = page.getByRole('table', { name: 'Overtime to claim' }).or(page.getByText('No unclaimed overtime.'));
  await expect(table).toBeVisible();
  // A long evening: the Overtime cell (5th) shows at least 4 hours.
  const days = page.getByRole('table', { name: 'Overtime to claim' }).getByRole('row').filter({ has: page.locator('td:nth-child(5)', { hasText: /^([4-9]|1\d)h \d\dm$/ }) });
  test.skip(!(await days.count()), 'every long evening in this demo data has been claimed already');
  const row = days.first();
  const date = (await row.getByRole('cell').first().innerText()).trim();
  await row.getByRole('button', { name: 'Claim' }).click();
  const form = page.getByRole('dialog', { name: `Claim overtime — ${date}` });
  await expect(form.getByRole('radio', { name: /^Pay/ })).toBeDisabled();
  await expect(form.getByRole('radio', { name: /^Compensatory off/ })).toBeChecked();
  await expect(form).toContainText(/Earns (0\.5|1) days? off/);
  await form.getByLabel('Reason').fill('Overnight acid digestion for the heavy-metals batch due to the client on Monday');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Overtime claimed; sent for approval')).toBeVisible();
  const mine = page.getByRole('table', { name: 'My overtime claims' }).getByRole('row').filter({ hasText: date });
  await expect(mine).toContainText('Pending');
  await expect(page.getByRole('table', { name: 'Overtime to claim' }).getByRole('row').filter({ hasText: date })).toHaveCount(0);

  // 2. The laboratory manager, then HR approve (the summary shows hours, never pay).
  const summary = new RegExp(`Aditya Joshi: [\\d.]+ h overtime on .* \\(compensatory off\\)`);
  await login(page, 'lab.manager');
  await approve(page, summary);
  await page.goto('/overtime');
  await page.getByRole('tab', { name: 'My team' }).click();
  await expect(page.getByRole('table', { name: 'Overtime claims' }).getByRole('row').filter({ hasText: 'Aditya Joshi' }).filter({ hasText: date }).first()).toBeVisible();
  await login(page, 'hr.head');
  await approve(page, summary);

  // 3. The analyst's claim is approved and the days are in their leave.
  await login(page, 'analyst');
  await page.goto('/overtime');
  await expect(mine).toContainText('Approved');
  await expect(mine).toContainText(/days? added to leave/);
  await page.goto('/leave');
  await expect(page.getByText('Compensatory Off').first()).toBeVisible();
  await noErrors(page);
});
