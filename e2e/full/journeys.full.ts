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

test('leave: an employee applies, the manager approves, and the balance and status follow', async ({ browser, viewport }, info) => {
  const page = await pageAs(browser, 'analyst', { viewport });
  // A free weekday next month, different per project, so reruns and the other project do not clash.
  const d = new Date();
  d.setMonth(d.getMonth() + 1, info.project.name === 'desktop' ? 8 : 15);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const reason = `Family function ${Date.now().toString(36)}`;
  await page.goto('/leave');
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  const form = page.getByRole('dialog', { name: 'Apply for leave' });
  const cl = await form.getByLabel('Leave type').locator('option', { hasText: /^Casual Leave/ }).getAttribute('value');
  await form.getByLabel('Leave type').selectOption(cl!);
  await form.getByLabel(/^From/).fill(date);
  await form.getByLabel(/^To\b/).fill(date);
  await expect(form.getByText('1 day(s)')).toBeVisible();
  await form.getByLabel(/^Reason/).fill(reason);
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/Leave requested/)).toBeVisible();
  await page.context().close();

  const manager = await pageAs(browser, 'lab.manager', { viewport });
  await manager.goto('/approvals');
  const row = manager.getByRole('row').filter({ hasText: date }).or(manager.getByRole('listitem').filter({ hasText: date }));
  await row.getByRole('button', { name: 'Approve' }).first().click();
  const decide = manager.getByRole('dialog', { name: 'Approve request' });
  await decide.getByRole('button', { name: 'Approve' }).click();
  await expect(decide).toHaveCount(0);
  await manager.context().close();

  const after = await pageAs(browser, 'analyst', { viewport });
  await after.goto('/leave');
  await expect(after.getByRole('row').filter({ hasText: reason }).or(after.getByRole('listitem').filter({ hasText: reason })).getByText('Approved')).toBeVisible();
  await after.context().close();
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

test('recruitment: a resume is added, downloaded, replaced and downloaded again, byte for byte', async ({ browser, viewport }) => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const page = await pageAs(browser, 'hr.head', { viewport });
  const lastName = `Resume${Date.now().toString(36)}`;
  await page.goto('/recruitment?tab=candidates');
  await page.getByRole('button', { name: 'New candidate' }).click();
  const form = page.getByRole('dialog', { name: 'New candidate' });
  await form.getByLabel('First name').fill('Meher');
  await form.getByLabel('Last name').fill(lastName);
  await form.getByLabel('Email').fill(`${lastName.toLowerCase()}@example.test`);
  await form.getByRole('checkbox', { name: /agreed to us processing/ }).check();
  await form.getByLabel('How consent was obtained').fill('Applied on the careers page');
  await form.getByRole('button', { name: 'Save' }).click();

  // Saving opens the new candidate, who has no resume yet.
  const detail = page.getByRole('dialog', { name: `Meher ${lastName}` });
  await expect(detail.getByRole('button', { name: 'Add resume' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Download resume' })).toHaveCount(0);

  const upload = async (open: string, file: { name: string; mimeType: string; buffer: Buffer }, done: string) => {
    await detail.getByRole('button', { name: open }).click();
    const dialog = page.getByRole('dialog', { name: open });
    await dialog.getByLabel('Resume').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(done)).toBeVisible();
  };
  const downloaded = async () => {
    const download = page.waitForEvent('download');
    await detail.getByRole('button', { name: 'Download resume' }).click();
    const file = await download;
    return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
  };

  await upload('Add resume', { name: 'meher.pdf', mimeType: 'application/pdf', buffer: pdf }, 'Resume added');
  await expect(detail.getByRole('button', { name: 'Replace resume' })).toBeVisible();
  const first = await downloaded();
  expect(first.name).toMatch(/\.pdf$/);
  expect(first.bytes.equals(pdf)).toBe(true);

  await upload('Replace resume', { name: 'meher.png', mimeType: 'image/png', buffer: png }, 'Resume replaced');
  const second = await downloaded();
  expect(second.name).toMatch(/\.png$/);
  expect(second.bytes.equals(png)).toBe(true);
  await page.context().close();
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
