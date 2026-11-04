import { test, expect, type Page } from '@playwright/test';
import { login, noErrors } from './helpers';

const tileValue = async (page: Page, key: string) => Number((await page.locator(`[data-tile="${key}"] .v`).innerText()).replace(/,/g, ''));

test('HR sees organization tiles that agree with the reports they open', async ({ page }) => {
  await login(page, 'hr.head');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Organization' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Attendance today' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your team' })).toHaveCount(0);
  const headcount = await tileValue(page, 'headcount');
  expect(headcount).toBeGreaterThan(50);

  await page.locator('[data-tile="headcount"]').click();
  await expect(page).toHaveURL(/\/reports\?r=headcount/);
  const table = page.getByRole('table', { name: 'Headcount' });
  await expect(table.locator('tfoot')).toContainText('Total');
  expect(Number((await table.locator('tfoot td').nth(1).innerText()).replace(/,/g, ''))).toBe(headcount);

  // The training tile opens the 30-day training report with the same number of rows.
  await page.goto('/');
  const training = page.locator('[data-tile="training_expiry"]');
  if (await training.count()) {
    const n = await tileValue(page, 'training_expiry');
    await training.click();
    await expect(page).toHaveURL(/r=training_expiry&withinDays=30/);
    await expect(page.getByText(new RegExp(`^${n} rows? ·`))).toBeVisible();
  }
  await noErrors(page);
});

test('a laboratory manager sees their team, not the organization', async ({ page }) => {
  await login(page, 'lab.manager');
  await page.goto('/');
  const team = page.getByRole('region', { name: 'Your team' });
  await expect(team).toBeVisible();
  await expect(page.getByRole('region', { name: 'Organization' })).toHaveCount(0);
  await expect(page.locator('[data-tile="headcount"]')).toHaveCount(0);
  expect(await tileValue(page, 'team_size')).toBeGreaterThan(3);
  await expect(page.getByRole('region', { name: 'On leave today' })).toBeVisible();
  await noErrors(page);
});

test('an employee sees only their own numbers', async ({ page }) => {
  await login(page, 'analyst');
  await page.goto('/');
  const you = page.getByRole('region', { name: 'You' });
  await expect(you.locator('[data-tile="leave_CL"]')).toContainText('Casual Leave available');
  for (const name of ['Organization', 'Your team', 'Attendance today', 'On leave today']) await expect(page.getByRole('region', { name })).toHaveCount(0);
  await you.locator('[data-tile="leave_CL"]').click();
  await expect(page).toHaveURL(/\/leave$/);
  await noErrors(page);
});
