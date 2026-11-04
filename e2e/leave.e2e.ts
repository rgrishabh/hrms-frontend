import { test, expect, type Page } from '@playwright/test';
import { login, noErrors } from './helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** A future weekday in the current leave year on which the signed-in employee has no leave yet (re-runnable). */
async function freeWeekday(page: Page): Promise<string> {
  const bal = await (await page.request.get('/api/v1/leave/balances')).json();
  const mine = await (await page.request.get('/api/v1/leave/requests?scope=mine&pageSize=100')).json();
  const taken = (d: string) => mine.items.some((r: { status: string; start_date: string; end_date: string }) =>
    ['pending', 'approved'].includes(r.status) && r.start_date.slice(0, 10) <= d && r.end_date.slice(0, 10) >= d);
  const today = iso(new Date());
  const out: string[] = [];
  for (let d = plus(today, 3); d <= bal.period.end.slice(0, 10) && out.length < 40; d = plus(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd >= 1 && wd <= 5 && !taken(d)) out.push(d);
  }
  test.skip(!out.length, 'No free weekday left in this leave year');
  return out[Math.floor(Math.random() * out.length)]!;
}

const clAvailable = async (page: Page) => Number(await page.locator('.card.stat', { hasText: 'Casual Leave' }).locator('.v').innerText());

test('an employee applies for leave, the manager approves it, and cancelling returns the day', async ({ page }) => {
  // 1. The analyst applies for one day of casual leave.
  await login(page, 'analyst');
  await page.goto('/leave');
  const date = await freeWeekday(page);
  const before = await clAvailable(page);
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for leave' });
  const cl = await form.getByLabel('Leave type').locator('option', { hasText: /^Casual Leave/ }).getAttribute('value');
  await form.getByLabel('Leave type').selectOption(cl!);
  await form.getByLabel('From').fill(date);
  await form.getByLabel('To').fill(date);
  await expect(form.getByText('1 day(s)')).toBeVisible();
  await form.getByLabel('Reason').fill('Family function (E2E)');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Leave requested: 1 day(s). Sent for approval.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Family function (E2E)' }).filter({ hasText: 'Pending' }).first();
  await expect(row).toBeVisible();

  // 2. Their reporting manager approves it from the approvals inbox.
  await login(page, 'lab.manager');
  await page.goto('/approvals');
  const req = page.getByRole('row').filter({ hasText: `Casual Leave: 1.0 day(s), ${date}` });
  await expect(req).toHaveCount(1);
  await req.getByRole('button', { name: 'Approve' }).click();
  const dlg = page.getByRole('dialog', { name: 'Approve request' });
  await dlg.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: `Casual Leave: 1.0 day(s), ${date}` })).toHaveCount(0);

  // 3. The employee sees it approved and one day fewer, also on the dashboard.
  await login(page, 'analyst');
  await page.goto('/leave');
  const approved = page.getByRole('row').filter({ hasText: 'Family function (E2E)' }).filter({ hasText: 'Approved' }).first();
  await expect(approved).toBeVisible();
  await expect.poll(() => clAvailable(page)).toBe(before - 1);
  await page.goto('/');
  await expect(page.locator('[data-tile="leave_CL"] .v')).toHaveText(String(before - 1));

  // 4. Cancelling a future approved leave returns the day.
  await page.goto('/leave');
  await approved.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Cancel leave' }).getByRole('button', { name: 'Cancel leave' }).click();
  await expect(page.getByText('Leave cancelled')).toBeVisible();
  await expect.poll(() => clAvailable(page)).toBe(before);
  await noErrors(page);
});

test('a manager\'s own leave goes to their manager, who must give a reason to return it', async ({ page }) => {
  await login(page, 'lab.manager');
  await page.goto('/leave');
  const date = await freeWeekday(page);
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for leave' });
  await form.getByLabel('From').fill(date);
  await form.getByLabel('To').fill(date);
  await form.getByLabel('Reason').fill('Own request (E2E)');
  await expect(form.getByText(/day\(s\)/)).toBeVisible();
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/Leave requested/)).toBeVisible();

  // It never lands in their own inbox: it goes to their reporting manager (the director).
  await page.goto('/approvals');
  await expect(page.getByRole('row').filter({ hasText: date })).toHaveCount(0);

  // The director returns it; a comment is required.
  await login(page, 'director');
  await page.goto('/approvals');
  const req = page.getByRole('row').filter({ hasText: date }).filter({ hasText: 'Meera Nair' });
  await req.getByRole('button', { name: 'Return' }).click();
  const dlg = page.getByRole('dialog', { name: 'Return request' });
  const send = dlg.getByRole('button', { name: 'Return for correction' });
  await expect(send).toBeDisabled();
  await dlg.getByLabel('Comment (required)').fill('Please pick another week — audit visit.');
  await send.click();
  await expect(page.getByText(/Request returned/)).toBeVisible();

  // The manager sees it returned with the reason in its history.
  await login(page, 'lab.manager');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: 'My requests' }).click();
  const mine = page.getByRole('row').filter({ hasText: date }).first();
  await expect(mine).toContainText('Returned');
  await mine.getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Approval history' })).toContainText('Please pick another week — audit visit.');
  await noErrors(page);
});
