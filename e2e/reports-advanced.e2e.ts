import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('HR saves the department overview and schedules it monthly for payroll', async ({ page }) => {
  await login(page, 'hr.head');
  await page.goto('/reports?r=department_overview');
  const table = page.getByRole('table', { name: 'Department overview' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /Attendance %/ })).toBeVisible();
  const name = `Department overview ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Save report' }).click();
  const save = page.getByRole('dialog', { name: 'Save report' });
  await save.getByLabel('Name').fill(name);
  await save.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.getByRole('link', { name: '← All reports' }).click();
  const row = page.getByRole('table', { name: 'My saved reports' }).getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Schedule' }).click();
  const form = page.getByRole('dialog', { name: `Schedule — ${name}` });
  await form.getByLabel('How often').selectOption('monthly');
  await form.getByLabel('On day').fill('2');
  await form.getByLabel('Covering').selectOption('last_month');
  await form.getByRole('checkbox', { name: /Sneha Patil/ }).check();       // the payroll manager can see it for the whole organization
  await form.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText(/^Scheduled; next run/)).toBeVisible();
  await expect(row).toContainText('Every month on day 2 · Last month');
  await expect(row).toContainText('+1 recipient(s)');
  await noErrors(page);
});
