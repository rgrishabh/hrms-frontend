import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

const plus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('finance schedules a mileage rate and withdraws it before it starts', async ({ page }) => {
  const from = plus(60 + (Date.now() % 240));   // a future day unlikely to clash with an earlier run
  await login(page, 'finance');
  await page.goto('/expenses?tab=rates');
  const perDiem = page.locator('[aria-label="Per diem (per day)"]');
  await expect(perDiem.getByRole('row').filter({ hasText: 'METRO' }).filter({ hasText: 'All grades' }).first()).toContainText('Active');
  const mileage = page.locator('[aria-label="Mileage (per km)"]');
  await mileage.getByRole('button', { name: 'Add rate' }).click();
  const dlg = page.getByRole('dialog', { name: 'Add mileage rate' });
  await dlg.getByLabel('Vehicle').selectOption('car');
  await dlg.getByLabel('Rate per km (₹)').fill('10.50');
  await dlg.getByLabel('Applies from').fill(from);
  await dlg.getByLabel('Note (optional)').fill('Fuel revision (E2E)');
  await dlg.getByRole('button', { name: 'Add rate' }).click();
  await expect(page.getByText('Rate added')).toBeVisible();
  const row = mileage.getByRole('row').filter({ hasText: 'Fuel revision (E2E)' }).filter({ hasText: 'Scheduled' });
  await expect(row.first()).toContainText('₹10.50');
  await row.first().getByRole('button', { name: 'Withdraw' }).click();
  await page.getByRole('dialog', { name: 'Withdraw rate' }).getByRole('button', { name: 'Withdraw rate' }).click();
  await expect(page.getByText('Rate withdrawn')).toBeVisible();
  await noErrors(page);
});

test('an employee claims a per diem priced from the rate, and the trip form quotes it', async ({ page }) => {
  const title = `Mumbai audit (E2E ${Date.now().toString(36)})`;
  await login(page, 'analyst');
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'New claim' }).click();
  const form = page.getByRole('dialog', { name: 'New expense claim' });
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Business purpose').fill('Witnessed the client’s sampling for the NABL audit');
  await form.getByRole('button', { name: 'Create and add items' }).click();
  const claim = page.getByRole('dialog', { name: title });
  await claim.getByRole('button', { name: 'Add expense' }).click();
  const item = page.getByRole('dialog', { name: 'Add expense' });
  await item.getByLabel('Category').selectOption({ label: 'Daily allowance (per diem)' });
  await item.getByLabel('Days').fill('1.5');
  await item.getByLabel('Destination class').selectOption('METRO');
  await expect(item).toContainText('Allowance ₹1,800.00 (1.5 × ₹1,200.00)');
  await item.getByLabel('Description').fill('Mumbai — client audit');
  await item.getByRole('button', { name: 'Add' }).click();
  const row = claim.getByRole('row').filter({ hasText: 'Mumbai — client audit' });
  await expect(row).toContainText('1.5 day(s) × ₹1,200.00 · METRO');
  await expect(row).toContainText('₹1,800.00');
  await claim.getByRole('button', { name: 'Close' }).click();

  await page.goto('/travel');
  await page.getByRole('button', { name: 'Request travel' }).click();
  const trip = page.getByRole('dialog', { name: 'Request travel' });
  await trip.getByLabel('Start').fill(plus(5));
  await trip.getByLabel('Return').fill(plus(7));
  const helper = trip.locator('[aria-label="Per diem"]');
  await helper.getByLabel('Per-diem class').selectOption('OTHER');
  await expect(helper).toContainText('3 day(s) × ₹800.00 = ₹2,400.00');
  await helper.getByRole('button', { name: 'Use for meals' }).click();
  await expect(trip.getByLabel('Meals')).toHaveValue('2400.00');
  await trip.getByRole('button', { name: 'Cancel' }).click();
  await noErrors(page);
});
