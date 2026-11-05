import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('an IT administrator defines a role from permissions they hold, edits it and deletes it', async ({ page }) => {
  const name = `Asset desk ${Date.now() % 100000}`;
  await login(page, 'it');
  await page.goto('/settings/roles');
  await expect(page.getByRole('region', { name: 'Built-in roles' })).toContainText('HR Administrator');

  await page.getByRole('button', { name: 'New role' }).click();
  let dlg = page.getByRole('dialog', { name: 'New role' });
  await dlg.getByLabel('Role name').fill(name);
  await dlg.getByLabel('What it is for (optional)').fill('Front desk issuing laptops and instruments (E2E)');
  await expect(dlg).toContainText('only permissions you hold yourself');
  await expect(dlg.getByRole('checkbox', { name: 'View payroll runs, salaries and registers' })).toBeDisabled();
  await dlg.getByLabel('Filter permissions').fill('asset');
  await dlg.getByRole('checkbox', { name: 'Maintain the asset register; issue and receive assets' }).check();
  await dlg.getByRole('button', { name: 'Create role' }).click();
  await expect(page.getByText(`Role "${name}" created`)).toBeVisible();

  const mine = page.locator('[aria-label="Organization roles"]');
  const row = mine.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('1 permission');

  await row.getByRole('button', { name: 'Edit' }).click();
  dlg = page.getByRole('dialog', { name: `Edit role: ${name}` });
  await dlg.getByLabel('Filter permissions').fill('legal entities');
  await dlg.getByRole('checkbox', { name: 'View legal entities, branches and departments' }).check();
  await dlg.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByText('Role saved', { exact: true })).toBeVisible();
  await expect(row).toContainText('2 permissions');

  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: `Delete role "${name}"` }).getByRole('button', { name: 'Delete role' }).click();
  await expect(page.getByText('Role deleted')).toBeVisible();
  await expect(mine.getByRole('row').filter({ hasText: name })).toHaveCount(0);
  await noErrors(page);
});
