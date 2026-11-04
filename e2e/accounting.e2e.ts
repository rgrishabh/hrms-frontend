import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('finance maps payroll heads to ledgers; the map is kept; payroll sees it read-only', async ({ page }) => {
  await login(page, 'finance');
  await page.goto('/accounting');
  await page.getByRole('tab', { name: 'Ledger map' }).click();
  const net = page.getByLabel('Ledger for net_pay');
  await net.fill('Salary Payable');
  await page.getByLabel('Ledger for deduction:TDS').fill('TDS on Salary Payable');
  await page.getByRole('button', { name: /^Save \(\d+\)$/ }).click();
  await expect(page.getByText('Ledger map saved')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Ledger map' }).click();
  await expect(page.getByLabel('Ledger for net_pay')).toHaveValue('Salary Payable');
  await page.getByRole('tab', { name: 'Journals' }).click();
  await expect(page.getByRole('heading', { name: 'Payroll runs' })).toBeVisible();
  await noErrors(page);

  await login(page, 'payroll');
  await page.goto('/accounting');
  await page.getByRole('tab', { name: 'Ledger map' }).click();
  await expect(page.getByRole('table', { name: 'Ledger map' })).toContainText('Salary Payable');
  await expect(page.getByLabel('Ledger for net_pay')).toHaveCount(0);   // payroll exports; finance maps
});
