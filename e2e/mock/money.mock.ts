import { test, expect, type Page } from '@playwright/test';
import { noErrors } from '../helpers';
import { forceTheme, mockApi } from './api';

const problem = (status: number, title: string) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status }) });
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe('expenses', () => {
  test('new claim, then an expense: inline validation first, then the item is posted', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/expenses/claims', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, json: { id: 'cl1' } }) : r.fallback()));
    let posted = 0;
    await page.route('**/api/v1/expenses/claims/cl1/items', (r) => { posted += 1; return r.fulfill({ status: 201, json: { id: 'x', possibleDuplicate: false } }); });
    await page.goto('/expenses');
    await page.getByRole('button', { name: 'New claim' }).click();
    const form = page.getByRole('dialog', { name: 'New expense claim' });
    await form.getByRole('button', { name: 'Create and add items' }).click();
    await expect(form.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel('Title').fill('Client visit');
    await form.getByLabel('Business purpose').fill('Client meeting');
    await form.getByRole('button', { name: 'Create and add items' }).click();
    await page.getByRole('button', { name: 'Add expense' }).click();
    const item = page.getByRole('dialog', { name: 'Add expense' });
    await item.getByLabel('Category').selectOption({ label: 'Meals' });
    await item.getByLabel('Amount').fill('99999');
    await item.getByLabel('Description').fill('Lunch');
    await item.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(item.getByText(/The limit for Meals is/)).toBeVisible();
    await item.getByLabel('Amount').fill('350');
    await item.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(item.getByText('This category needs a receipt')).toBeVisible();
    await expect.poll(() => posted).toBe(0);
    await item.getByLabel(/^Receipt/).setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: Buffer.from('x') });
    await item.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Expense added')).toBeVisible();
    expect(posted).toBe(1);
  });

  test('a per-diem item shows its price from the rate', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/expenses?tab=mine&claim=cl1');
    await page.getByRole('button', { name: 'Add expense' }).click();
    const item = page.getByRole('dialog', { name: 'Add expense' });
    await item.getByLabel('Category').selectOption({ label: 'Daily allowance (per diem)' });
    await item.getByLabel('Days').fill('1.5');
    await expect(item).toContainText('Allowance ₹1,800.00 (1.5 × ₹1,200.00)');
    await item.getByLabel('Days').fill('1.3');
    await item.getByLabel('Description').fill('Mumbai');
    await item.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(item.getByText('Enter days in half-day steps, such as 1.5')).toBeVisible();
  });

  test('prepare a batch from finance; a batch you prepared offers no Approve', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/expenses/batches', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, json: { id: 'n', total: 800 } }) : r.fallback()));
    await page.goto('/expenses?tab=finance');
    await expect(page.getByRole('row').filter({ hasText: 'Ishaan Verma' }).filter({ hasText: 'Prepared' }).first().getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await page.getByLabel('Select Training travel').check();
    await page.getByRole('button', { name: 'Prepare batch (1)' }).click();
    await expect(page.getByText('Batch prepared: ₹800.00. Another finance user must approve it.')).toBeVisible();
    await noErrors(page);
  });

  test('a failed batch cancel stays open and shows why; a failed export stays on the page', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/expenses/batches/bat3/cancel', (r) => r.fulfill(problem(409, 'The batch was already paid')));
    await page.route('**/api/v1/expenses/batches/bat3/export.csv', (r) => r.fulfill(problem(409, 'Nothing to export yet')));
    await page.goto('/expenses?tab=finance');
    const row = page.getByRole('row').filter({ hasText: 'Vikram Sethi' });
    await row.getByRole('button', { name: 'Export CSV' }).click();
    await expect(page.getByText('Nothing to export yet')).toBeVisible();
    await expect(page).toHaveURL(/tab=finance/);
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dlg = page.getByRole('dialog', { name: 'Cancel batch' });
    await dlg.getByRole('button', { name: 'Cancel batch' }).click();
    await expect(dlg.getByRole('alert')).toContainText('The batch was already paid');
    await expect(dlg).toBeVisible();
  });

  test('a claim with long data fills a phone sheet without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await mockApi(page, { persona: 'admin' });
    await page.goto('/expenses?tab=mine');
    await page.getByRole('list', { name: 'My expense claims' }).getByRole('button').first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText('Claim for a trip')).toBeVisible();
    await expect(dlg.getByRole('table')).toHaveCount(0);
    expect(await dlg.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('travel', () => {
  test('request travel: required fields are shown inline, the total adds up, and the request is sent', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    let body: { advance?: unknown; destination?: string } = {};
    await page.route('**/api/v1/travel/requests', (r) => { if (r.request().method() !== 'POST') return r.fallback(); body = r.request().postDataJSON(); return r.fulfill({ status: 201, json: { id: 'n' } }); });
    await page.goto('/travel');
    await page.getByRole('button', { name: 'Request travel' }).click();
    const form = page.getByRole('dialog', { name: 'Request travel' });
    await form.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(form.getByLabel('Purpose')).toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel('Purpose').fill('Client audit');
    await form.getByLabel('From (city)').fill('Pune');
    await form.getByLabel('Destination').fill('Mumbai');
    await form.getByLabel('Tickets / fuel').fill('1800');
    await form.getByLabel('Stay').fill('2400');
    await form.getByRole('group', { name: 'Per diem' }).getByRole('button', { name: 'Use for meals' }).click();
    await expect(form.getByLabel('Meals')).toHaveValue('3600.00');
    await expect(form).toContainText('Total ₹7,800.00');
    await form.getByLabel(/^Advance needed/).fill('3000');
    await form.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByText('Travel requested; sent for approval')).toBeVisible();
    expect(body.destination).toBe('Mumbai');
  });

  test('a returned trip explains what to do and can be requested again in one press', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/travel');
    await expect(page.getByText(/cannot be edited/)).toBeVisible();
    await page.getByRole('button', { name: 'Request again' }).click();
    await expect(page.getByRole('dialog', { name: 'Request travel' }).getByLabel('Purpose')).toHaveValue(/Returned for correction/);
  });

  test('advance returned: over the outstanding is refused inline, a server failure stays open', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/travel/requests/tr5/advance-returned', (r) => r.fulfill(problem(409, 'The trip was already closed')));
    await page.goto('/travel?tab=all');
    await page.getByRole('row').filter({ hasText: 'NEFT-001' }).getByRole('button', { name: 'Advance returned' }).click();
    const dlg = page.getByRole('dialog', { name: 'Advance returned' });
    await dlg.getByLabel(/^Amount returned/).fill('2000');
    await dlg.getByLabel('How it was returned').fill('Cash to accounts');
    await dlg.getByRole('button', { name: 'Record' }).click();
    await expect(dlg.getByText(/Only ₹1,500.00 is outstanding/)).toBeVisible();
    await dlg.getByLabel(/^Amount returned/).fill('500');
    await dlg.getByRole('button', { name: 'Record' }).click();
    await expect(dlg.getByRole('alert')).toContainText('The trip was already closed');
    await expect(dlg.getByLabel('How it was returned')).toHaveValue('Cash to accounts');
  });

  test('filters go to the server and return to the first page', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/travel?tab=all');
    const request = page.waitForRequest((r) => r.url().includes('/travel/requests') && r.url().includes('advance=to_pay'));
    await page.getByLabel('Advance').selectOption('to_pay');
    expect(new URL((await request).url()).searchParams.get('page')).toBe('1');
  });
});

test.describe('assets', () => {
  test('issue with the employee picker: choosing nobody is refused inline', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    let body: { employeeId?: string } = {};
    await page.route('**/api/v1/assets/002/issue', (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
    await page.goto('/assets?tab=register');
    await page.getByRole('row').filter({ hasText: 'Torque wrench set' }).getByRole('button', { name: 'Issue' }).click();
    const dlg = page.getByRole('dialog', { name: /^Issue IT-002/ });
    await dlg.getByRole('combobox').press('Escape');
    await dlg.getByRole('button', { name: 'Issue', exact: true }).click();
    await expect(dlg.getByText('Choose who receives it')).toBeVisible();
    await dlg.getByRole('combobox').fill('Meera');
    await dlg.getByRole('option').filter({ hasText: 'Meera' }).click();
    await dlg.getByRole('button', { name: 'Issue', exact: true }).click();
    await expect(page.getByText('Issued; the employee is asked to confirm receipt')).toBeVisible();
    expect(body.employeeId).toBe('e3');
  });

  test('confirming receipt shows at once and goes back if the server refuses', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/assets/assignments/as1/acknowledge', (r) => r.fulfill(problem(409, 'Already returned')));
    await page.goto('/assets?tab=mine');
    await page.getByRole('button', { name: 'I received it' }).click();
    await expect(page.getByText('Already returned')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I received it' })).toBeVisible();
  });

  test('white-label: no lab words with the lab flag off; a failed branch list is said out loud', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.route('**/api/v1/org', (r) => r.fulfill(problem(500, 'Branches are unavailable')));
    await page.goto('/assets?tab=register');
    await expect(page.getByRole('columnheader', { name: 'Service due' })).toBeVisible();
    await page.getByRole('button', { name: 'Add asset' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add asset' });
    await expect(dlg.getByRole('alert')).toContainText('Branches are unavailable');
    await expect(page.locator('body')).not.toContainText(/calibration|laborator|lab instrument/i);
  });

  test('a bad tag is refused inline, before any request', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    let posted = false;
    await page.route('**/api/v1/assets', (r) => { if (r.request().method() === 'POST') posted = true; return r.fallback(); });
    await page.goto('/assets?tab=register');
    await page.getByRole('button', { name: 'Add asset' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add asset' });
    await dlg.getByLabel('Asset tag').fill('bad tag!');
    await dlg.getByLabel('Name').fill('Printer');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg.getByText(/Use letters, digits/)).toBeVisible();
    expect(posted).toBe(false);
  });
});

const OUT = process.env.SCREENSHOT_DIR ?? 'test-results/screens';
for (const width of [360, 1440]) {
  test(`dialogs with long data, ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    await forceTheme(page, 'dark');
    await mockApi(page, { persona: 'admin' });
    await page.goto('/expenses?tab=mine&claim=cl1');
    await expect(page.getByRole('dialog').getByText('Claim for a trip')).toBeVisible();
    await page.screenshot({ path: `${OUT}/expenses-claim-dialog-${width}-dark.png`, animations: 'disabled' });
    await page.goto('/travel?tab=mine');
    await page.getByRole('button', { name: 'Details' }).first().click();
    await expect(page.getByRole('dialog').getByText('Advance outstanding')).toBeVisible();
    await page.screenshot({ path: `${OUT}/travel-detail-dialog-${width}-dark.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Request travel' }).click();
    await expect(page.getByRole('dialog', { name: 'Request travel' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/travel-request-dialog-${width}-dark.png`, animations: 'disabled' });
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
}
