import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('an employee updates contacts directly; a nominee change waits for HR, who compares and approves it', async ({ page }) => {
  const nominee = `Sunita Joshi ${Date.now() % 100000}`;   // unique per run, so a rerun proves the new change applied
  await login(page, 'analyst');
  await page.getByLabel('Main navigation').getByRole('link', { name: 'My profile', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible();

  // Emergency contacts are the employee's to keep up to date: saved at once.
  const contacts = page.locator('[aria-label="Emergency contacts"]');
  await contacts.getByRole('button', { name: /Edit|Add/ }).click();
  let dlg = page.getByRole('dialog', { name: 'Edit emergency contacts' });
  await dlg.getByLabel('Alternate phone', { exact: true }).first().fill('+91 98220 55555');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Emergency contacts saved')).toBeVisible();
  await expect(contacts).toContainText('+91 98220 55555');

  // Nominees are checked by HR first.
  const nominees = page.locator('[aria-label="Nominees"]');
  await nominees.getByRole('button', { name: /Edit|Add/ }).click();
  dlg = page.getByRole('dialog', { name: 'Edit nominees' });
  await expect(dlg).toContainText('HR checks changes to nominees');
  const entry = dlg.getByRole('region', { name: 'Nominees entry 1' });
  await entry.getByLabel('For', { exact: true }).selectOption('pf');
  await entry.getByLabel('Name', { exact: true }).fill(nominee);
  await entry.getByLabel('Relationship', { exact: true }).fill('Mother');
  await entry.getByLabel('Share %', { exact: true }).fill('100');
  await dlg.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Nominees sent to HR for approval')).toBeVisible();
  await expect(nominees).toContainText('Change awaiting HR approval');
  await expect(nominees.getByRole('button', { name: /^(Edit|Add)$/ })).toHaveCount(0);   // one change at a time

  await login(page, 'hr.head');
  await page.goto('/approvals');
  const row = page.getByRole('row').filter({ hasText: /Aditya Joshi: nominees \(1 entry\)/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Personal details');
  await row.getByRole('button', { name: /Aditya Joshi: nominees/ }).click();
  const detail = page.getByRole('dialog', { name: 'Approval history' });
  await expect(detail).toContainText(`Proposed nominees`);
  await expect(detail).toContainText(nominee);
  await expect(detail).toContainText('Recorded now');
  await detail.getByRole('button', { name: /Close|×/ }).first().click();
  await row.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve request' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Request approved/)).toBeVisible();

  await login(page, 'analyst');
  await page.goto('/profile');
  await expect(nominees).toContainText(`Provident fund: ${nominee} (Mother) · 100%`);
  await expect(nominees).not.toContainText('Change awaiting HR approval');
  await noErrors(page);
});
