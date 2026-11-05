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

test('a loan: apply, manager and finance approve, payroll disburses, the schedule shows the instalments', async ({ page }) => {
  await login(page, 'analyst');
  await page.goto('/loans');
  // The demo's salary advance is being recovered.
  await expect(page.getByRole('table', { name: 'My advances and loans' })).toContainText('Salary advance');
  await page.getByRole('button', { name: 'Apply' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for an advance or loan' });
  await form.getByLabel('Kind').selectOption('loan');
  await form.getByLabel('Amount (₹)').fill('25000');
  await form.getByLabel('Instalments').fill('6');
  await expect(form).toContainText('6 monthly instalments of ₹4,167.00 (the last ₹4,165.00)');
  await form.getByLabel('Purpose').fill('Laptop for the NABL documentation work from home');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Application sent for approval')).toBeVisible();

  const summary = /Aditya Joshi: Loan|Aditya Joshi: loan/;
  await login(page, 'lab.manager');
  await approve(page, summary);
  await login(page, 'finance');
  await approve(page, summary);

  await login(page, 'payroll');
  await page.goto('/loans');
  await page.getByRole('tab', { name: 'Everyone' }).click();
  const row = page.getByRole('table', { name: 'Advances and loans' }).getByRole('row').filter({ hasText: 'Aditya Joshi' }).filter({ hasText: 'Laptop' });
  await row.getByRole('button', { name: 'Disburse' }).click();
  const pay = page.getByRole('dialog', { name: 'Disburse' });
  await pay.getByLabel('Payment reference').fill('NEFT-E2E-LOAN');
  await pay.getByRole('button', { name: 'Disburse' }).click();
  await expect(page.getByText('Recorded as paid; recovery starts in payroll')).toBeVisible();
  await expect(row).toContainText('Disbursed');
  await row.getByRole('button', { name: 'Details' }).click();
  // Masked until asked: the title has no amount yet, and showing is audited.
  const d = page.getByRole('dialog', { name: /^Loan/ });
  await d.getByRole('button', { name: 'Show details' }).click();
  await expect(page.getByRole('dialog', { name: /^Loan — ₹25,000\.00/ })).toBeVisible();
  await expect(d.getByRole('table', { name: 'Schedule' }).getByRole('row')).toHaveCount(7);   // header + 6 instalments
  await expect(d.locator('.tile').filter({ hasText: 'Outstanding' })).toContainText('₹25,000.00');
  await noErrors(page);
});
