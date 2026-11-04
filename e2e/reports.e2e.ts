import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { login, noErrors } from './helpers';

test('HR runs headcount, regroups it and downloads the CSV', async ({ page }) => {
  await login(page, 'hr.head');
  await page.getByLabel('Main navigation').getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await page.getByRole('link', { name: 'Headcount', exact: true }).click();
  const table = page.getByRole('table', { name: 'Headcount' });
  await expect(table.getByRole('columnheader', { name: 'Department' })).toBeVisible();
  await expect(table.locator('tfoot')).toContainText('Total');

  await page.getByLabel('Group by').selectOption('branch');
  await page.getByRole('button', { name: 'Run report' }).click();
  await expect(page).toHaveURL(/groupBy=branch/);
  await expect(table.getByRole('columnheader', { name: 'Branch' })).toBeVisible();
  const total = Number((await table.locator('tfoot td').nth(1).innerText()).replace(/,/g, ''));
  expect(total).toBeGreaterThan(50);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^headcount-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await readFile((await download.path())!, 'utf8')).replace(/^﻿/, '');
  const lines = csv.trim().split(/\r\n/);
  expect(lines[0]).toMatch(/^Branch,Headcount,/);
  expect(lines.at(-1)).toMatch(new RegExp(`^Total,${total},`));

  // Sorting by a number column puts the largest first on the second click.
  await table.getByRole('button', { name: 'Headcount' }).click();
  await table.getByRole('button', { name: 'Headcount' }).click();
  const first = Number(await table.locator('tbody tr').first().locator('td').nth(1).innerText());
  const last = Number(await table.locator('tbody tr').last().locator('td').nth(1).innerText());
  expect(first).toBeGreaterThanOrEqual(last);
  await noErrors(page);
});

test('a laboratory manager sees only their own team in attendance and leave reports', async ({ page }) => {
  await login(page, 'lab.manager');
  await page.goto('/reports');
  await expect(page.getByRole('link', { name: 'Headcount', exact: true })).toHaveCount(0); // HR-only
  await page.getByRole('link', { name: 'Attendance summary' }).click();
  await expect(page.getByText('Your reporting team only.')).toBeVisible();
  const table = page.getByRole('table', { name: 'Attendance summary' });
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const depts = await table.locator('tbody tr td:nth-child(3)').allInnerTexts();
  expect(new Set(depts)).toEqual(new Set(['Water & Wastewater']));

  await page.goto('/reports?r=leave_balances');
  await expect(page.getByRole('table', { name: 'Leave balances' }).getByRole('columnheader', { name: 'CL' })).toBeVisible();
  await noErrors(page);
});

test('an unknown or forbidden report link explains itself', async ({ page }) => {
  await login(page, 'lab.manager');
  await page.goto('/reports?r=payroll_cost');
  await expect(page.getByRole('alert')).toHaveText('This report is not available to you.');
  await page.getByRole('link', { name: 'All reports' }).click();
  await expect(page.getByRole('link', { name: 'Leave taken' })).toBeVisible();
});

test('leave taken by type and invalid periods', async ({ page }) => {
  await login(page, 'hr.head');
  await page.goto('/reports?r=leave_taken&groupBy=leave_type&from=2020-01-01&to=2030-12-31');
  await expect(page.getByRole('alert')).toContainText('at most 731 days');
  const from = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  await page.goto(`/reports?r=leave_taken&groupBy=leave_type&from=${from}`);
  const table = page.getByRole('table', { name: 'Leave taken' });
  await expect(table.getByRole('columnheader', { name: 'Leave type' })).toBeVisible(); // the demo includes approved leave in the last weeks
  await expect(table.locator('tfoot')).toContainText('Total');
});
