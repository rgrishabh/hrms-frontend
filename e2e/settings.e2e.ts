import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('an IT administrator is offered only the roles they may grant, and cannot manage HR accounts', async ({ page }) => {
  await login(page, 'it');
  await page.goto('/settings/users');
  const search = page.getByLabel('Search users');

  // The HR manager holds permissions the IT administrator lacks: no form that the server would refuse.
  await search.fill('Ananya');
  const hr = page.getByRole('row').filter({ hasText: 'Ananya Iyer' });
  await expect(hr).toContainText('Administrator only');
  await expect(hr.getByRole('button', { name: 'Manage' })).toHaveCount(0);

  // An ordinary employee account is theirs to run.
  await search.fill('Pooja');
  await expect(page.getByRole('row').filter({ hasText: 'Pooja Yadav' }).getByRole('button', { name: 'Manage' })).toBeVisible();

  await page.getByRole('button', { name: 'Add user' }).click();
  const form = page.getByRole('dialog', { name: 'Add user' });
  await expect(form.getByRole('checkbox', { name: 'Employee', exact: true })).toBeVisible();
  await expect(form.getByRole('checkbox', { name: 'IT Administrator' })).toBeVisible();
  for (const name of ['Administrator', 'HR Administrator', 'Payroll Manager'])
    await expect(form.getByRole('checkbox', { name, exact: true })).toHaveCount(0);
  await expect(form).toContainText('can only be granted by an administrator');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await noErrors(page);
});
