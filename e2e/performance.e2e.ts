import { test, expect, type Page } from '@playwright/test';
import { login, open, noErrors } from './helpers';

// The full review: analyst (self) → lab manager (manager) → HR head (final) → analyst (acknowledge).
// Each step runs only if the review is at that stage, so the test can be re-run on the same demo data.
const status = (page: Page) => page.locator('.badge').filter({ hasText: /Not started|Self-review done|Manager review done|Finalized|Acknowledged/ }).first();

test.describe.configure({ mode: 'serial' });

test('analyst sees agreed goals and submits the self-review', async ({ page }) => {
  await login(page, 'analyst');
  await open(page, 'Performance');
  await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible();
  await expect(page.getByText('Weight 100% of 100%')).toBeVisible();
  await expect(page.getByText('Report turnaround within 3 working days')).toBeVisible();
  if ((await status(page).innerText()) === 'Not started') {
    await page.getByLabel('Overall rating').selectOption('4');
    await page.getByLabel('Comments').fill('Met the TAT target in most weeks; authorized on pH; one CAPA closed on time.');
    await page.getByRole('button', { name: 'Submit' }).click();
  }
  await expect(status(page)).not.toHaveText('Not started');
  // The manager's rating stays hidden from the employee until HR finalizes.
  if (!/Finalized|Acknowledged/.test(await status(page).innerText())) await expect(page.getByText('Shown once the review is finalized')).toBeVisible();
  await noErrors(page);
});

test('lab manager reviews the analyst from the team tab', async ({ page }) => {
  await login(page, 'lab.manager');
  await open(page, 'Performance');
  await page.getByRole('tab', { name: /My team/ }).click();
  await page.getByLabel('Search').fill('Aditya');
  await page.getByRole('row', { name: /Aditya Joshi/ }).getByRole('button', { name: /Aditya Joshi/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Performance review' });
  await expect(dlg.getByRole('heading', { name: 'Aditya Joshi' })).toBeVisible();
  if ((await status(dlg as unknown as Page).innerText()) === 'Self-review done') {
    await dlg.getByLabel('Overall rating').selectOption('3');
    await dlg.getByLabel('Comments').fill('Reliable on TAT and data integrity; next year: second method authorization.');
    await dlg.getByRole('button', { name: 'Submit' }).click();
  }
  await expect(status(dlg as unknown as Page)).toHaveText(/Manager review done|Finalized|Acknowledged/);
});

test('HR head finalizes, then the analyst sees the rating and acknowledges', async ({ page }) => {
  await login(page, 'hr.head');
  await open(page, 'Performance');
  await page.getByRole('tab', { name: 'All reviews' }).click();
  await page.getByLabel('Search').fill('Aditya');
  await page.getByRole('row', { name: /Aditya Joshi/ }).getByRole('button', { name: /Aditya Joshi/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Performance review' });
  if ((await status(dlg as unknown as Page).innerText()) === 'Manager review done') {
    await dlg.getByLabel('Final rating').selectOption('3');
    await dlg.getByRole('button', { name: 'Submit' }).click();
  }
  await expect(status(dlg as unknown as Page)).toHaveText(/Finalized|Acknowledged/);

  await login(page, 'analyst');
  await open(page, 'Performance');
  await expect(page.getByText('3 · Meets expectations').first()).toBeVisible();
  if ((await status(page).innerText()) === 'Finalized') await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(status(page)).toHaveText('Acknowledged');
});
