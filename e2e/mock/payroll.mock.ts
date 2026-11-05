import { test, expect, type Page } from '@playwright/test';
import { noErrors } from '../helpers';
import { ALL_FEATURES, mockApi } from './api';

const fail = (status: number, title: string) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title, status }) });
/** Elements drawn wider than a dialog body, so a failure names them. */
const tooWide = (page: Page) => page.evaluate(() => { const body = document.querySelector('[role="dialog"]:last-of-type .dialog__body') ?? document.querySelector('.dialog__body')!; const right = body.getBoundingClientRect().right; return [...body.querySelectorAll<HTMLElement>('*')].filter((el) => el.getBoundingClientRect().right > right + 1 && !el.closest('.visually-hidden, .tabs-bar')).slice(0, 6).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`); });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('hold from the run, then undo it from the toast', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  const holds: { hold: boolean }[] = [];
  await page.route('**/payroll/runs/r1/hold', (r) => { holds.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/payroll');
  await page.getByRole('button', { name: '2026-10' }).click();
  const dlg = page.getByRole('dialog', { name: /Payroll 2026-10/ });
  await dlg.getByRole('button', { name: 'Hold pay for Arjun Rao' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => holds.map((h) => h.hold)).toEqual([true, false]);
  await expect(page.getByText('Hold undone')).toBeVisible();
});

test('a failed release stays open with the reason and the typed text; then it works', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let attempts = 0;
  await page.route('**/payroll/runs/r2/items/e2/release', (r) => (++attempts === 1 ? r.fulfill(fail(409, 'No held pay to release')) : r.fulfill({ json: { ok: true } })));
  await page.goto('/payroll?tab=runs&run=r2');
  const run = page.getByRole('dialog', { name: /Payroll 2026-09/ });
  await run.getByRole('button', { name: 'Release held pay for Meera Nair' }).click();
  const dlg = page.getByRole('dialog', { name: 'Release held pay' });
  await expect(dlg.getByRole('button', { name: 'Release pay' })).toBeDisabled();
  await dlg.getByLabel(/Reason/).fill('Bank details confirmed');
  await dlg.getByRole('button', { name: 'Release pay' }).click();
  await expect(dlg.getByRole('alert')).toContainText('No held pay to release');
  await expect(dlg.getByLabel(/Reason/)).toHaveValue('Bank details confirmed');
  await dlg.getByRole('button', { name: 'Release pay' }).click();
  await expect(page.getByText('Released. Download the bank file for released pay.')).toBeVisible();
  await expect(dlg).toHaveCount(0);
  await expect(run.getByRole('button', { name: /Bank file for released pay/ })).toBeVisible();
});

test('reopen an approved run, with the attendance warning instead of a Finalize that would fail', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let reopened = false;
  await page.route('**/payroll/runs/r4/reopen', (r) => { reopened = true; return r.fulfill({ json: { ok: true } }); });
  await page.goto('/payroll?tab=runs&run=r4');
  const run = page.getByRole('dialog', { name: /Payroll 2026-07/ });
  await expect(run.getByText('Lock attendance for 2026-07')).toBeVisible();
  await expect(run.getByRole('button', { name: 'Finalize' })).toHaveCount(0);
  await run.getByRole('button', { name: 'Reopen' }).click();
  await page.getByRole('dialog', { name: 'Reopen payroll run' }).getByRole('button', { name: 'Reopen run' }).click();
  await expect(page.getByText('Reopened as a draft. Recompute it.')).toBeVisible();
  expect(reopened).toBe(true);
});

test('a full and final run: pick the leaver, see leave balances for the leave year, month follows', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let body: Record<string, unknown> = {};
  await page.route('**/api/v1/payroll/runs', (r) => { if (r.request().method() !== 'POST') return r.fallback(); body = r.request().postDataJSON(); return r.fulfill({ status: 201, json: { id: 'r3' } }); });
  await page.goto('/payroll');
  await page.getByRole('button', { name: 'New run' }).click();
  const form = page.getByRole('dialog', { name: 'New payroll run' });
  await form.getByLabel('Kind').selectOption('fnf');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form.getByLabel(/^Legal entity/)).toBeFocused(); // the browser check comes first, inline
  await form.getByLabel(/^Legal entity/).selectOption('l1');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form.getByText('Choose who is leaving')).toBeVisible();
  await form.getByRole('combobox', { name: /Employee/ }).click();
  await form.getByRole('option', { name: /Meera Nair/ }).click();
  await expect(form.getByText('Leave year 2026 balances')).toBeVisible();
  await expect(form.getByLabel(/^Month/)).toHaveValue('2026-08');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('dialog', { name: /Payroll 2026-08/ })).toBeVisible();
  expect(body).toMatchObject({ kind: 'fnf', employeeId: 'e2', period: '2026-08', legalEntityId: 'l1' });
});

test('a failed download stays on the page and says why', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/payroll/runs/r2/bank.csv', (r) => r.fulfill(fail(409, 'Exports are available once the run is finalized')));
  await page.goto('/payroll?tab=runs&run=r2');
  await page.getByRole('button', { name: 'Bank CSV' }).click();
  await expect(page.getByText('Exports are available once the run is finalized')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Payroll' })).toBeVisible();
});

test('a salary change is refused inline with nothing filled in, then sent for approval', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  await page.route('**/payroll/employees/*/salaries', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, json: { id: 's9' } }) : r.fallback()));
  await page.goto('/payroll?tab=salaries');
  await page.getByRole('combobox', { name: /Employee/ }).click();
  await page.getByRole('option', { name: /Meera Nair/ }).click();
  await expect(page.getByRole('table', { name: 'Salary history' })).toContainText('Annual revision');
  await page.getByRole('button', { name: 'Propose change' }).click();
  const form = page.getByRole('dialog', { name: /Salary change/ });
  await form.getByLabel(/^Reason/).fill('Annual revision');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByText('Enter at least one component')).toBeVisible();
  await form.getByLabel(/^Basic/).fill('50000');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Sent for approval')).toBeVisible();
  await noErrors(page);
});

test('the journal lists what still needs a ledger, and a map save reaches the server', async ({ page }) => {
  await mockApi(page, { persona: 'admin' });
  let entries: { key: string; ledger: string }[] = [];
  await page.route('**/accounting/ledger-map', (r) => { if (r.request().method() !== 'PUT') return r.fallback(); entries = r.request().postDataJSON().entries; return r.fulfill({ json: { ok: true } }); });
  await page.goto('/accounting');
  await page.getByRole('button', { name: /Journal for payroll 2026-09/ }).click();
  const dlg = page.getByRole('dialog', { name: /Journal/ });
  await expect(dlg).toContainText('deduction:LWF_EE');
  await expect(dlg.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);
  await dlg.getByRole('link', { name: 'Open the ledger map' }).click();
  await expect(page).toHaveURL(/tab=ledgers/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Ledger for earning:BASIC').fill('Salaries');
  await page.getByRole('button', { name: 'Save (1)' }).click();
  await expect(page.getByText('Ledger map saved')).toBeVisible();
  expect(entries).toEqual([{ key: 'earning:BASIC', ledger: 'Salaries' }]);
});

test('apply for a loan: too low an amount shows at the field, a failed send keeps what was typed', async ({ page }) => {
  await mockApi(page, { persona: 'employee', features: { ...ALL_FEATURES, FEATURE_SALARY_ADVANCE: true } });
  await page.route('**/api/v1/loans/requests', (r) => (r.request().method() === 'POST' ? r.fulfill(fail(409, 'There is already a loan in progress')) : r.fallback()));
  await page.goto('/loans');
  await page.getByRole('button', { name: 'Apply' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for an advance or loan' });
  await form.getByLabel(/^Kind/).selectOption('loan');
  await form.getByLabel(/^Amount/).fill('0');
  await form.getByLabel(/^Purpose/).fill('Laptop');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(form.getByLabel(/^Amount/)).toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel(/^Amount/).fill('25000');
  await form.getByLabel(/^Instalments/).fill('6');
  await expect(form).toContainText('6 monthly instalments of ₹4,167.00 (the last ₹4,165.00)');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(form.getByRole('alert')).toContainText('There is already a loan in progress');
  await expect(form.getByLabel(/^Purpose/)).toHaveValue('Laptop');
});

test('a loan with salary advance off offers only loans', async ({ page }) => {
  await mockApi(page, { persona: 'employee' });
  await page.goto('/loans');
  await expect(page.getByRole('heading', { level: 1, name: 'Loans' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for a loan' });
  await expect(form.getByLabel(/^Kind/)).toHaveCount(0);
});

test.describe('at 360', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('the run opens as a full-screen sheet of cards with long data, and every action is reachable', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/payroll');
    await page.getByRole('button', { name: '2026-10' }).click();
    const dlg = page.getByRole('dialog', { name: /Payroll 2026-10/ });
    await expect.poll(async () => { const b = await dlg.boundingBox(); return [b?.width, b?.height]; }).toEqual([360, 780]);
    await expect(dlg.getByRole('table')).toHaveCount(0);
    await expect(dlg.getByRole('button', { name: /Hold pay for Venkata/ })).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await tooWide(page)).toEqual([]);
    await dlg.getByRole('button', { name: /Lines for Venkata/ }).click();
    await expect(page.getByRole('dialog', { name: /lines$/ })).toContainText('Provident fund');
  });
  test('loan detail fits, and Details is reachable from the card', async ({ page }) => {
    await mockApi(page, { persona: 'admin' });
    await page.goto('/loans?tab=all');
    await page.getByRole('list', { name: 'Advances and loans' }).getByRole('button', { name: 'Details' }).nth(1).click();
    const dlg = page.getByRole('dialog', { name: /^Loan/ });
    await expect(dlg.getByRole('list', { name: 'Schedule' })).toBeVisible();
    expect(await tooWide(page)).toEqual([]);
  });
});
