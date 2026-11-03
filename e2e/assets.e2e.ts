import { test, expect, type Locator } from '@playwright/test';
import { login, open } from './helpers';

test.describe.configure({ mode: 'serial' });

async function pickEmployee(scope: Locator, name: string) {
  const option = scope.locator('option', { hasText: name }).first();
  await expect(option).toBeAttached();
  await scope.getByRole('combobox').selectOption((await option.getAttribute('value'))!);
}

test('an instrument past calibration cannot be issued', async ({ page }) => {
  await login(page, 'it');
  await open(page, 'Assets');
  await page.getByRole('tab', { name: 'Asset register' }).click();
  await page.getByLabel('Search').fill('INS-PH-01');
  const row = page.getByRole('row', { name: /INS-PH-01/ });
  await expect(row.getByText(/expired/)).toBeVisible();
  await row.getByRole('button', { name: 'Issue' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder('Search name or code').fill('Joshi');
  await pickEmployee(dlg, 'Aditya Joshi');
  await dlg.getByRole('button', { name: 'Issue' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Calibration expired');
});

test('issue a pH meter, the analyst confirms receipt, IT receives it back', async ({ page }) => {
  await login(page, 'it');
  await open(page, 'Assets');
  await page.getByRole('tab', { name: 'Asset register' }).click();
  await page.getByLabel('Search').fill('INS-PH-04');
  const row = page.getByRole('row', { name: /INS-PH-04/ });
  if (await row.getByRole('button', { name: 'Receive' }).count()) { // left issued by an earlier run
    await row.getByRole('button', { name: 'Receive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record return' }).click();
  }
  await row.getByRole('button', { name: 'Issue' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder('Search name or code').fill('Joshi');
  await pickEmployee(dlg, 'Aditya Joshi');
  await dlg.getByLabel('Condition at issue').fill('Good, with electrode and stand');
  await dlg.getByRole('button', { name: 'Issue' }).click();
  await expect(row.getByText('Aditya Joshi')).toBeVisible();
  await expect(row.getByText('receipt not confirmed')).toBeVisible();

  await login(page, 'analyst');
  await open(page, 'Assets');
  const mine = page.getByRole('row', { name: /INS-PH-04/ });
  await mine.getByRole('button', { name: 'I received it' }).click();
  await expect(mine.getByText(/Received/)).toBeVisible();

  await login(page, 'it');
  await open(page, 'Assets');
  await page.getByRole('tab', { name: 'Asset register' }).click();
  await page.getByLabel('Search').fill('INS-PH-04');
  await row.getByRole('button', { name: 'Receive' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record return' }).click();
  await expect(row.getByText('Available')).toBeVisible();
  await row.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('dialog').getByText('Aditya Joshi').first()).toBeVisible();
});
