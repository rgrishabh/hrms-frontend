import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { login, noErrors } from './helpers';

/** The text of one part of a downloaded .xlsx (a ZIP), read from its central directory. */
function xlsxPart(buf: Buffer, name: string): string {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const size = buf.readUInt32LE(p + 20), n = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + n) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      return inflateRawSync(buf.subarray(start, start + size)).toString('utf8');
    }
    p += 46 + n + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`${name} not in workbook`);
}

test('HR runs headcount, regroups it and downloads the CSV and Excel', async ({ page }) => {
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

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^headcount-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await readFile((await download.path())!, 'utf8')).replace(/^\uFEFF/, '');
  const lines = csv.trim().split(/\r\n/);
  expect(lines[0]).toMatch(/^Branch,Headcount,/);
  expect(lines.at(-1)).toMatch(new RegExp(`^Total,${total},`));

  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  expect(xl.suggestedFilename()).toMatch(/^headcount-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const book = await readFile((await xl.path())!);
  expect(book.subarray(0, 2).toString()).toBe('PK');
  const sheet = xlsxPart(book, 'xl/worksheets/sheet1.xml');
  expect(sheet).toContain('<t xml:space="preserve">Branch</t>');
  expect(sheet).toMatch(new RegExp(`<t xml:space="preserve">Total</t></is></c><c r="B\\d+"[^>]*><v>${total}</v>`));

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
