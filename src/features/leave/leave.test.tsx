import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setViewport } from '../../test/render';
import { addDays, fmtDate, todayLocal } from '../../format';
import { Leave } from '../../pages/Leave';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';
import type { LeaveBalance, LeaveCalendarItem, LeaveRequest, LeaveType } from './types';

const bal = (over: Partial<LeaveBalance> = {}): LeaveBalance => ({ id: 'lt1', name: 'Casual Leave', code: 'CL', paid: true, requires_balance: true, allow_half_day: true, accrual_method: 'annual', annual_entitlement: '12', balance: '10', available: '8', used: '2', pending: '1', ...over });
const req = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({ id: 'r1', employee_id: 'e1', employee_code: 'E1', name: 'Asha Rao', type_code: 'CL', type_name: 'Casual Leave', start_date: '2026-03-02', end_date: '2026-03-02', start_half: 'full', end_half: 'full', days: '1', reason: 'Family visit', status: 'rejected', approval_request_id: null, created_at: '2026-02-20T10:00:00.000Z', decided_at: null, ...over });
const type = (over: Partial<LeaveType> = {}): LeaveType => ({ id: 'lt1', code: 'CL', name: 'Casual Leave', description: 'Short breaks', paid: true, allow_half_day: true, requires_balance: true, accrual_method: 'annual', annual_entitlement: '12', carry_forward_max: '5', max_balance: '30', count_non_working_days: true, min_notice_days: 2, max_consecutive_days: '3', eligible_after_days: 90, applicable_employment_types: ['permanent', 'probation'], status: 'active', version: 1, ...over });
const PREVIEW = { days: 1, paid: true, requiresBalance: true, available: 8, sufficient: true, perDate: [] };
const PERIOD = { leaveYear: 2026, period: { start: '2026-01-01', end: '2026-12-31' } };

const mine = (balances: LeaveBalance[], requests: LeaveRequest[], extra: Handler = () => undefined): Handler => (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (url.includes('/requests/preview')) return PREVIEW;
  if (url.includes('/leave/balances')) return { items: balances, ...PERIOD };
  if (url.includes('/leave/requests') && (init.method ?? 'GET') === 'GET') return { items: requests, page: 1, pageSize: 10, total: requests.length };
  return { ok: true };
};

afterEach(() => { resetViewport(); vi.restoreAllMocks(); });

const openApply = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Apply for leave' }));
  return screen.findByRole('dialog', { name: 'Apply for leave' });
};

describe('my leave', () => {
  it('shows the leave year, each balance and what a type without a balance means', async () => {
    mockPageApi(['leave.self'], mine([bal(), bal({ id: 'lt2', name: 'Unpaid Leave', code: 'LWP', paid: false, requires_balance: false })], []));
    showPage(<Leave />, '/leave');
    const tiles = await screen.findByLabelText('Leave balances');
    expect(within(tiles).getByText('Casual Leave')).toBeTruthy();
    expect(within(tiles).getByText(/available · 2 used · 1 pending/)).toBeTruthy();
    expect(within(tiles).getByText('No balance needed')).toBeTruthy();
    expect(within(tiles).getByText('Unpaid')).toBeTruthy();
    expect(screen.getByText(`Leave year ${fmtDate('2026-01-01')} – ${fmtDate('2026-12-31')}`)).toBeTruthy();
    expect(await screen.findByText('No leave requests yet.')).toBeTruthy();
  });

  it('with no leave types, tells the person to ask HR and offers no Apply', async () => {
    mockPageApi(['leave.self'], mine([], []));
    showPage(<Leave />, '/leave');
    expect(await screen.findByText('No leave types are set up yet')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Apply for leave' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Balance history' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes half days into the dates column and hides a withheld reason', async () => {
    const row = req({ start_date: '2026-03-02', end_date: '2026-03-04', start_half: 'second_half', end_half: 'first_half', days: '2' });
    const hidden = { ...req({ id: 'r2', reason: '' }), reason: null, masked: true, maskedFields: ['reason'] } as unknown as LeaveRequest;
    mockPageApi(['leave.self'], mine([bal()], [row, hidden]));
    showPage(<Leave />, '/leave');
    expect(await screen.findByText(`${fmtDate('2026-03-02')} (2nd half) → ${fmtDate('2026-03-04')} (1st half)`)).toBeTruthy();
    expect(screen.getByText('Family visit')).toBeTruthy();
    expect(screen.getByText(/^Hidden\./)).toBeTruthy();
  });

  it('offers Cancel on pending and future approved leave, and only warns about the balance for approved', async () => {
    const future = addDays(todayLocal(), 30);
    const approved = req({ id: 'r1', status: 'approved', start_date: future, end_date: future });
    const pending = req({ id: 'r2', status: 'pending', start_date: future, end_date: future, type_name: 'Sick Leave' });
    const past = req({ id: 'r3', status: 'approved', type_name: 'Old Leave', start_date: '2020-01-01', end_date: '2020-01-01' });
    const f = mockPageApi(['leave.self'], mine([bal()], [approved, pending, past]));
    showPage(<Leave />, '/leave');
    await screen.findByText('Old Leave');
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[1]!);
    expect(within(await screen.findByRole('dialog', { name: 'Cancel leave' })).queryByText(/returned to your balance/)).toBeNull();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, '/cancel')).toHaveLength(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Cancel leave' });
    expect(within(dlg).getByText(/The days will be returned to your balance/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel leave' }));
    await waitFor(() => expect(writes(f, '/leave/requests/r1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Leave cancelled')).toBeTruthy();
  });

  it('a failed cancellation stays open with the server reason', async () => {
    const future = addDays(todayLocal(), 30);
    mockPageApi(['leave.self'], mine([bal()], [req({ status: 'pending', start_date: future, end_date: future })], (url) => (url.includes('/cancel') ? problem(409, 'Already decided') : undefined)));
    showPage(<Leave />, '/leave');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel leave' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel leave' }));
    expect(await within(dlg).findByText('Already decided')).toBeTruthy();
  });

  it('opens the balance history for this person and leave year', async () => {
    const f = mockPageApi(['leave.self'], mine([bal()], [], (url) => (url.includes('/ledger') ? { items: [] } : undefined)));
    showPage(<Leave />, '/leave');
    await userEvent.click(await screen.findByRole('button', { name: 'Balance history' }));
    await waitFor(() => expect(reads(f, '/ledger').length).toBeGreaterThan(0));
    expect(String(reads(f, '/ledger')[0]![0])).toContain('e1');
    expect(String(reads(f, '/ledger')[0]![0])).toContain('2026');
  });

  it('an employee who cannot see the team only gets their own view, with no tabs', async () => {
    mockPageApi(['leave.self'], mine([bal()], []));
    showPage(<Leave />, '/leave');
    await screen.findByLabelText('Leave balances');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('a user with no employee record does not get the My leave tab', async () => {
    mockPageApi(['leave.self', 'leave.read'], (url) => (url.includes('/calendar') ? { items: [] } : { items: [] }), {}, null);
    showPage(<Leave />, '/leave');
    expect(await screen.findByText('No leave in this period')).toBeTruthy();
    expect(screen.queryByLabelText('Leave balances')).toBeNull();
  });
});

describe('apply for leave', () => {
  it('previews, and sends the exact request with the reason', async () => {
    const f = mockPageApi(['leave.self'], mine([bal()], [], (url, init) => (url.endsWith('/leave/requests') && init.method === 'POST' ? { days: 1 } : undefined)));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    expect(await within(dlg).findByText('1 day(s)')).toBeTruthy();
    expect(within(dlg).getByText('1 day(s)').parentElement?.textContent).toContain('8 available');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Going home');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/api/v1/leave/requests').filter((c) => String(c[0]).endsWith('/requests'))).toHaveLength(1));
    const tomorrow = addDays(todayLocal(), 1);
    expect(bodyOf(writes(f, '/leave/requests').find((c) => String(c[0]).endsWith('/requests'))!)).toEqual({ leaveTypeId: 'lt1', startDate: tomorrow, endDate: tomorrow, startHalf: 'full', endHalf: 'full', reason: 'Going home' });
    expect(await screen.findByText('Leave requested: 1 day(s). Sent for approval.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a refused request stays open with the reason and the typed text', async () => {
    mockPageApi(['leave.self'], mine([bal()], [], (url, init) => (url.endsWith('/leave/requests') && init.method === 'POST' ? problem(422, 'Overlaps an existing request') : undefined)));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    await within(dlg).findByText('1 day(s)');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Going home');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Overlaps an existing request')).toBeTruthy();
    expect((within(dlg).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Going home');
  });

  it('not enough balance blocks submit and says how much is available', async () => {
    mockPageApi(['leave.self'], mine([bal()], [], (url) => (url.includes('/preview') ? { ...PREVIEW, days: 9, sufficient: false } : undefined)));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    expect(await within(dlg).findByText(/9 day\(s\) · 8 available, not enough balance/)).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Submit for approval' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a failed preview shows why, and submit waits', async () => {
    mockPageApi(['leave.self'], mine([bal()], [], (url) => (url.includes('/preview') ? problem(422, 'Not eligible yet') : undefined)));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    expect(await within(dlg).findByText('Not eligible yet')).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Submit for approval' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names days not counted, and marks unpaid leave', async () => {
    mockPageApi(['leave.self'], mine([bal({ paid: false, requires_balance: false })], [], (url) => (url.includes('/preview') ? { ...PREVIEW, paid: false, requiresBalance: false, days: 1, perDate: [{ date: '2026-03-07', fraction: 0 }, { date: '2026-03-09', fraction: 1 }] } : undefined)));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    expect(await within(dlg).findByText(`Not counted (weekly off or holiday): ${fmtDate('2026-03-07')}`)).toBeTruthy();
    expect(within(dlg).getByText(/\(unpaid\)/)).toBeTruthy();
    expect(within(dlg).queryByText(/available/)).toBeNull();
  });

  it('moving From past To moves To with it, and half-day ticks on one day exclude each other', async () => {
    const f = mockPageApi(['leave.self'], mine([bal(), bal({ id: 'lt2', name: 'Long Leave', code: 'LL', allow_half_day: false })], []));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    const from = within(dlg).getByLabelText(/^From/) as HTMLInputElement;
    const to = within(dlg).getByLabelText(/^To/) as HTMLInputElement;
    const later = addDays(todayLocal(), 10);
    fireEvent.change(from, { target: { value: later } });
    expect(to.value).toBe(later);
    expect(to.min).toBe(later);
    const second = within(dlg).getByLabelText('Second half only') as HTMLInputElement;
    const first = within(dlg).getByLabelText('First half only') as HTMLInputElement;
    await userEvent.click(second);
    await userEvent.click(first);
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
    await userEvent.click(second);
    expect(second.checked).toBe(true);
    expect(first.checked).toBe(false);
    await waitFor(() => expect(writes(f, '/preview').some((c) => bodyOf(c)['startHalf'] === 'second_half' && bodyOf(c)['startDate'] === later)).toBe(true));

    // Over several days the same boxes mean something else and both may be ticked.
    fireEvent.change(to, { target: { value: addDays(later, 3) } });
    const start = within(dlg).getByLabelText('Start in the second half') as HTMLInputElement;
    const end = within(dlg).getByLabelText('Return after the first half') as HTMLInputElement;
    await userEvent.click(end);
    expect(start.checked).toBe(true);
    expect(end.checked).toBe(true);
    await userEvent.click(start);
    await userEvent.click(end);
    expect(start.checked).toBe(false);
    expect(end.checked).toBe(false);

    // A type without half days offers no such boxes, and the list shows what is left of each balance.
    const typeSelect = within(dlg).getByLabelText(/Leave type/);
    expect(within(typeSelect).getByRole('option', { name: 'Long Leave, 8 available' })).toBeTruthy();
    await userEvent.selectOptions(typeSelect, 'lt2');
    expect(within(dlg).queryByLabelText('Start in the second half')).toBeNull();
  });

  it('Cancel closes without sending', async () => {
    const f = mockPageApi(['leave.self'], mine([bal()], []));
    showPage(<Leave />, '/leave');
    const dlg = await openApply();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, '/leave/requests').filter((c) => String(c[0]).endsWith('/requests'))).toHaveLength(0);
  });
});

describe('team calendar', () => {
  const item = (over: Partial<LeaveCalendarItem> = {}): LeaveCalendarItem => ({ id: 'l1', days: '1', employee_id: 'e2', name: 'Rohan Iyer', employee_code: 'E2', type_code: 'CL', status: 'approved', start_date: addDays(todayLocal(), 1), end_date: addDays(todayLocal(), 2), start_half: 'full', end_half: 'first_half', ...over });

  it('asks for four weeks and moves by four weeks', async () => {
    const today = todayLocal();
    const f = mockPageApi(['leave.read'], (url) => (url.includes('/calendar') ? { items: [] } : { items: [] }));
    showPage(<Leave />, '/leave?tab=team');
    expect(await screen.findByText('No leave in this period')).toBeTruthy();
    expect(reads(f, '/leave/calendar').some((c) => String(c[0]).includes(`from=${today}&to=${addDays(today, 27)}`))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(reads(f, `from=${addDays(today, 28)}`).length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Earlier' }));
    await userEvent.click(screen.getByRole('button', { name: 'Earlier' }));
    await waitFor(() => expect(reads(f, `from=${addDays(today, -28)}`).length).toBeGreaterThan(0));
  });

  it('draws one row per person, a half day as ½, and pending in its own badge title', async () => {
    const today = todayLocal();
    mockPageApi(['leave.read'], (url) => (url.includes('/calendar') ? { items: [item(), item({ type_code: 'SL', status: 'pending', start_date: addDays(today, 5), end_date: addDays(today, 5), end_half: 'full', start_half: 'second_half' }), item({ employee_id: 'e3', name: 'Asha Rao', employee_code: 'E3', end_half: 'full' })] } : { items: [] }));
    showPage(<Leave />, '/leave?tab=team');
    const grid = await screen.findByRole('table', { name: 'Team calendar' });
    const rohan = within(grid).getByRole('row', { name: /Rohan Iyer/ });
    expect(within(rohan).getByText('CL')).toBeTruthy();
    expect(within(rohan).getByText('CL½')).toBeTruthy();
    expect(within(rohan).getByTitle('SL pending').textContent).toBe('SL½');
    expect(within(within(grid).getByRole('row', { name: /Asha Rao/ })).getAllByText('CL')).toHaveLength(2);
  });

  it('on a phone lists one line per absence instead of the grid', async () => {
    setViewport(400);
    const start = addDays(todayLocal(), 1);
    mockPageApi(['leave.read'], (url) => (url.includes('/calendar') ? { items: [item(), item({ employee_id: 'e3', name: 'Asha Rao', status: 'pending', start_date: start, end_date: start })] } : { items: [] }));
    showPage(<Leave />, '/leave?tab=team');
    const list = await screen.findByRole('list', { name: 'Team leave' });
    expect(within(list).getByText('Rohan Iyer')).toBeTruthy();
    expect(within(list).getByText(`${fmtDate(start)} – ${fmtDate(addDays(todayLocal(), 2))}`)).toBeTruthy();
    expect(within(list).getByText(fmtDate(start))).toBeTruthy();
    expect(within(list).getByText('CL, pending')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Team calendar' })).toBeNull();
  });
});

describe('leave administration', () => {
  const admin = (items: LeaveType[], extra: Handler = () => undefined): Handler => (url, init) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if (url.includes('/leave/types') && (init.method ?? 'GET') === 'GET') return { items };
    if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
    return { ok: true };
  };
  const PERMS = ['leave.manage'];
  const showAdmin = async () => { showPage(<Leave />, '/leave?tab=admin'); return screen.findByRole('heading', { name: 'Accruals' }); };

  it('summarises each type in the table', async () => {
    mockPageApi(PERMS, admin([type(), type({ id: 'lt2', code: 'LWP', name: 'Without Pay', paid: false, requires_balance: false, allow_half_day: false, count_non_working_days: false, min_notice_days: 0, max_consecutive_days: null, eligible_after_days: 0, applicable_employment_types: [], status: 'inactive' })]));
    await showAdmin();
    const table = await screen.findByRole('table', { name: 'Leave types' });
    const cl = within(table).getByRole('row', { name: /Casual Leave/ });
    expect(within(cl).getByText('half days · sandwich · 2d notice · max 3d · after 90d · permanent/probation')).toBeTruthy();
    expect(within(cl).getByText('annual')).toBeTruthy();
    expect(within(cl).getByText('12')).toBeTruthy();
    const lwp = within(table).getByRole('row', { name: /Without Pay/ });
    expect(within(lwp).getByText('Unpaid')).toBeTruthy();
    expect(within(lwp).getByText('No balance')).toBeTruthy();
    expect(within(lwp).getByText('—')).toBeTruthy();
  });

  it('with no types says so', async () => {
    mockPageApi(PERMS, admin([]));
    await showAdmin();
    expect(await screen.findByText('No leave types yet')).toBeTruthy();
  });

  it('creates a type with every field sent as the API names it', async () => {
    const f = mockPageApi(PERMS, admin([]));
    await showAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'New leave type' }));
    const dlg = await screen.findByRole('dialog', { name: 'New leave type' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'sl');
    expect((within(dlg).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('SL');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Sick Leave');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Unwell');
    await userEvent.click(within(dlg).getByLabelText('Paid'));
    await userEvent.click(within(dlg).getByLabelText('Half days allowed'));
    await userEvent.click(within(dlg).getByLabelText('Count weekly offs and holidays inside leave'));
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Accrual/), 'monthly');
    const setNum = (label: RegExp, value: string) => fireEvent.change(within(dlg).getByLabelText(label), { target: { value } });
    setNum(/^Entitlement per year/, '12');
    setNum(/^Carry forward up to/, '4');
    setNum(/^Maximum balance/, '20');
    setNum(/^Minimum notice/, '1');
    setNum(/^Max days per request/, '5');
    setNum(/^Eligible after/, '30');
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Status/), 'inactive');
    await userEvent.click(within(dlg).getByLabelText('Contract'));
    await userEvent.click(within(dlg).getByLabelText('Intern'));
    await userEvent.click(within(dlg).getByLabelText('Contract'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/api/v1/leave/types')).toHaveLength(1));
    const call = writes(f, '/api/v1/leave/types')[0]!;
    expect((call[1] as RequestInit).method).toBe('POST');
    expect(bodyOf(call)).toEqual({ code: 'SL', name: 'Sick Leave', description: 'Unwell', paid: false, allowHalfDay: false, requiresBalance: true, accrualMethod: 'monthly', annualEntitlement: 12, carryForwardMax: 4, maxBalance: 20, countNonWorkingDays: true, minNoticeDays: 1, maxConsecutiveDays: 5, eligibleAfterDays: 30, applicableEmploymentTypes: ['intern'], status: 'inactive' });
    expect(await screen.findByText('Leave type saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a type that needs no balance hides the balance fields and sends accrual none, blanks as null', async () => {
    const f = mockPageApi(PERMS, admin([type()]));
    await showAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit CL' });
    expect((within(dlg).getByLabelText(/^Max days per request/) as HTMLInputElement).value).toBe('3');
    expect(within(dlg).getByText(/past balances and approved leave are not rewritten/)).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText(/^Maximum balance/), { target: { value: '' } });
    fireEvent.change(within(dlg).getByLabelText(/^Max days per request/), { target: { value: '' } });
    await userEvent.clear(within(dlg).getByLabelText(/^Description/));
    await userEvent.click(within(dlg).getByLabelText('Needs a balance'));
    expect(within(dlg).queryByLabelText(/^Accrual/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/api/v1/leave/types/lt1')).toHaveLength(1));
    const call = writes(f, '/api/v1/leave/types/lt1')[0]!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(call)).toMatchObject({ description: null, maxBalance: null, maxConsecutiveDays: null, requiresBalance: false, accrualMethod: 'none' });
    expect(bodyOf(call)).not.toHaveProperty('id');
  });

  it('opens a type with no caps as blank fields', async () => {
    mockPageApi(PERMS, admin([type({ max_balance: null, max_consecutive_days: null, description: null })]));
    await showAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit CL' });
    expect((within(dlg).getByLabelText(/^Maximum balance/) as HTMLInputElement).value).toBe('');
    expect((within(dlg).getByLabelText(/^Max days per request/) as HTMLInputElement).value).toBe('');
    expect((within(dlg).getByLabelText(/^Description/) as HTMLInputElement).value).toBe('');
  });

  it('a refused save stays open and puts the field errors on the fields', async () => {
    mockPageApi(PERMS, admin([], (url, init) => (url.includes('/leave/types') && init.method === 'POST' ? problem(422, 'Check the form', { errors: [{ field: 'code', message: 'Code already used' }] }) : undefined)));
    await showAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'New leave type' }));
    const dlg = await screen.findByRole('dialog', { name: 'New leave type' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'CL');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Dup');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Code already used')).toBeTruthy();
    expect(within(dlg).getAllByRole('alert').some((a) => a.textContent?.includes('Check the form'))).toBe(true);
    expect((within(dlg).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Dup');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('runs accruals for the chosen year and month and reports the counts', async () => {
    const f = mockPageApi(PERMS, admin([], (url) => (url.includes('/accruals') ? { credited: 4, alreadyCredited: 2 } : undefined)));
    await showAdmin();
    fireEvent.change(screen.getByLabelText('Through month of leave year'), { target: { value: '6' } });
    fireEvent.change(screen.getAllByLabelText('Leave year')[0]!, { target: { value: '2025' } });
    await userEvent.click(screen.getByRole('button', { name: 'Run accruals' }));
    await waitFor(() => expect(writes(f, '/leave/accruals')).toHaveLength(1));
    expect(bodyOf(writes(f, '/leave/accruals')[0]!)).toEqual({ leaveYear: 2025, throughMonth: 6 });
    expect(await screen.findByText('Accruals: 4 credit(s) added, 2 already done')).toBeTruthy();
  });

  it('a failed accrual run shows the server reason', async () => {
    mockPageApi(PERMS, admin([], (url) => (url.includes('/accruals') ? problem(409, 'Year already closed') : undefined)));
    await showAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'Run accruals' }));
    expect(await screen.findByText('Year already closed')).toBeTruthy();
  });

  it('closing the year asks first, then reports what carried and lapsed', async () => {
    const year = Number(todayLocal().slice(0, 4));
    const f = mockPageApi(PERMS, admin([], (url) => (url.includes('/year-end') ? { daysCarried: 12.5, daysLapsed: 3 } : undefined)));
    await showAdmin();
    await userEvent.click(screen.getByRole('button', { name: `Close leave year ${year}…` }));
    const dlg = await screen.findByRole('dialog', { name: `Close leave year ${year}` });
    expect(within(dlg).getByText(new RegExp(`the rest moves to ${year + 1}`))).toBeTruthy();
    expect(writes(f, '/year-end')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close year' }));
    await waitFor(() => expect(writes(f, '/year-end')).toHaveLength(1));
    expect(bodyOf(writes(f, '/year-end')[0]!)).toEqual({ leaveYear: year });
    expect(await screen.findByText('Year closed: 12.5 day(s) carried, 3 lapsed')).toBeTruthy();
  });

  it('a balance adjustment needs a person and days, then posts them', async () => {
    const f = mockPageApi(PERMS, admin([type(), type({ id: 'lt2', code: 'SL', name: 'Sick Leave' })]));
    await showAdmin();
    await screen.findByRole('table', { name: 'Leave types' });
    await userEvent.click(screen.getByRole('button', { name: 'Adjust a balance…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjust a leave balance' });
    const save = within(dlg).getByRole('button', { name: 'Save adjustment' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    expect(save.disabled).toBe(true);
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Leave type/), 'lt2');
    fireEvent.change(within(dlg).getByLabelText(/^Leave year/), { target: { value: '2025' } });
    fireEvent.change(within(dlg).getByLabelText(/^Days/), { target: { value: '-1.5' } });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Kind/), 'opening');
    await userEvent.type(within(dlg).getByLabelText(/^Note/), 'Migrated from old system');
    expect(save.disabled).toBe(false);
    await userEvent.click(save);
    await waitFor(() => expect(writes(f, '/leave/adjustments')).toHaveLength(1));
    expect(bodyOf(writes(f, '/leave/adjustments')[0]!)).toEqual({ leaveTypeId: 'lt2', leaveYear: 2025, days: -1.5, entryType: 'opening', note: 'Migrated from old system', employeeId: 'e9' });
    expect(await screen.findByText('Balance adjusted')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a refused adjustment stays open with the reason', async () => {
    mockPageApi(PERMS, admin([type()], (url) => (url.includes('/leave/adjustments') ? problem(409, 'Would go below zero') : undefined)));
    await showAdmin();
    await screen.findByRole('table', { name: 'Leave types' });
    await userEvent.click(screen.getByRole('button', { name: 'Adjust a balance…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Adjust a leave balance' });
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    fireEvent.change(within(dlg).getByLabelText(/^Days/), { target: { value: '2' } });
    await userEvent.type(within(dlg).getByLabelText(/^Note/), 'Correction');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save adjustment' }));
    expect(await within(dlg).findByText('Would go below zero')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
