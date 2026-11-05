import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Payroll } from '../../pages/Payroll';
import { Payslips } from '../../pages/Payslips';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';


const FLAGS = ['FEATURE_PAYROLL', 'FEATURE_PAYROLL_STATUTORY'];
const MANAGE = ['payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory'];
const item = (over: object = {}) => ({ id: 'i1', employee_id: 'e9', employee_code: 'E9', employee_name: 'Rohan Iyer', employed_days: 31, lop_days: 0, paid_days: 31, gross: 1000, deductions: 100, net: 900, employer_cost: 1100, warnings: [], hold: false, lines: [], ...over });
const RUN = { id: 'p1', period: '2026-01', legal_entity_name: 'Co', kind: 'regular', status: 'computed', warnings: 0, warnings_acknowledged: false, totals: { employees: 1, gross: 1000, net: 900, employerCost: 1100 }, computed_at: '2026-02-01T05:00:00Z', computed_by: 'someone', items: [item()], adjustments: [], attendanceLocked: true, employee_id: null, employee_name: null, released_count: 0, page: 1, pageSize: 200, total: 1 };

const runApi = (run: object, extra?: Handler): Handler => (url, init) => {
  const x = extra?.(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/runs/p1')) return run;
  if (url.includes('/payroll/runs')) return { items: [run], page: 1, pageSize: 200, total: 1 };
  if (url.endsWith('/org')) return { legalEntities: [{ id: 'l1', name: 'Co' }], branches: [], departments: [] };
  return { items: [] };
};
const openRun = async (run: object, extra?: Handler, permissions: readonly string[] = MANAGE) => {
  const f = mockPageApi(permissions, FLAGS, runApi(run, extra));
  showPage(<Payroll />, '/payroll?tab=runs');
  await userEvent.click(await screen.findByRole('button', { name: /2026-01/ }));
  await screen.findByRole('dialog', { name: /Payroll 2026-01/ });
  return f;
};

describe('payroll page', () => {
  it('without any payroll permission says so and loads nothing', async () => {
    const f = mockPageApi([], FLAGS, () => ({ items: [] }));
    showPage(<Payroll />, '/payroll');
    expect(await screen.findByText('You do not have access to payroll')).toBeTruthy();
    expect(reads(f, '/payroll/')).toHaveLength(0);
  });
  it('an approver sees only runs', async () => {
    mockPageApi(['payroll.approve'], FLAGS, runApi(RUN));
    showPage(<Payroll />, '/payroll');
    expect(await screen.findByRole('button', { name: /2026-01/ })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('runs list', () => {
  it('filters on status and search, shows masked totals, and clears', async () => {
    const other = { ...RUN, id: 'p2', period: '2025-12', status: 'finalized', kind: 'fnf', employee_name: 'Kim', warnings: 2, warnings_acknowledged: true };
    const masked = { ...RUN, id: 'p3', period: '2025-11', status: 'draft', totals: null, masked: true, maskedFields: ['totals'], warnings: 3 };
    mockPageApi(MANAGE, FLAGS, () => ({ items: [RUN, other, masked], page: 1, pageSize: 200, total: 9 }));
    showPage(<Payroll />, '/payroll?tab=runs');
    expect(await screen.findByText('F&F · Kim')).toBeTruthy();
    expect(screen.getByText('2 acknowledged')).toBeTruthy();
    expect(screen.getByText('Showing the latest 3 of 9 runs.')).toBeTruthy();
    expect(screen.getAllByText('Hidden').length).toBe(3);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'finalized');
    await waitFor(() => expect(screen.queryByRole('button', { name: /2026-01/ })).toBeNull());
    expect(screen.getByRole('button', { name: /2025-12/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('button', { name: /2026-01/ })).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search runs'), 'nobody');
    expect(await screen.findByText('No runs match these filters')).toBeTruthy();
  });
  it('an empty list says what to set up first', async () => {
    mockPageApi(MANAGE, FLAGS, () => ({ items: [], page: 1, pageSize: 200, total: 0 }));
    showPage(<Payroll />, '/payroll?tab=runs');
    expect(await screen.findByText('No payroll runs yet')).toBeTruthy();
  });
  it('creating a regular run posts month and entity, then opens it', async () => {
    const f = mockPageApi(MANAGE, FLAGS, runApi(RUN, (url, init) => (url.endsWith('/payroll/runs') && init.method === 'POST' ? { id: 'p1' } : undefined)));
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: 'New run' }));
    const dlg = await screen.findByRole('dialog', { name: 'New payroll run' });
    fireEvent.change(within(dlg).getByLabelText(/^Month/), { target: { value: '2026-01' } });
    await userEvent.selectOptions(within(dlg).getByLabelText(/Legal entity/), await within(dlg).findByRole('option', { name: 'Co' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes(f, '/payroll/runs')).toHaveLength(1));
    expect(bodyOf(writes(f, '/payroll/runs')[0]!)).toEqual({ period: '2026-01', legalEntityId: 'l1', kind: 'regular' });
    await screen.findByRole('dialog', { name: /Payroll 2026-01/ });
    expect(screen.queryByRole('dialog', { name: 'New payroll run' })).toBeNull();
  });
});

describe('run detail', () => {
  it('asks to compute a draft, and says why there are no people yet', async () => {
    const f = await openRun({ ...RUN, status: 'draft', computed_at: null, items: [], totals: null, total: 0 });
    expect(await screen.findByText('Compute the run to see employees')).toBeTruthy();
    expect(screen.getByText('Not computed')).toBeTruthy();
    expect(within(screen.getByRole('dialog', { name: /Payroll 2026-01/ })).queryByRole('button', { name: 'Show amounts' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Compute' }));
    await waitFor(() => expect(writes(f, '/runs/p1/compute')).toHaveLength(1));
    expect(await screen.findByText('Computed')).toBeTruthy();
  });
  it('a computed run with no one in it says why', async () => {
    await openRun({ ...RUN, items: [] });
    expect(await screen.findByText('No employees with an active salary in this entity')).toBeTruthy();
  });
  it('warnings hold submission until they are acknowledged', async () => {
    const f = await openRun({ ...RUN, warnings: 2, items: [item({ warnings: ['No PAN', 'No UAN'] }), item({ id: 'i2', employee_id: 'e8', employee_name: 'Kim', warnings: ['No PAN'] })] });
    expect(await screen.findByText('Acknowledge the 2 warning(s) before submitting for approval.')).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
    expect(screen.getByText('1 warning')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Acknowledge 2/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Acknowledge warnings' });
    expect((within(dlg).getByRole('button', { name: 'Acknowledge' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dlg).getByRole('textbox'), 'Reviewed all');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(writes(f, '/acknowledge-warnings')).toHaveLength(1));
    expect(bodyOf(writes(f, '/acknowledge-warnings')[0]!)).toEqual({ note: 'Reviewed all' });
    expect(await screen.findByText('Acknowledged')).toBeTruthy();
  });
  it('a clean computed run recomputes and submits', async () => {
    const f = await openRun(RUN);
    await userEvent.click(await screen.findByRole('button', { name: 'Recompute' }));
    await waitFor(() => expect(writes(f, '/runs/p1/compute')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/runs/p1/submit')).toHaveLength(1));
    expect(await screen.findByText('Sent for approval')).toBeTruthy();
  });
  it('a refused compute shows the reason', async () => {
    await openRun(RUN, (url) => (url.endsWith('/compute') ? problem(409, 'Attendance has gaps') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Recompute' }));
    expect(await screen.findByText('Attendance has gaps')).toBeTruthy();
  });
  it('a pending run sends an approver to Approvals and offers a manager nothing else', async () => {
    await openRun({ ...RUN, status: 'pending' });
    expect((await screen.findByRole('link', { name: 'Review in Approvals' })).getAttribute('href')).toBe('/approvals');
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
  });
  it('finalizing warns that it cannot be undone and posts', async () => {
    const f = await openRun({ ...RUN, status: 'approved' });
    await userEvent.click(await screen.findByRole('button', { name: 'Finalize' }));
    const dlg = await screen.findByRole('dialog', { name: 'Finalize payroll' });
    expect(within(dlg).getByText(/It cannot be undone/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Finalize' }));
    await waitFor(() => expect(writes(f, '/runs/p1/finalize')).toHaveLength(1));
    expect(await screen.findByText('Finalized; payslips published')).toBeTruthy();
  });
  it('cancelling discards the run after asking', async () => {
    const f = await openRun(RUN);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel payroll run' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel run' }));
    await waitFor(() => expect(writes(f, '/runs/p1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Cancelled')).toBeTruthy();
  });
  it('marking paid sends the reference', async () => {
    const f = await openRun({ ...RUN, status: 'finalized' });
    await userEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record payment' });
    await userEvent.type(within(dlg).getByRole('textbox'), 'NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark paid' }));
    await waitFor(() => expect(writes(f, '/runs/p1/paid')).toHaveLength(1));
    expect(bodyOf(writes(f, '/runs/p1/paid')[0]!)).toEqual({ paymentReference: 'NEFT-1' });
    expect(await screen.findByText('Marked paid')).toBeTruthy();
  });
  it('tells someone people above their salary level are left out', async () => {
    await openRun({ ...RUN, excluded: 1 });
    expect(await screen.findByText(/1 person is above your salary level/)).toBeTruthy();
  });
  it('and in the plural', async () => {
    await openRun({ ...RUN, excluded: 3 });
    expect(await screen.findByText(/3 people are above your salary level/)).toBeTruthy();
  });
  it('masked amounts stay hidden until reveal, and reveal asks with reveal=1', async () => {
    const hidden = { ...RUN, totals: { employees: 1 }, masked: true, maskedFields: ['totals'], items: [item({ gross: null, deductions: null, net: null, masked: true, maskedFields: ['gross', 'deductions', 'net'], hold: false })] };
    const f = mockPageApi(MANAGE, FLAGS, runApi(hidden, (url, init) => (url.includes('/runs/p1') && url.includes('reveal=1') && (init.method ?? 'GET') === 'GET' ? RUN : undefined)));
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: /2026-01/ }));
    const dlg = await screen.findByRole('dialog', { name: /Payroll 2026-01/ });
    await within(dlg).findByRole('button', { name: 'Show amounts' });
    expect(within(dlg).queryByText(/900/)).toBeNull();
    expect(reads(f, '/runs/p1').filter((c) => String(c[0]).includes('reveal=1'))).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show amounts' }));
    await waitFor(() => expect(reads(f, '/runs/p1').filter((c) => String(c[0]).includes('reveal=1')).length).toBeGreaterThan(0));
    expect((await within(dlg).findAllByText(/900/)).length).toBeGreaterThan(0);
    expect(within(dlg).getByRole('button', { name: 'Hide amounts' })).toBeTruthy();
  });
  it('lines open for a person, grouped into earnings, deductions and employer contributions', async () => {
    await openRun({ ...RUN, items: [item({ lop_days: 2, lines: [{ kind: 'earning', name: 'Basic', amount: 1000, basis: '31 days' }, { kind: 'deduction', name: 'PF', amount: 100 }, { kind: 'employer', name: 'Employer PF', amount: 120 }] })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Lines for Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Rohan Iyer — lines' });
    expect(within(dlg).getByText('Earnings')).toBeTruthy();
    expect(within(dlg).getByText('Basic')).toBeTruthy();
    expect(within(dlg).getByText('31 days')).toBeTruthy();
    expect(within(dlg).getByText('Deductions')).toBeTruthy();
    expect(within(dlg).getByText(/Employer contributions: Employer PF/)).toBeTruthy();
    expect(within(dlg).getByText(/Net pay/).textContent).toMatch(/900/);
  });
  it('no employer contributions line when there are none', async () => {
    await openRun({ ...RUN, items: [item({ lines: [{ kind: 'earning', name: 'Basic', amount: 1000 }] })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Lines for Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Rohan Iyer — lines' });
    expect(within(dlg).queryByText(/Employer contributions/)).toBeNull();
  });
  it('an item on hold can be taken off hold and the undo puts it back', async () => {
    const f = await openRun({ ...RUN, items: [item({ hold: true })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Take off hold: Rohan Iyer' }));
    await waitFor(() => expect(writes(f, '/runs/p1/hold')).toHaveLength(1));
    expect(bodyOf(writes(f, '/runs/p1/hold')[0]!)).toEqual({ employeeId: 'e9', hold: false });
    expect(await screen.findByText('Rohan Iyer is off hold')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/runs/p1/hold')).toHaveLength(2));
    expect(bodyOf(writes(f, '/runs/p1/hold')[1]!)).toEqual({ employeeId: 'e9', hold: true });
    expect(await screen.findByText('Back on hold')).toBeTruthy();
  });
  it('a negative net cannot be held', async () => {
    await openRun({ ...RUN, items: [item({ net: -50 })] });
    await screen.findByRole('button', { name: 'Adjust Rohan Iyer' });
    expect(screen.queryByRole('button', { name: /Hold pay/ })).toBeNull();
  });
  it('searches and pages people on the screen once there are many', async () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `i${i}`, employee_id: `e${i}`, employee_code: `C${i}`, employee_name: `Person ${String(i).padStart(2, '0')}` }));
    await openRun({ ...RUN, items: many, total: 30 });
    expect(await screen.findByText('Person 00')).toBeTruthy();
    expect(screen.queryByText('Person 29')).toBeNull();
    await userEvent.type(screen.getByLabelText('Search employees in this run'), 'Person 29');
    expect(await screen.findByText('Person 29')).toBeTruthy();
    expect(screen.queryByText('Person 00')).toBeNull();
    await userEvent.clear(screen.getByLabelText('Search employees in this run'));
    await userEvent.type(screen.getByLabelText('Search employees in this run'), 'zzz');
    expect(await screen.findByText('No one matches')).toBeTruthy();
  });
  it('moves through a very large run from the server, two hundred at a time', async () => {
    const f = mockPageApi(MANAGE, FLAGS, (url) => {
      if (url.includes('/runs/p1')) return { ...RUN, total: 450, page: url.includes('page=2') ? 2 : 1 };
      return { items: [RUN], page: 1, pageSize: 200, total: 1 };
    });
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: /2026-01/ }));
    expect(await screen.findByText('Showing 1 to 200 of 450 people.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Previous 200' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next 200' }));
    expect(await screen.findByText('Showing 201 to 400 of 450 people.')).toBeTruthy();
    expect(reads(f, '/runs/p1?page=2&pageSize=200').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Previous 200' }));
    expect(await screen.findByText('Showing 1 to 200 of 450 people.')).toBeTruthy();
  });
  it('closed runs download the bank and statutory files; a failed file says why', async () => {
    await openRun({ ...RUN, status: 'finalized' }, (url) => (url.endsWith('/bank.csv') ? problem(409, 'Bank details missing for 2 people') : undefined));
    expect(await screen.findByRole('button', { name: 'PF CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ESI CSV' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Bank CSV' }));
    expect(await screen.findByText('Bank details missing for 2 people')).toBeTruthy();
  });
  it('an open run has no bank file', async () => {
    await openRun(RUN);
    expect(await screen.findByRole('button', { name: 'Register CSV' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bank CSV' })).toBeNull();
  });
  it('a full and final run shows the leaver suggestions and adds for them; masked salary is hidden', async () => {
    const f = await openRun({ ...RUN, kind: 'fnf', employee_id: 'e9', employee_name: 'Rohan Iyer' }, (url) => {
      if (url.includes('/fnf-suggestions/e9')) return { lastWorkingDay: '2026-01-20', kind: 'resignation', noticeShortfallDays: 0, shortfallWaived: true, leaveYear: 2026, leaveBalances: [], salary: null, masked: true, maskedFields: ['salary'], note: 'Enter confirmed amounts.', period: '2026-01', today: '2026-02-01' };
      return undefined;
    });
    expect(await screen.findByText('F&F')).toBeTruthy();
    expect(await screen.findByText('Waived')).toBeTruthy();
    expect(screen.getByText('No leave balances.')).toBeTruthy();
    expect(screen.getByText('Enter confirmed amounts.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add adjustment' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjustment — Rohan Iyer' });
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '50');
    await userEvent.type(within(dlg).getByLabelText(/^Label/), 'Notice');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/runs/p1/adjustments')).toHaveLength(1));
    expect(bodyOf(writes(f, '/runs/p1/adjustments')[0]!)).toMatchObject({ employeeId: 'e9', kind: 'earning', label: 'Notice', amount: 50, taxable: true, note: null });
  });
});

describe('adjustments', () => {
  const ADJ = { id: 'a1', employee_id: 'e9', kind: 'earning', label: 'Arrears', amount: 500, taxable: false, note: 'Q1', created_by_name: 'Kim' };
  it('rejects zero and negative amounts at the field, and holds the request', async () => {
    const f = await openRun(RUN);
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjustment — Rohan Iyer' });
    await userEvent.type(within(dlg).getByLabelText(/^Label/), 'Arrears');
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '0');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Enter an amount')).toBeTruthy();
    await userEvent.clear(within(dlg).getByLabelText(/^Amount/));
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '-5');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Amounts are positive. Choose earning or deduction.')).toBeTruthy();
    expect(writes(f, '/adjustments')).toHaveLength(0);
  });
  it('a days correction may be negative, has no taxable box, and sends the note', async () => {
    const f = await openRun(RUN);
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjustment — Rohan Iyer' });
    await userEvent.selectOptions(within(dlg).getByLabelText('Kind'), 'lop_days');
    expect(within(dlg).queryByRole('checkbox', { name: 'Taxable' })).toBeNull();
    await userEvent.type(within(dlg).getByLabelText(/^Label/), 'Fix');
    await userEvent.type(within(dlg).getByLabelText(/^Note/), 'Late mark');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(writes(f, '/adjustments')).toHaveLength(0);
    await userEvent.type(within(dlg).getByLabelText(/^Days/), '0');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Enter the days to add or remove')).toBeTruthy();
    await userEvent.clear(within(dlg).getByLabelText(/^Days/));
    await userEvent.type(within(dlg).getByLabelText(/^Days/), '-1.5');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/adjustments')).toHaveLength(1));
    expect(bodyOf(writes(f, '/adjustments')[0]!)).toEqual({ employeeId: 'e9', kind: 'lop_days', label: 'Fix', amount: -1.5, taxable: true, note: 'Late mark' });
    expect(await screen.findByText('Added. Recompute the run.')).toBeTruthy();
  });
  it('an earning can be marked not taxable, and a refusal stays open', async () => {
    const f = await openRun(RUN, (url, init) => (url.endsWith('/adjustments') && init.method === 'POST' ? problem(422, 'Label already used') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjustment — Rohan Iyer' });
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Taxable' }));
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '10');
    await userEvent.type(within(dlg).getByLabelText(/^Label/), 'Gift');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Label already used');
    expect(bodyOf(writes(f, '/adjustments')[0]!)).toMatchObject({ taxable: false, label: 'Gift', amount: 10 });
  });
  it('lists adjustments by kind, including masked ones, with the person they belong to', async () => {
    await openRun({ ...RUN, adjustments: [ADJ, { ...ADJ, id: 'a2', kind: 'deduction', label: 'Recovery', amount: null, note: null, masked: true, maskedFields: ['amount'], employee_id: 'gone' }, { ...ADJ, id: 'a3', kind: 'lop_days', label: 'Days', amount: 2, note: null }] });
    const table = await screen.findByRole('table', { name: 'Adjustments' });
    expect(within(table).getByText('Arrears')).toBeTruthy();
    expect(within(table).getByText('Q1')).toBeTruthy();
    expect(within(table).getByText('Earning')).toBeTruthy();
    expect(within(table).getByText('Deduction')).toBeTruthy();
    expect(within(table).getByText('LOP days')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    expect(within(table).getByText('Hidden')).toBeTruthy();
    expect(within(table).getByText('2')).toBeTruthy();
  });
  it('removing one can be undone, posting the same values again', async () => {
    const f = await openRun({ ...RUN, adjustments: [ADJ] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Arrears' }));
    await waitFor(() => expect(writes(f, '/runs/p1/adjustments/a1')).toHaveLength(1));
    expect((writes(f, '/runs/p1/adjustments/a1')[0]![1] as RequestInit).method).toBe('DELETE');
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/runs/p1/adjustments').filter((c) => (c[1] as RequestInit).method === 'POST')).toHaveLength(1));
    const posted = writes(f, '/runs/p1/adjustments').find((c) => (c[1] as RequestInit).method === 'POST')!;
    expect(bodyOf(posted)).toEqual({ employeeId: 'e9', kind: 'earning', label: 'Arrears', amount: 500, taxable: false, note: 'Q1' });
    expect(await screen.findByText('Adjustment restored. Recompute the run.')).toBeTruthy();
  });
  it('removing one whose amount is hidden offers no undo, since the amount it would restore is unknown', async () => {
    const f = await openRun({ ...RUN, adjustments: [{ ...ADJ, amount: null, note: null, masked: true, maskedFields: ['amount', 'note'] }] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Arrears' }));
    await waitFor(() => expect(writes(f, '/runs/p1/adjustments/a1')).toHaveLength(1));
    expect(await screen.findByText('Removed. Recompute the run.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
  it('a closed run has no Remove', async () => {
    await openRun({ ...RUN, status: 'finalized', adjustments: [ADJ] });
    await screen.findByRole('table', { name: 'Adjustments' });
    expect(screen.queryByRole('button', { name: 'Remove Arrears' })).toBeNull();
  });
});

describe('salaries', () => {
  const COMPONENTS = [
    { id: 'c1', code: 'BASIC', name: 'Basic', kind: 'earning', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: true, esi_wage: true, position: 0, status: 'active' },
    { id: 'c2', code: 'HRA', name: 'House rent', kind: 'earning', calc: 'percent', base_codes: ['BASIC'], prorate: false, taxable: false, pf_wage: false, esi_wage: false, position: 1, status: 'active' },
    { id: 'c3', code: 'OLD', name: 'Old', kind: 'deduction', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: false, esi_wage: false, position: 2, status: 'inactive' },
  ];
  const SALARY = { id: 'sal1', effective_from: '2026-01-01', amounts: { BASIC: 50000, HRA: 40 }, reason: 'Annual review', status: 'active', created_by_name: 'Kim' };
  const STATUTORY = { uan: '123456789012', pf_member_id: 'PF1', pf_excluded: false, esi_ip_number: '1234567890', pan: 'ABCDE1234F', tax_regime: 'old', pt_state: 'KA' };
  const STAT_MASKED = { uan: null, pf_member_id: null, pf_excluded: true, esi_ip_number: null, pan: null, tax_regime: 'new', pt_state: null, masked: true, maskedFields: ['uan', 'pf_member_id', 'esi_ip_number', 'pan'] };
  const salaryApi = (over: { salaries?: object[]; statutory?: (url: string) => object; extra?: Handler } = {}): Handler => (url, init) => {
    const x = over.extra?.(url, init);
    if (x !== undefined) return x;
    if (init.method && init.method !== 'GET') return { ok: true };
    if (url.includes('/statutory')) return over.statutory ? over.statutory(url) : STATUTORY;
    if (url.includes('/salaries')) return { items: over.salaries ?? [SALARY] };
    if (url.includes('/components')) return { items: COMPONENTS };
    if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
    return { items: [] };
  };
  const pick = async () => {
    await userEvent.click(await screen.findByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Rohan Iyer/ }));
  };
  it('asks for a person first, then shows amounts and percents as each component calculates', async () => {
    mockPageApi(MANAGE, FLAGS, salaryApi());
    showPage(<Payroll />, '/payroll?tab=salaries');
    expect(await screen.findByText('Pick an employee')).toBeTruthy();
    await pick();
    expect(await screen.findByText('Annual review')).toBeTruthy();
    expect(await screen.findByText('40%')).toBeTruthy();
    expect(screen.getByText(/50,000/)).toBeTruthy();
    expect(screen.getByText('Kim')).toBeTruthy();
  });
  it('a salary not yet approved has no approval date, and that prints nothing odd', async () => {
    mockPageApi(MANAGE, FLAGS, salaryApi({ salaries: [{ ...SALARY, approved_at: null, status: 'pending' }] }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    const table = await screen.findByRole('table', { name: 'Salary history' });
    expect(table.textContent).not.toMatch(/null|undefined|NaN/);
  });
  it('masked salary stays hidden until reveal, and reveal asks with reveal=1', async () => {
    const f = mockPageApi(MANAGE, FLAGS, salaryApi({ extra: (url) => (url.includes('/salaries') && !url.includes('reveal=1') ? { items: [{ ...SALARY, amounts: null, masked: true, maskedFields: ['amounts'] }] } : undefined) }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    const table = await screen.findByRole('table', { name: 'Salary history' });
    expect(within(table).getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText(/50,000/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(await screen.findByText(/50,000/)).toBeTruthy();
    expect(reads(f, '/employees/e9/salaries?reveal=1').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    await waitFor(() => expect(screen.queryByText(/50,000/)).toBeNull());
  });
  it('no salary yet says so, and a reader cannot propose or edit', async () => {
    mockPageApi(['payroll.read'], FLAGS, salaryApi({ salaries: [] }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    expect(await screen.findByText('No salary yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Propose change' })).toBeNull();
    await screen.findByText('123456789012');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
  it('a change needs a component, then sends only filled ones as numbers', async () => {
    const f = mockPageApi(MANAGE, FLAGS, salaryApi());
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    await userEvent.click(await screen.findByRole('button', { name: 'Propose change' }));
    const dlg = await screen.findByRole('dialog', { name: 'Salary change — Rohan Iyer' });
    expect(within(dlg).queryByLabelText(/^Old/)).toBeNull();
    fireEvent.change(within(dlg).getByLabelText(/Effective from/), { target: { value: '2026-04-01' } });
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Promotion');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect(await within(dlg).findByText('Enter at least one component')).toBeTruthy();
    expect(writes(f, '/salaries')).toHaveLength(0);
    await userEvent.type(await within(dlg).findByLabelText(/^Basic \(/), '60000');
    expect(within(dlg).getByLabelText(/^House rent \(% of BASIC\)/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/employees/e9/salaries')).toHaveLength(1));
    expect(bodyOf(writes(f, '/employees/e9/salaries')[0]!)).toEqual({ effectiveFrom: '2026-04-01', reason: 'Promotion', amounts: { BASIC: 60000 } });
    expect(await screen.findByText('Sent for approval')).toBeTruthy();
  });
  it('statutory details show covered, regime and state; Edit saves what is typed, with PAN upper case and blanks as null', async () => {
    const f = mockPageApi(MANAGE, FLAGS, salaryApi());
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    expect(await screen.findByText('123456789012')).toBeTruthy();
    expect(screen.getByText('Covered')).toBeTruthy();
    expect(screen.getByText('Old')).toBeTruthy();
    expect(screen.getByText('KA')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Statutory details — Rohan Iyer' });
    await userEvent.clear(within(dlg).getByLabelText(/^UAN/));
    await userEvent.clear(within(dlg).getByLabelText(/^PF member id/));
    await userEvent.type(within(dlg).getByLabelText(/^PF member id/), 'PF2');
    await userEvent.clear(within(dlg).getByLabelText(/^ESI IP number/));
    await userEvent.type(within(dlg).getByLabelText(/^PAN/), 'pqrst6789k');
    await userEvent.selectOptions(within(dlg).getByLabelText('Tax regime'), 'new');
    await userEvent.clear(within(dlg).getByLabelText(/^PT state/));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Not covered by PF/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/employees/e9/statutory')).toHaveLength(1));
    expect((writes(f, '/employees/e9/statutory')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/employees/e9/statutory')[0]!)).toEqual({ uan: null, pfMemberId: 'PF2', pfExcluded: true, esiIpNumber: null, pan: 'PQRST6789K', taxRegime: 'new', ptState: null });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('an untouched PAN stays out of the save, and a refusal stays open', async () => {
    const f = mockPageApi(MANAGE, FLAGS, salaryApi({ extra: (url, init) => (url.includes('/statutory') && init.method === 'PUT' ? problem(422, 'UAN is taken') : undefined) }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    await screen.findByText('123456789012');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: /Statutory details/ });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('UAN is taken');
    expect(bodyOf(writes(f, '/statutory')[0]!)).not.toHaveProperty('pan');
  });
  it('masked statutory details cannot be edited until shown, since saving them would clear what is stored', async () => {
    const f = mockPageApi(MANAGE, FLAGS, salaryApi({ statutory: (url) => (url.includes('reveal=1') ? STATUTORY : STAT_MASKED) }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await pick();
    expect(await screen.findByText('Excluded')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Branch state')).toBeTruthy();
    const edit = screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe('Show the details first');
    expect(screen.queryByText('123456789012')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(await screen.findByText('123456789012')).toBeTruthy();
    expect(reads(f, '/statutory?reveal=1').length).toBeGreaterThan(0);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('components', () => {
  const BASIC = { id: 'c1', code: 'BASIC', name: 'Basic', kind: 'earning', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: true, esi_wage: true, position: 0, status: 'active' };
  const HRA = { ...BASIC, id: 'c2', code: 'HRA', name: 'House rent', kind: 'deduction', calc: 'percent', base_codes: ['BASIC'], prorate: false, taxable: false, pf_wage: false, esi_wage: false, position: 3, status: 'inactive' };
  it('describes each component, and a reader gets no edit', async () => {
    mockPageApi(['payroll.read'], FLAGS, () => ({ items: [BASIC, HRA] }));
    showPage(<Payroll />, '/payroll?tab=components');
    expect(await screen.findByText('Fixed monthly')).toBeTruthy();
    expect(screen.getByText('% of BASIC')).toBeTruthy();
    expect(screen.getByText('prorated · taxable · PF wage · ESI wage')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New component' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Basic' })).toBeNull();
  });
  it('an empty list suggests where to start', async () => {
    mockPageApi(MANAGE, FLAGS, () => ({ items: [] }));
    showPage(<Payroll />, '/payroll?tab=components');
    expect(await screen.findByText('No components yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'New component' }));
    const dlg = await screen.findByRole('dialog', { name: 'New component' });
    await userEvent.selectOptions(within(dlg).getByLabelText('Calculation'), 'percent');
    expect(within(dlg).getByText('No fixed components yet. Add one first.')).toBeTruthy();
  });
  it('a new percent component needs a base, and sends code in upper case with its flags', async () => {
    const f = mockPageApi(MANAGE, FLAGS, (url, init) => (init.method && init.method !== 'GET' ? { ok: true } : { items: [BASIC] }));
    showPage(<Payroll />, '/payroll?tab=components');
    await userEvent.click(await screen.findByRole('button', { name: 'New component' }));
    const dlg = await screen.findByRole('dialog', { name: 'New component' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'hra');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'House rent');
    await userEvent.selectOptions(within(dlg).getByLabelText('Kind'), 'deduction');
    await userEvent.selectOptions(within(dlg).getByLabelText('Calculation'), 'percent');
    fireEvent.change(within(dlg).getByLabelText('Order on payslip'), { target: { value: '7' } });
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'inactive');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Taxable' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Choose at least one base component')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'BASIC, Basic' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/payroll/components')).toHaveLength(1));
    expect(bodyOf(writes(f, '/payroll/components')[0]!)).toEqual({ code: 'HRA', name: 'House rent', kind: 'deduction', calc: 'percent', baseCodes: ['BASIC'], prorate: true, taxable: false, pfWage: false, esiWage: true, position: 7, status: 'inactive' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('editing PUTs the component; unticking a base and turning it fixed sends no bases', async () => {
    const f = mockPageApi(MANAGE, FLAGS, (url, init) => (init.method && init.method !== 'GET' ? { ok: true } : { items: [BASIC, HRA] }));
    showPage(<Payroll />, '/payroll?tab=components');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit House rent' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit HRA' });
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'BASIC, Basic' }));
    expect((within(dlg).getByRole('checkbox', { name: 'BASIC, Basic' }) as HTMLInputElement).checked).toBe(false);
    await userEvent.selectOptions(within(dlg).getByLabelText('Calculation'), 'fixed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/payroll/components/c2')).toHaveLength(1));
    expect((writes(f, '/payroll/components/c2')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/payroll/components/c2')[0]!)).toMatchObject({ calc: 'fixed', baseCodes: [] });
  });
});

describe('statutory rules', () => {
  const RULE = { id: 'r1', kind: 'pf', scope: 'IN', effective_from: '2026-01-01', effective_to: null, params: { employeeRate: 12 }, source_reference: 'Circular 1', status: 'draft', created_by: 'u2', created_by_name: 'Kim', verified_by_name: null };
  const OPEN = { ...RULE, id: 'r2', kind: 'tds', scope: 'new', status: 'active', effective_to: '2026-12-31', verified_by_name: 'Lee' };
  const ruleApi = (extra?: Handler): Handler => (url, init) => {
    const x = extra?.(url, init);
    if (x !== undefined) return x;
    if (init.method && init.method !== 'GET') return { ok: true };
    return { items: [RULE, OPEN] };
  };
  it('lists rules with who entered and verified them; an active rule cannot be verified again', async () => {
    mockPageApi(MANAGE, FLAGS, ruleApi());
    showPage(<Payroll />, '/payroll?tab=statutory');
    expect(await screen.findByText('Kim, then Lee')).toBeTruthy();
    expect(screen.getByText(/Provident fund/)).toBeTruthy();
    expect(screen.getByText(/Income tax \(TDS\)/)).toBeTruthy();
    expect(screen.getByText(/onwards/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Verify' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Retire' })).toHaveLength(2);
  });
  it('the person who entered a rule cannot verify it', async () => {
    mockPageApi(MANAGE, FLAGS, ruleApi((url, init) => ((init.method ?? 'GET') === 'GET' ? { items: [{ ...RULE, created_by: 'u1' }] } : undefined)));
    showPage(<Payroll />, '/payroll?tab=statutory');
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
  });
  it('a reader sees rules with no actions', async () => {
    mockPageApi(['payroll.read'], FLAGS, ruleApi());
    showPage(<Payroll />, '/payroll?tab=statutory');
    await screen.findByText('Kim, then Lee');
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New rule' })).toBeNull();
  });
  it('an empty list warns no deduction is made', async () => {
    mockPageApi(MANAGE, FLAGS, () => ({ items: [] }));
    showPage(<Payroll />, '/payroll?tab=statutory');
    expect(await screen.findByText('No rules yet')).toBeTruthy();
  });
  it('verifying posts, and retiring asks first', async () => {
    const f = mockPageApi(MANAGE, FLAGS, ruleApi());
    showPage(<Payroll />, '/payroll?tab=statutory');
    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(writes(f, '/statutory-rules/r1/verify')).toHaveLength(1));
    expect(await screen.findByText('Verified and active')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: 'Retire' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Retire rule' });
    expect(within(dlg).getByText(/Retire Provident fund \(IN\)/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Retire rule' }));
    await waitFor(() => expect(writes(f, '/statutory-rules/r1/retire')).toHaveLength(1));
    expect(await screen.findByText('Retired')).toBeTruthy();
  });
  it('a new rule follows the kind for scope and hint, and posts parsed JSON', async () => {
    const f = mockPageApi(MANAGE, FLAGS, ruleApi());
    showPage(<Payroll />, '/payroll?tab=statutory');
    await userEvent.click(await screen.findByRole('button', { name: 'New rule' }));
    const dlg = await screen.findByRole('dialog', { name: 'New statutory rule' });
    const scope = within(dlg).getByLabelText(/^Scope/) as HTMLInputElement;
    expect(scope.value).toBe('IN');
    await userEvent.selectOptions(within(dlg).getByLabelText('Rule'), 'tds');
    expect(scope.value).toBe('new');
    expect(within(dlg).getByText('new or old (regime)')).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText('Rule'), 'esi');
    expect(scope.value).toBe('IN');
    await userEvent.selectOptions(within(dlg).getByLabelText('Rule'), 'pt');
    expect(scope.value).toBe('');
    expect(within(dlg).getByText('State, as on the branch')).toBeTruthy();
    await userEvent.type(scope, 'KA');
    fireEvent.change(within(dlg).getByLabelText(/^Effective from/), { target: { value: '2026-04-01' } });
    fireEvent.change(within(dlg).getByLabelText(/^Effective to/), { target: { value: '2027-03-31' } });
    fireEvent.change(within(dlg).getByLabelText(/^Parameters/), { target: { value: '{"slabs":[]}' } });
    await userEvent.type(within(dlg).getByLabelText(/^Source reference/), 'Circular 9');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/statutory-rules')).toHaveLength(1));
    expect(bodyOf(writes(f, '/statutory-rules')[0]!)).toEqual({ kind: 'pt', scope: 'KA', effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', params: { slabs: [] }, sourceReference: 'Circular 9' });
    expect(await screen.findByText('Saved as a draft. A second person must verify it.')).toBeTruthy();
  });
  it('editing a draft starts from it and PUTs; a refusal stays open', async () => {
    const f = mockPageApi(MANAGE, FLAGS, ruleApi((url, init) => (init.method === 'PUT' ? problem(409, 'Overlaps another rule') : undefined)));
    showPage(<Payroll />, '/payroll?tab=statutory');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit draft rule' });
    expect(JSON.parse((within(dlg).getByLabelText(/^Parameters/) as HTMLTextAreaElement).value)).toEqual({ employeeRate: 12 });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Overlaps another rule');
    expect(bodyOf(writes(f, '/statutory-rules/r1')[0]!)).toMatchObject({ effectiveTo: null, kind: 'pf' });
  });
});

describe('my payslips', () => {
  const ROW = { id: 'ps1', period: '2026-01', kind: 'regular', gross: null, deductions: null, net: null, masked: true, maskedFields: ['gross', 'deductions', 'net'] };
  // The detail answer carries no id of its own: see PayslipData in the backend.
  const { id: _rowId, ...ROW_FIELDS } = ROW;
  const FULL = { ...ROW_FIELDS, gross: 1000, deductions: 100, net: 900, masked: false, maskedFields: [], legal_entity: 'Co', name: 'Asha Rao', employee_code: 'E1', designation: 'Engineer', department: 'Tech', branch: 'Pune', date_of_joining: '2025-01-01', paid_days: 29, days_in_period: 31, lop_days: 2, uan: '123456789012', pan: 'ABCDE1234F', account: 'XX1234', ifsc: 'HDFC0001', lines: [{ kind: 'earning', name: 'Basic', amount: 1000 }] };
  const HIDDEN = { ...FULL, gross: null, deductions: null, net: null, uan: null, pan: null, account: null, ifsc: null, lop_days: 0, designation: null, department: null, masked: true, maskedFields: ['gross', 'deductions', 'net', 'uan', 'pan', 'account', 'ifsc'] };
  const slipApi: Handler = (url) => {
    if (url.endsWith('/payslips/mine')) return { items: [ROW] };
    if (url.includes('/payslips/ps1') && url.includes('reveal=1')) return FULL;
    if (url.includes('/payslips/ps1')) return HIDDEN;
    return {};
  };
  it('an empty list says when a slip appears', async () => {
    mockPageApi([], () => ({ items: [] }));
    showPage(<Payslips />);
    expect(await screen.findByText('No payslips yet')).toBeTruthy();
  });
  it('amounts stay hidden until asked, one at a time, each asking with reveal=1', async () => {
    const f = mockPageApi([], slipApi);
    showPage(<Payslips />);
    expect(await screen.findByText('Net pay for 2026-01 hidden')).toBeTruthy();
    expect(screen.queryByText(/900/)).toBeNull();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Show Net pay for 2026-01' }));
    expect(await screen.findByText(/900/)).toBeTruthy();
    expect(reads(f, '/payslips/ps1?reveal=1')).toHaveLength(1);
    expect(screen.queryByText(/1,000/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Net pay for 2026-01' }));
    await waitFor(() => expect(screen.queryByText(/900/)).toBeNull());
  });
  it('a refused reveal says why and stays hidden', async () => {
    mockPageApi([], (url) => (url.includes('reveal=1') ? problem(403, 'Step-up required') : slipApi(url, {})));
    showPage(<Payslips />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show Gross for 2026-01' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Step-up required');
    expect(screen.getByText('Gross for 2026-01 hidden')).toBeTruthy();
  });
  it('amounts the server already sends show directly, and a final settlement is marked', async () => {
    mockPageApi([], (url) => (url.endsWith('/payslips/mine') ? { items: [{ id: 'ps2', period: '2026-02', kind: 'fnf', gross: 1000, deductions: 100, net: 900 }] } : {}));
    showPage(<Payslips />);
    expect(await screen.findByText('2026-02 (F&F)')).toBeTruthy();
    expect(screen.getByText(/900/)).toBeTruthy();
  });
  it('the slip hides pay and bank details until shown, then shows them', async () => {
    const f = mockPageApi([], slipApi);
    showPage(<Payslips />);
    await userEvent.click(await screen.findByRole('button', { name: 'View payslip for 2026-01' }));
    const dlg = await screen.findByRole('dialog', { name: 'Payslip 2026-01' });
    expect(await within(dlg).findByText('Amounts are hidden until you ask to see them.')).toBeTruthy();
    expect(within(dlg).getByText('Asha Rao (E1)')).toBeTruthy();
    expect(within(dlg).getByText('29 of 31')).toBeTruthy();
    expect(within(dlg).getAllByText('Hidden')).toHaveLength(2);
    expect(within(dlg).queryByText(/XX1234/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show pay details' }));
    expect(await within(dlg).findByText('XX1234 · HDFC0001')).toBeTruthy();
    expect(reads(f, '/payslips/ps1?reveal=1').length).toBeGreaterThan(0);
    expect(within(dlg).getByText('123456789012 / ABCDE1234F')).toBeTruthy();
    expect(within(dlg).getByText('29 of 31 (LOP 2)')).toBeTruthy();
    expect(within(dlg).getByText('Engineer · Tech')).toBeTruthy();
    expect(within(dlg).getByText('Basic')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Hide pay details' })).toBeTruthy();
  });
  it('an unmasked full and final slip without bank details shows dashes', async () => {
    mockPageApi([], (url) => {
      if (url.endsWith('/payslips/mine')) return { items: [ROW] };
      return { ...FULL, kind: 'fnf', uan: null, pan: null, account: null, ifsc: null, designation: null, department: null, lines: null };
    });
    showPage(<Payslips />);
    await userEvent.click(await screen.findByRole('button', { name: 'View payslip for 2026-01' }));
    const dlg = await screen.findByRole('dialog', { name: 'Payslip 2026-01' });
    expect(await within(dlg).findByText('Payslip, 2026-01 (full and final)')).toBeTruthy();
    expect(within(dlg).getByText('— / —')).toBeTruthy();
    expect(within(dlg).getAllByText('—').length).toBeGreaterThan(0);
  });
  it('the download inside the slip asks for the slip that is open', async () => {
    const f = mockPageApi([], slipApi);
    showPage(<Payslips />);
    await userEvent.click(await screen.findByRole('button', { name: 'View payslip for 2026-01' }));
    const dlg = await screen.findByRole('dialog', { name: 'Payslip 2026-01' });
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(reads(f, '/payslip.pdf')).toHaveLength(1));
    expect(reads(f, '/payslips/ps1/payslip.pdf')).toHaveLength(1);
  });
  it('a failed slip download says why and stays on the page', async () => {
    mockPageApi([], (url) => (url.endsWith('/payslip.pdf') ? problem(404, 'Payslip not published') : slipApi(url, {})));
    showPage(<Payslips />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download payslip for 2026-01 as PDF' }));
    expect(await screen.findByText('Payslip not published')).toBeTruthy();
  });
});
