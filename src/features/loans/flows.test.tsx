import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MASK, formatMoney } from '../../components/Money';
import { fmtMonth, todayLocal } from '../../format';
import { Loans } from '../../pages/Loans';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';
import type { Loan, LoanDetailData } from './types';

const SELF = ['loans.self'];
const MANAGE = ['loans.read', 'loans.manage', 'loans.approve'];
const BOTH = ['FEATURE_LOANS', 'FEATURE_SALARY_ADVANCE'];
const loan = (over: Partial<Loan> = {}): Loan => ({ id: 'l1', employee_id: 'e9', employee_code: 'E9', name: 'Rohan Iyer', department: 'Ops', kind: 'loan', amount: '25000', installments: 6, installment_amount: '4167', first_period: '2026-11', skip_periods: [], purpose: 'Laptop', status: 'disbursed', outstanding: '20000', recorded_by_other: false, disbursed_at: null, disbursement_reference: null, ...over });
const detail = (over: Partial<LoanDetailData> = {}): LoanDetailData => ({ ...loan(), balance: { outstanding: '20000', inProgress: '1000', recovered: '4000' }, schedule: [{ period: '2026-11', amount: '4167' }], recoveries: [], ...over });
const paged = (items: Loan[]) => ({ items, page: 1, pageSize: 25, total: items.length });

const api = (items: Loan[], extra: Handler = () => undefined, one: LoanDetailData = detail()): Handler => (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if ((init.method ?? 'GET') !== 'GET') return { ok: true, closed: false, recomputePayroll: null };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
  if (/\/requests\/l\d/.test(url)) return one;
  return paged(items);
};

afterEach(() => vi.restoreAllMocks());

describe('tabs and wording', () => {
  it('someone without access is told so', async () => {
    mockPageApi([], BOTH, () => paged([]));
    showPage(<Loans />, '/loans');
    expect(await screen.findByText('You do not have access to this')).toBeTruthy();
  });
  it('names the empty list after the kinds this installation offers', async () => {
    mockPageApi(SELF, ['FEATURE_SALARY_ADVANCE'], api([]));
    showPage(<Loans />, '/loans');
    expect(await screen.findByText('You have no salary advances')).toBeTruthy();
    expect(screen.getByText('Apply for a salary advance when you need one.')).toBeTruthy();
  });
  it('both kinds on read as advances or loans', async () => {
    mockPageApi(SELF, BOTH, api([]));
    showPage(<Loans />, '/loans');
    expect(await screen.findByText('You have no advances or loans')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('My advances and loans');
  });
});

describe('my loans', () => {
  it('shows recovery, deferred months and who recorded it', async () => {
    mockPageApi(SELF, BOTH, api([loan({ employee_id: 'e1', skip_periods: ['2026-12'], recorded_by_other: true }), loan({ id: 'l2', employee_id: 'e1', status: 'pending', installment_amount: null, purpose: null, kind: 'salary_advance' })]));
    showPage(<Loans />, '/loans');
    const table = await screen.findByRole('table', { name: 'My advances and loans' });
    expect(within(table).getByText(`6 × ${formatMoney('4167')} from ${fmtMonth('2026-11')}`)).toBeTruthy();
    expect(within(table).getByText(`Deferred: ${fmtMonth('2026-12')}`)).toBeTruthy();
    expect(within(table).getByText('Recorded by payroll')).toBeTruthy();
    expect(within(table).getByText(`6 instalments from ${fmtMonth('2026-11')}`)).toBeTruthy();
    expect(within(table).getByText(formatMoney('20000'))).toBeTruthy();
    const pending = within(table).getByText('Salary advance').closest('tr')!;
    expect(within(pending).getByText('—')).toBeTruthy();
  });

  it('keeps masked amounts hidden until Show amounts, which asks with reveal=1', async () => {
    const hidden = loan({ employee_id: 'e1', amount: null, outstanding: null, installment_amount: null, masked: true, maskedFields: ['amount', 'outstanding', 'installment_amount'] });
    const shown = loan({ employee_id: 'e1' });
    const f = mockPageApi(SELF, BOTH, (url) => paged([url.includes('reveal=1') ? shown : hidden]));
    showPage(<Loans />, '/loans');
    const table = await screen.findByRole('table', { name: 'My advances and loans' });
    expect(within(table).getAllByText(MASK)).toHaveLength(2);
    expect(within(table).getAllByText('Hidden').length).toBe(2);
    expect(within(table).queryByText(formatMoney('25000'))).toBeNull();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(await screen.findByText(formatMoney('25000'))).toBeTruthy();
    expect(reads(f, 'scope=mine').some((c) => String(c[0]).includes('reveal=1'))).toBe(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide amounts' }));
    await waitFor(() => expect(screen.queryByText(formatMoney('25000'))).toBeNull());
    expect(screen.getAllByText(MASK).length).toBeGreaterThan(0);
  });

  it('withdraws a pending application, not naming a withheld amount', async () => {
    const f = mockPageApi(SELF, BOTH, api([loan({ employee_id: 'e1', status: 'pending', amount: null, kind: 'salary_advance' })]));
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw application' });
    expect(within(dlg).getByText('Withdraw your salary advance application?')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/requests/l1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Application withdrawn')).toBeTruthy();
  });

  it('applies: shows the plan with a smaller last instalment, and sends it', async () => {
    const f = mockPageApi(SELF, ['FEATURE_SALARY_ADVANCE'], api([]));
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    const dlg = await screen.findByRole('dialog', { name: 'Apply for a salary advance' });
    expect(within(dlg).queryByLabelText(/^Kind/)).toBeNull();
    fireEvent.change(within(dlg).getByLabelText(/^Amount/), { target: { value: '1000' } });
    expect(within(dlg).getByText(`1 monthly instalment of ${formatMoney(1000)}, deducted from salary.`)).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText(/^Instalments/), { target: { value: '3' } });
    expect(within(dlg).getByText(`3 monthly instalments of ${formatMoney(334)} (the last ${formatMoney(332)}), deducted from salary.`)).toBeTruthy();
    const month = `${Number(todayLocal().slice(0, 4)) + 1}-01`;
    fireEvent.change(within(dlg).getByLabelText(/^Recover from/), { target: { value: month } });
    await userEvent.type(within(dlg).getByLabelText(/^Purpose/), 'Medical');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/loans/requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/loans/requests')[0]!)).toEqual({ kind: 'salary_advance', amount: 1000, installments: 3, firstPeriod: month, purpose: 'Medical' });
    expect(await screen.findByText('Application sent for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('loan detail', () => {
  it('shows the balance, schedule and how each amount was recovered', async () => {
    const f = mockPageApi(SELF, BOTH, api([loan({ employee_id: 'e1' })], undefined, detail({ disbursement_reference: 'NEFT-1', disbursed_at: '2026-10-01T05:00:00Z', recoveries: [
      { id: 'x1', source: 'payroll', period: '2026-11', amount: '4167', reference: null, created_at: '2026-11-30T05:00:00Z', run_status: 'finalized', run_kind: 'regular' },
      { id: 'x2', source: 'payroll', period: '2026-12', amount: '100', reference: null, created_at: '2026-12-30T05:00:00Z', run_status: null, run_kind: 'fnf' },
      { id: 'x3', source: 'manual', period: null, amount: '500', reference: 'RCPT-1', created_at: '2026-12-01T05:00:00Z', run_status: null, run_kind: null },
    ] })));
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const dlg = await screen.findByRole('dialog', { name: `Loan — ${formatMoney('25000')}` });
    expect(await within(dlg).findByText(/NEFT-1/)).toBeTruthy();
    const balance = within(dlg).getByLabelText('Balance');
    expect(within(balance).getByText(formatMoney('20000'))).toBeTruthy();
    expect(within(balance).getByText(formatMoney('1000'))).toBeTruthy();
    expect(within(balance).getByText(formatMoney('4000'))).toBeTruthy();
    expect(within(within(dlg).getByRole('table', { name: 'Schedule' })).getByText(fmtMonth('2026-11'))).toBeTruthy();
    const recoveries = within(dlg).getByRole('table', { name: 'Recoveries' });
    expect(within(recoveries).getByText('Payroll · finalized')).toBeTruthy();
    expect(within(recoveries).getByText(/^Payroll \(full and final\)/)).toBeTruthy();
    expect(within(recoveries).getByText('Repaid · RCPT-1')).toBeTruthy();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps a masked balance and schedule hidden until Show details asks with reveal=1', async () => {
    const hidden = detail({ amount: null, installment_amount: null, balance: null, schedule: null, recoveries: null, masked: true, maskedFields: ['amount', 'installment_amount', 'balance', 'schedule', 'recoveries'] });
    const f = mockPageApi(SELF, BOTH, (url) => {
      if (url.includes('/requests/l1')) return url.includes('reveal=1') ? detail() : hidden;
      return paged([loan({ employee_id: 'e1' })]);
    });
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const dlg = await screen.findByRole('dialog', { name: 'Loan' });
    const balance = await within(dlg).findByLabelText('Balance');
    expect(within(balance).getAllByText('Hidden')).toHaveLength(3);
    expect(within(dlg).getByText('Hidden until you ask to see the details.')).toBeTruthy();
    expect(within(dlg).queryByRole('table', { name: 'Schedule' })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show details' }));
    expect(await within(dlg).findByRole('table', { name: 'Schedule' })).toBeTruthy();
    expect(reads(f, '/requests/l1?reveal=1').length).toBeGreaterThan(0);
  });
});

describe('everyone', () => {
  const other = (over: Partial<Loan> = {}) => loan(over);

  it('filters reach the server, and an empty result says it is the filters', async () => {
    const f = mockPageApi(MANAGE, BOTH, api([]));
    showPage(<Loans />, '/loans?tab=all');
    expect(await screen.findByText('Nothing here yet')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'salary_advance');
    expect(await screen.findByText('Nothing matches these filters')).toBeTruthy();
    await waitFor(() => expect(reads(f, 'scope=all&status=approved&kind=salary_advance').length).toBeGreaterThan(0));
  });

  it('read access gets no actions, and masked amounts stay hidden until asked', async () => {
    const f = mockPageApi(['loans.read'], BOTH, (url) => paged([url.includes('reveal=1') ? other() : other({ amount: null, outstanding: null, installment_amount: null, masked: true, maskedFields: ['amount', 'outstanding'] })]));
    showPage(<Loans />, '/loans?tab=all');
    const table = await screen.findByRole('table', { name: 'Advances and loans' });
    expect(within(table).getAllByText(MASK)).toHaveLength(2);
    for (const name of ['Repayment', 'Defer a month', 'Disburse', 'Cancel']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record for an employee' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(await screen.findByText(formatMoney('25000'))).toBeTruthy();
    expect(reads(f, 'reveal=1').length).toBeGreaterThan(0);
  });

  it('records for an employee: the person is required, then posted', async () => {
    const f = mockPageApi(MANAGE, BOTH, api([]));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Record for an employee' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record an advance or loan for an employee' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Kind/), 'loan');
    fireEvent.change(within(dlg).getByLabelText(/^Amount/), { target: { value: '500' } });
    await userEvent.type(within(dlg).getByLabelText(/^Purpose/), 'Medical');
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/loans/requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/loans/requests')[0]!)).toMatchObject({ kind: 'loan', amount: 500, employeeId: 'e9' });
    expect(reads(f, '/api/v1/employees').some((c) => String(c[0]).includes('status=active'))).toBe(true);
    expect(await screen.findByText('Recorded; sent to the manager and finance for approval')).toBeTruthy();
  });

  it('disburses an approved loan with a reference; refusal keeps it', async () => {
    let refuse = true;
    const f = mockPageApi(MANAGE, BOTH, api([other({ status: 'approved', outstanding: null })], (url) => {
      if (!url.endsWith('/disburse')) return undefined;
      if (refuse) { refuse = false; return problem(409, 'Reference already used'); }
      return { ok: true };
    }));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Disburse' }));
    const dlg = await screen.findByRole('dialog', { name: 'Disburse' });
    expect(within(dlg).getByText(new RegExp(`Pay ${formatMoney('25000')} to Rohan Iyer`))).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Payment reference/), 'NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Disburse' }));
    expect(await within(dlg).findByText('Reference already used')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Payment reference/) as HTMLInputElement).value).toBe('NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Disburse' }));
    await waitFor(() => expect(writes(f, '/requests/l1/disburse')).toHaveLength(2));
    expect(bodyOf(writes(f, '/requests/l1/disburse')[1]!)).toEqual({ reference: 'NEFT-1' });
    expect(await screen.findByText('Recorded as paid; recovery starts in payroll')).toBeTruthy();
  });

  it('a masked amount is not named when disbursing', async () => {
    mockPageApi(MANAGE, BOTH, api([other({ status: 'approved', amount: null, installment_amount: null, masked: true, maskedFields: ['amount'] })]));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Disburse' }));
    const dlg = await screen.findByRole('dialog', { name: 'Disburse' });
    expect(within(dlg).getByText(/Pay the approved amount to Rohan Iyer/)).toBeTruthy();
  });

  it('refuses a repayment above what is outstanding, then records it', async () => {
    const f = mockPageApi(MANAGE, BOTH, api([other()]));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Repayment' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record a repayment' });
    expect(within(dlg).getByText(`Rohan Iyer has ${formatMoney('20000')} outstanding.`)).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText(/^Amount/), { target: { value: '20001' } });
    await userEvent.type(within(dlg).getByLabelText(/^Reference/), 'RCPT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record a repayment' }));
    expect(await within(dlg).findByText(`Only ${formatMoney('20000')} is outstanding`)).toBeTruthy();
    expect(writes(f, '/repayment')).toHaveLength(0);
    fireEvent.change(within(dlg).getByLabelText(/^Amount/), { target: { value: '100' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record a repayment' }));
    await waitFor(() => expect(writes(f, '/requests/l1/repayment')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/l1/repayment')[0]!)).toEqual({ amount: 100, reference: 'RCPT-1' });
    expect(await screen.findByText('Repayment recorded')).toBeTruthy();
  });

  it('says when a repayment closes the loan; a withheld balance leaves the check to the server', async () => {
    const f = mockPageApi(MANAGE, BOTH, api([other({ outstanding: null, masked: true, maskedFields: ['outstanding'] })], (url) => (url.endsWith('/repayment') ? { closed: true } : undefined)));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Repayment' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record a repayment' });
    expect(within(dlg).queryByText(/outstanding\./)).toBeNull();
    fireEvent.change(within(dlg).getByLabelText(/^Amount/), { target: { value: '99999' } });
    await userEvent.type(within(dlg).getByLabelText(/^Reference/), 'RCPT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record a repayment' }));
    await waitFor(() => expect(writes(f, '/repayment')).toHaveLength(1));
    expect(await screen.findByText('Repaid in full; closed')).toBeTruthy();
  });

  it('defers a month, and says which payroll run to recompute', async () => {
    const period = `${Number(todayLocal().slice(0, 4)) + 1}-02`;
    const f = mockPageApi(MANAGE, BOTH, api([other()], (url) => (url.endsWith('/defer') ? { recomputePayroll: period } : undefined)));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Defer a month' }));
    const dlg = await screen.findByRole('dialog', { name: 'Defer an instalment' });
    fireEvent.change(within(dlg).getByLabelText(/^Month/), { target: { value: period } });
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Medical');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Defer an instalment' }));
    await waitFor(() => expect(writes(f, '/requests/l1/defer')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/l1/defer')[0]!)).toEqual({ period, reason: 'Medical' });
    expect(await screen.findByText(`Deferred. Recompute the ${period} payroll run.`)).toBeTruthy();
  });

  it('a plain deferral says only that; a refusal stays open', async () => {
    let refuse = true;
    const period = `${Number(todayLocal().slice(0, 4)) + 1}-02`;
    mockPageApi(MANAGE, BOTH, api([other({ status: 'approved' })], (url) => {
      if (!url.endsWith('/defer')) return undefined;
      if (refuse) { refuse = false; return problem(409, 'Already deferred'); }
      return { recomputePayroll: null };
    }));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Defer a month' }));
    const dlg = await screen.findByRole('dialog', { name: 'Defer an instalment' });
    fireEvent.change(within(dlg).getByLabelText(/^Month/), { target: { value: period } });
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Medical');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Defer an instalment' }));
    expect(await within(dlg).findByText('Already deferred')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Defer an instalment' }));
    expect(await screen.findByText('Deferred')).toBeTruthy();
  });

  it('cancels an approved loan with a reason of at least three letters', async () => {
    const f = mockPageApi(['loans.approve'], BOTH, api([other({ status: 'approved', kind: 'salary_advance' })]));
    showPage(<Loans />, '/loans?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel approved application' });
    expect(within(dlg).getByText(new RegExp(`Cancel Rohan Iyer's salary advance of ${formatMoney('25000')}`))).toBeTruthy();
    const confirm = within(dlg).getByRole('button', { name: 'Cancel application' }) as HTMLButtonElement;
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'No');
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'pe');
    await userEvent.click(confirm);
    await waitFor(() => expect(writes(f, '/requests/l1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/l1/cancel')[0]!)).toEqual({ reason: 'Nope' });
    expect(await screen.findByText('Cancelled', { ignore: 'option' })).toBeTruthy();
  });
});
