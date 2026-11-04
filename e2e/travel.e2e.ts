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

test('travel with an advance: manager and finance approve, finance pays the advance', async ({ page }) => {
  // A trip on an even offset well ahead, so a rerun on the same data does not overlap the previous one.
  const start = plus(istToday(), 31 + 2 * (Math.floor(Date.now() / 60_000) % 25));
  await login(page, 'sampler');
  await page.goto('/travel');
  await page.getByRole('button', { name: 'Request travel' }).click();
  const form = page.getByRole('dialog', { name: 'Request travel' });
  await form.getByLabel('Purpose').fill('Groundwater sampling for the Kolhapur MIDC baseline study');
  await form.getByLabel('From (city)').fill('Navi Mumbai');
  await form.getByLabel('Destination').fill('Kolhapur — Shiroli MIDC');
  await form.getByLabel(/^Start/).fill(start);
  await form.getByLabel(/^Return/).fill(plus(start, 1));
  await form.getByLabel('Mode').selectOption('bus');
  await form.getByLabel('Tickets / fuel').fill('1800');
  await form.getByLabel('Stay').fill('2400');
  await form.getByLabel('Meals').fill('800');
  await expect(form).toContainText('Total ₹5,000.00');
  await form.getByLabel(/^Advance needed/).fill('3000');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Travel requested; sent for approval')).toBeVisible();
  const trip = page.getByRole('table', { name: 'My trips' }).getByRole('row').filter({ hasText: 'Kolhapur — Shiroli MIDC' }).first();
  await expect(trip).toContainText('Pending');

  const summary = /Pooja Yadav: Navi Mumbai → Kolhapur — Shiroli MIDC, .* advance ₹3000\.00/;
  await login(page, 'director');
  await approve(page, summary);
  await login(page, 'finance');
  await approve(page, summary);

  // Payroll (expenses.pay) pays the advance.
  await login(page, 'payroll');
  await page.goto('/travel');
  await page.getByRole('tab', { name: 'Everyone' }).click();
  await page.getByLabel('Advance').selectOption('to_pay');
  const row = page.getByRole('table', { name: 'Trips' }).getByRole('row').filter({ hasText: 'Kolhapur — Shiroli MIDC' }).first();
  await row.getByRole('button', { name: 'Pay advance' }).click();
  const payForm = page.getByRole('dialog', { name: 'Pay travel advance' });
  await payForm.getByLabel(/^Payment reference/).fill('NEFT-E2E-001');
  await payForm.getByRole('button', { name: 'Record as paid' }).click();
  await expect(page.getByText('Advance recorded as paid')).toBeVisible();

  await login(page, 'sampler');
  await page.goto('/travel');
  await expect(trip).toContainText('Approved');
  await expect(trip).toContainText('Paid · NEFT-E2E-001');
  await noErrors(page);
});

test('the claim for a completed trip opens in Expenses, linked to the trip and its advance', async ({ page }) => {
  await login(page, 'analyst');
  await page.goto('/travel');
  const trip = page.getByRole('table', { name: 'My trips' }).getByRole('row').filter({ hasText: 'NABL regional office' }).first();
  await trip.getByRole('button', { name: 'Details' }).click();
  const detail = page.getByRole('dialog', { name: /^Trip — Pune → Mumbai/ });
  await expect(detail.locator('.tile').filter({ hasText: 'Advance outstanding' })).toContainText('₹1,500.00');
  await detail.getByRole('button', { name: 'Close' }).click();
  await trip.getByRole('button', { name: 'Claim expenses' }).click();
  await expect(page).toHaveURL(/\/expenses\?tab=mine&claim=/);
  await expect(page.getByRole('dialog').getByText(/Claim for a trip/)).toBeVisible();
  await noErrors(page);
});
