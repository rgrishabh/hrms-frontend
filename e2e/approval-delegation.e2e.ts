import { test, expect, type Page } from '@playwright/test';
import { login, noErrors } from './helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** A future weekday in this leave year with no leave yet for the signed-in employee (re-runnable). */
async function freeWeekday(page: Page): Promise<string> {
  const bal = await (await page.request.get('/api/v1/leave/balances')).json();
  const mine = await (await page.request.get('/api/v1/leave/requests?scope=mine&pageSize=100')).json();
  const taken = (d: string) => mine.items.some((r: { status: string; start_date: string; end_date: string }) =>
    ['pending', 'approved'].includes(r.status) && r.start_date.slice(0, 10) <= d && r.end_date.slice(0, 10) >= d);
  const out: string[] = [];
  for (let d = plus(iso(new Date()), 3); d <= bal.period.end.slice(0, 10) && out.length < 40; d = plus(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd >= 1 && wd <= 5 && !taken(d)) out.push(d);
  }
  test.skip(!out.length, 'No free weekday left in this leave year');
  return out[Math.floor(Math.random() * out.length)]!;
}

test("while the lab manager is away, the quality manager approves her team's leave on her behalf", async ({ page }) => {
  await login(page, 'analyst');
  await page.goto('/leave');
  const date = await freeWeekday(page);
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for leave' });
  const cl = await form.getByLabel('Leave type').locator('option', { hasText: /^Casual Leave/ }).getAttribute('value');
  await form.getByLabel('Leave type').selectOption(cl!);
  await form.getByLabel('From', { exact: true }).fill(date);
  await form.getByLabel('To', { exact: true }).fill(date);
  await form.getByLabel('Reason').fill('Delegation check (E2E)');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Leave requested: 1 day(s). Sent for approval.')).toBeVisible();

  // The demo has Meera Nair (lab manager) away, with Arjun Rao (quality) covering.
  await login(page, 'quality');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: "While I'm away" }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You approve for Meera Nair' })).toBeVisible();
  await page.getByRole('tab', { name: /Awaiting me/ }).click();
  const req = page.getByRole('row').filter({ hasText: `Casual Leave: 1.0 day(s), ${date}` });
  await expect(req).toContainText('Covering for Meera Nair');
  await req.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved')).toBeVisible();

  // The history records who decided it and for whom.
  await login(page, 'analyst');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: 'My requests' }).click();
  await page.getByRole('row').filter({ hasText: `Casual Leave: 1.0 day(s), ${date}` }).getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Approval history' })).toContainText('Arjun Rao for Meera Nair');
  await noErrors(page);
});

test('a manager hands over their approvals and ends the handover; HR sees it', async ({ page }) => {
  await login(page, 'director');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: "While I'm away" }).click();
  const mine = page.locator('[aria-label="My handover"]');
  await mine.getByRole('button', { name: 'Hand over my approvals' }).click();
  const dlg = page.getByRole('dialog', { name: 'Hand over my approvals' });
  await dlg.getByRole('combobox', { name: 'Approves instead' }).fill('Ananya');
  await dlg.getByRole('option', { name: /Ananya/ }).first().click();
  await dlg.getByLabel('Note for them (optional)').fill('Audit week (E2E)');
  await dlg.getByRole('button', { name: 'Hand over' }).click();
  await expect(page.getByText('Approvals handed to Ananya Iyer')).toBeVisible();
  await expect(mine).toContainText('Handed to Ananya Iyer');

  await login(page, 'hr.head');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: "While I'm away" }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You approve for Suresh Menon' })).toBeVisible();
  const all = page.locator('[aria-label="All handovers"]');
  await expect(all.getByRole('row').filter({ hasText: 'Audit week (E2E)' }).filter({ hasText: 'Active' })).toHaveCount(1);

  await login(page, 'director');
  await page.goto('/approvals');
  await page.getByRole('tab', { name: "While I'm away" }).click();
  await mine.getByRole('row').filter({ hasText: 'Audit week (E2E)' }).filter({ hasText: 'Active' }).getByRole('button', { name: 'End now' }).click();
  await page.getByRole('dialog', { name: 'End this handover now' }).getByRole('button', { name: 'End now' }).click();
  await expect(page.getByText('Handover ended')).toBeVisible();
  await expect(mine.getByRole('button', { name: 'Hand over my approvals' })).toBeVisible();
  await noErrors(page);
});
