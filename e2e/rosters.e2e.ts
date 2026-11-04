import { test, expect } from '@playwright/test';
import { login, noErrors } from './helpers';

test('HR builds a rotation, sees the instrument-room crews next week, and changes one day', async ({ page }) => {
  const code = `E2E-${Date.now() % 100000}`;
  await login(page, 'hr.head');
  await page.goto('/attendance/admin');
  await page.getByRole('tab', { name: 'Rosters' }).click();
  const patterns = page.locator('[aria-label="Roster patterns"]');
  await expect(patterns.getByRole('row').filter({ hasText: 'INST-2S' })).toContainText('14 days');

  // A new 4-day pattern: two working days, two off.
  await patterns.getByRole('button', { name: 'New pattern' }).click();
  const dlg = page.getByRole('dialog', { name: 'New roster pattern' });
  await dlg.getByLabel('Code').fill(code);
  await dlg.getByLabel('Name', { exact: true }).fill('Weekend lab cover (E2E)');
  await dlg.getByLabel('Days in the cycle').fill('4');
  await dlg.getByLabel('Day 2', { exact: true }).selectOption({ label: 'MORN' });
  await dlg.getByLabel('Day 3', { exact: true }).selectOption({ label: 'Off' });
  await dlg.getByLabel('Day 4', { exact: true }).selectOption({ label: 'Off' });
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Pattern saved')).toBeVisible();
  await expect(patterns.getByRole('row').filter({ hasText: code })).toContainText('4 days');

  // Next week the instrument room runs two crews; change one person's Monday to a day off, then undo it.
  await page.getByRole('button', { name: 'Next week' }).click();
  const grid = page.getByRole('table', { name: 'Roster' });
  const crew = grid.getByRole('row').filter({ hasText: 'Instrumentation' }).filter({ hasText: 'MORN' }).first();
  await expect(crew).toBeVisible();
  const monday = crew.getByRole('button').first();
  await expect(monday).toContainText(/MORN|EVE/);
  await monday.click();
  const day = page.getByRole('dialog', { name: /: / });
  await day.getByLabel('Works').selectOption({ label: 'Day off' });
  await day.getByLabel('Reason').fill('Swap with the evening crew (E2E)');
  await day.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Day changed')).toBeVisible();
  await expect(monday).toContainText('Off*');
  await monday.click();
  await page.getByRole('dialog', { name: /: / }).getByRole('button', { name: 'Remove change' }).click();
  await expect(page.getByText('Change removed')).toBeVisible();
  await expect(monday).toContainText(/^(MORN|EVE)$/);
  await noErrors(page);
});

test('an employee sees only their own roster', async ({ page }) => {
  await login(page, 'analyst');
  await page.getByLabel('Main navigation').getByRole('link', { name: 'Roster', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Roster' })).toBeVisible();
  const rows = page.getByRole('table', { name: 'Roster' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Aditya Joshi');
  await expect(rows.first().getByRole('button')).toHaveCount(0);   // read-only
  await noErrors(page);
});
