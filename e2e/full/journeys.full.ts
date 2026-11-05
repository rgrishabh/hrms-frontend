import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { settled } from '../helpers';
import { apiAs, emailOf, expectNoAxeViolations, pageAs } from './helpers';

const lastMonths = (back: number) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

test('attendance: clocking in or out changes what comes next', async ({ browser, viewport }) => {
  const page = await pageAs(browser, 'analyst', { viewport });
  await page.goto('/attendance/me');
  const button = page.getByRole('button', { name: /^Clock (in|out)$/ });
  await expect(button).toBeVisible();
  const before = await button.innerText();
  await button.click();
  await expect(page.getByRole('button', { name: before === 'Clock in' ? 'Clock out' : 'Clock in' })).toBeVisible();
  await expect(page.getByText(/Punches:/)).toBeVisible();
  await page.context().close();
});

test('employee: HR adds someone, the record opens, and a directory reader sees no status or branch', async ({ browser, viewport }) => {
  const page = await pageAs(browser, 'hr.head', { viewport });
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await page.goto('/employees');
  await page.getByRole('button', { name: 'Add employee' }).click();
  const form = page.getByRole('dialog', { name: /employee/i });
  await form.getByLabel('Employee code').fill(code);
  await form.getByLabel('First name').fill('Tanvi');
  await form.getByLabel('Last name').fill('Kapoor');
  await form.getByLabel('Branch').selectOption({ index: 1 });
  await form.getByLabel('Date of joining').fill('2026-01-05');
  await form.getByRole('button', { name: /Save|Create|Add/ }).click();
  await expect(form).toHaveCount(0);
  // Creating opens the new record, on the page or as a link.
  await expect(page.getByRole('heading', { level: 1, name: 'Tanvi Kapoor' })).toBeVisible();
  await page.context().close();

  const directory = await pageAs(browser, 'analyst', { viewport });
  await directory.goto('/employees');
  await expect(directory.getByRole('link').filter({ hasText: /\w+ \w+/ }).first()).toBeVisible();
  await settled(directory);
  await expect(directory.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
  await expect(directory.getByRole('columnheader', { name: 'Branch' })).toHaveCount(0);
  await directory.context().close();
});

test('payroll: run, masked until shown, approved, finalized, payslip revealed and downloaded as PDF', async ({ browser, viewport, playwright }, info) => {
  test.slow();
  const period = lastMonths(info.project.name === 'desktop' ? 1 : 2);
  const page = await pageAs(browser, 'payroll', { viewport });

  // A run must be computed on locked attendance: set up through the API.
  const api = await playwright.request.newContext({ baseURL: `http://localhost:${process.env.E2E_WEB_PORT ?? 4311}` });
  const { headers } = await apiAs(api, 'payroll');
  const org = (await (await api.get('/api/v1/org')).json()) as { legalEntities: { id: string; name: string }[] };
  const [y, m] = period.split('-').map(Number) as [number, number];
  const lock = await api.post('/api/v1/attendance/locks', { headers, data: { periodStart: `${period}-01`, periodEnd: `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` } });
  expect([200, 201, 409]).toContain(lock.status());


  await page.goto('/payroll');
  await page.getByRole('button', { name: 'New run' }).click();
  const create = page.getByRole('dialog', { name: 'New payroll run' });
  await create.getByLabel('Month').fill(period);
  await create.getByLabel('Legal entity').selectOption(org.legalEntities[0]!.id);
  await create.getByRole('button', { name: 'Create' }).click();
  const run = page.getByRole('dialog', { name: new RegExp(`Payroll ${period}`) });
  await expect(run).toBeVisible();
  await run.getByRole('button', { name: 'Compute' }).click();
  await expect(run.getByText(/DM-\d+/).first()).toBeVisible();
  await settled(page);

  // Masked by default: no figure on screen until someone asks, and asking is on the record.
  await expect(run.getByLabel('Totals').getByText('Hidden').first()).toBeVisible();
  const reveal = page.waitForRequest((r) => r.url().includes('reveal=1'));
  await run.getByRole('button', { name: 'Show amounts' }).click();
  await reveal;
  await expect(run.getByRole('button', { name: 'Hide amounts' })).toBeVisible();
  await expect(run.getByLabel('Totals').getByText(/₹/).first()).toBeVisible();
  await expectNoAxeViolations(page, 'payroll run');

  const ack = run.getByRole('button', { name: /^Acknowledge \d+ warning/ });
  if (await ack.isVisible()) {
    await ack.click();
    const dlg = page.getByRole('dialog', { name: 'Acknowledge warnings' });
    await dlg.getByRole('textbox').fill('Reviewed for the end-to-end test');
    await dlg.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(dlg).toHaveCount(0);
  }
  await run.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(run.getByText('Pending').first()).toBeVisible();
  await page.context().close();

  // Someone else approves: whoever computes a run cannot.
  const approver = await pageAs(browser, 'admin', { viewport });
  await approver.goto('/approvals');
  const row = approver.getByRole('row').filter({ hasText: period }).or(approver.getByRole('listitem').filter({ hasText: period }));
  await row.getByRole('button', { name: 'Approve' }).first().click();
  const decide = approver.getByRole('dialog', { name: 'Approve request' });
  await decide.getByRole('button', { name: 'Approve' }).click();
  await expect(decide).toHaveCount(0);
  await approver.context().close();

  const back = await pageAs(browser, 'payroll', { viewport });
  await back.goto('/payroll');
  await back.getByRole('button', { name: period }).first().click();
  const again = back.getByRole('dialog', { name: new RegExp(`Payroll ${period}`) });
  await again.getByRole('button', { name: 'Finalize' }).click();
  await back.getByRole('dialog', { name: 'Finalize payroll' }).getByRole('button', { name: 'Finalize' }).click();
  await expect(again.getByText('Finalized').first()).toBeVisible();
  await expect(again.getByRole('button', { name: 'Bank CSV' })).toBeVisible();
  await expect(again.getByRole('button', { name: /Bank file for released pay/ })).toHaveCount(0);
  await back.context().close();

  // The employee's payslip: hidden, revealed, and the PDF comes down as a real PDF with no name in the file name.
  const me = await pageAs(browser, 'analyst', { viewport });
  await me.goto('/payslips');
  const show = me.getByRole('button', { name: `Show Net pay for ${period}` });
  await expect(show).toBeVisible();
  await show.click();
  await expect(me.getByRole('button', { name: `Hide Net pay for ${period}` })).toBeVisible();
  const download = me.waitForEvent('download');
  await me.getByRole('button', { name: `Download payslip for ${period} as PDF` }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^payslip-\d{4}-\d{2}\.pdf$/);
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await me.context().close();
  await api.dispose();
});

test('settings: idle sign-out, grades, company details and the audit chain', async ({ browser, viewport }) => {
  const page = await pageAs(browser, 'admin', { viewport });
  await page.goto('/settings/security');
  await expect(page.getByText(/idle/i).first()).toBeVisible();
  await expectNoAxeViolations(page, 'security settings');

  await page.goto('/settings/organization');
  const grades = page.getByRole('region', { name: 'Grades' });
  await grades.getByRole('button', { name: 'Add' }).click();
  const form = page.getByRole('dialog', { name: /grade/i });
  const code = `G${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await form.getByLabel('Code').fill(code);
  await form.getByLabel('Name').fill(`Grade ${code}`);
  await form.getByRole('button', { name: /Save|Add|Create/ }).click();
  await expect(grades.getByText(`Grade ${code}`)).toBeVisible();

  await page.goto('/settings/company');
  await page.getByRole('button', { name: 'Show bank details' }).click();
  await expect(page.getByRole('button', { name: 'Hide bank details' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const company = page.getByRole('dialog', { name: 'Edit company details' });
  await company.getByLabel('Registered address').fill(`1 Test Road ${code}`);
  await company.getByRole('button', { name: 'Save' }).click();
  await expect(company).toHaveCount(0);
  await expect(page.getByText(`1 Test Road ${code}`)).toBeVisible();

  await page.goto('/settings/audit-chain');
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByText(/The chain is intact/)).toBeVisible();
  await expectNoAxeViolations(page, 'audit chain');
  await page.context().close();
});

test('users: invite shows as pending, a link can be resent, and a salary level changes', async ({ browser, viewport }) => {
  const page = await pageAs(browser, 'admin', { viewport });
  const email = `added.${Date.now().toString(36)}@example.test`;
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Add user' }).click();
  const add = page.getByRole('dialog', { name: 'Add user' });
  await add.getByLabel('Email').fill(email);
  await add.getByLabel('Display name').fill('Added Person');
  await expect(add.getByLabel(/password/i)).toHaveCount(0);
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();
  await page.getByLabel('Search users').fill(email);
  const person = page.getByRole('row').filter({ hasText: email }).or(page.getByRole('listitem').filter({ hasText: email }));
  await expect(person.getByText('Invited')).toBeVisible();
  await person.getByRole('button', { name: 'Manage' }).click();
  const manage = page.getByRole('dialog', { name: /Manage Added Person/ });
  await manage.getByRole('button', { name: 'Send invitation again' }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`).first()).toBeVisible();
  await manage.getByLabel('Stored level').fill('5');
  await manage.getByRole('button', { name: 'Change level' }).click();
  await page.getByRole('dialog', { name: 'Change salary access level' }).getByRole('button', { name: 'Change level' }).click();
  await expect(page.getByText(/Salary level changed/)).toBeVisible();
  await page.context().close();
});

test('someone with a suggestion for two-factor is told, and nothing blocks them', async ({ browser, viewport }) => {
  const page = await pageAs(browser, 'payroll', { viewport });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Consider turning on two-factor/ })).toBeVisible();
  await page.context().close();
  expect(emailOf('payroll')).toContain('@');
});
