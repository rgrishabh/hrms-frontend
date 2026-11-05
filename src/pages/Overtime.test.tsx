import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../test/page';
import { Overtime } from './Overtime';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const claim = (over = {}) => ({ id: 'c1', work_date: '2026-10-01', minutes: 90, recorded_minutes: 120, payout: 'pay', status: 'pending', reason: 'Month end', name: 'Bela Roy', employee_code: 'E9', payroll_period: null, payroll_status: null, comp_off_days: null, cancel_reason: null, ...over });
const DAY = { work_date: '2026-10-05', overtime_minutes: 120, first_in: '2026-10-05T04:00:00.000Z', last_out: '2026-10-05T15:00:00.000Z', worked_minutes: 600, shift_code: 'GEN' };
const COMP = { code: 'CO', name: 'Comp off', dayMinutes: 480 };
const eligible = (over = {}) => ({ items: [DAY], windowDays: 30, minMinutes: 30, payout: { pay: true, payBlocker: null, compOff: COMP }, ...over });
const paged = (items: unknown[], over = {}) => ({ items, page: 1, pageSize: 25, total: items.length, ...over });
const api = (perms: string[], { items = [] as unknown[], elig = eligible() as unknown, extra = (() => undefined) as Handler, totals = undefined as Record<string, number> | undefined } = {}) => mockPageApi(perms, (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true };
  if (url.includes('/overtime/eligible')) return elig;
  return { ...paged(items), ...(totals ? { minutesByStatus: totals } : {}) };
});
const MINE = ['overtime.self'];
const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Claim' })); return screen.findByRole('dialog', { name: `Claim overtime — ${fmtDate(DAY.work_date)}` }); };
const radios = (dlg: HTMLElement) => ({ pay: within(dlg).getByRole('radio', { name: /^Pay/ }) as HTMLInputElement, comp: within(dlg).getByRole('radio', { name: /^Compensatory off/ }) as HTMLInputElement });

afterEach(() => vi.restoreAllMocks());

describe('access', () => {
  it('without permission says so', async () => {
    api([]);
    renderPage(<Overtime />);
    expect(await screen.findByText('You do not have access to overtime.')).toBeTruthy();
  });
  it('someone with no employee record has no personal tab', async () => {
    mockPageApi(['overtime.self', 'overtime.read'], () => paged([]), {}, null);
    renderPage(<Overtime />);
    expect(await screen.findByText('No overtime claims match.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('overtime to claim', () => {
  it('lists the days attendance recorded, inside the window', async () => {
    api(MINE);
    renderPage(<Overtime />);
    const row = await screen.findByRole('row', { name: /GEN/ });
    expect(within(row).getByText(fmtDate(DAY.work_date))).toBeTruthy();
    expect(within(row).getByText('10h 00m')).toBeTruthy();
    expect(within(row).getByText('2h 00m')).toBeTruthy();
    expect(screen.getByText(/Days in the last 30 days where attendance recorded at least 30 minutes/)).toBeTruthy();
  });
  it('a day with nothing to claim, and no shift on a day, read plainly', async () => {
    api(MINE, { elig: eligible({ items: [] }) });
    renderPage(<Overtime />);
    expect(await screen.findByText('No unclaimed overtime.')).toBeTruthy();
    expect(screen.getByText('No overtime claims yet.')).toBeTruthy();
  });
  it('pay blocked with comp off on offer explains and defaults to comp off', async () => {
    api(MINE, { elig: eligible({ payout: { pay: false, payBlocker: 'no overtime rate is set', compOff: COMP }, items: [{ ...DAY, shift_code: null }] }) });
    renderPage(<Overtime />);
    expect(await screen.findByText('Overtime cannot be taken as pay yet: no overtime rate is set. You can take it as compensatory off.')).toBeTruthy();
    const dlg = await open();
    const { pay, comp } = radios(dlg);
    expect(pay.disabled).toBe(true);
    expect(comp.checked).toBe(true);
    expect(within(dlg).getByText(/not available: no overtime rate is set/)).toBeTruthy();
  });
  it('neither way available: told so, and Claim is held back', async () => {
    api(MINE, { elig: eligible({ payout: { pay: false, payBlocker: 'no rate', compOff: null } }) });
    renderPage(<Overtime />);
    expect(await screen.findByText('Overtime cannot be taken as pay yet: no rate.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Claim' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('claiming', () => {
  it('as pay posts the date, minutes and reason', async () => {
    const f = api(MINE);
    renderPage(<Overtime />);
    const dlg = await open();
    const minutes = within(dlg).getByLabelText(/^Minutes/) as HTMLInputElement;
    expect(minutes.value).toBe('120');
    await userEvent.clear(minutes);
    expect(minutes.value).toBe('');
    await userEvent.type(minutes, '90');
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Close');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/overtime/claims')).toHaveLength(1));
    const post = writes(f, '/overtime/claims')[0]!;
    expect(String(post[0])).toBe('/api/v1/overtime/claims');
    expect(bodyOf(post)).toEqual({ workDate: DAY.work_date, minutes: 90, payout: 'pay', reason: 'Close' });
    expect(await screen.findByText('Overtime claimed; sent for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('as comp off shows what it earns, and too few minutes are refused at the field', async () => {
    const f = api(MINE);
    renderPage(<Overtime />);
    const dlg = await open();
    await userEvent.click(radios(dlg).comp);
    const minutes = within(dlg).getByLabelText(/^Minutes/);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '60');
    expect(within(dlg).getByText('Needs at least 4h 00m for half a day off.')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Close');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Needs at least 4h 00m for half a day off')).toBeTruthy();
    expect(writes(f, '/overtime/claims')).toHaveLength(0);
    await userEvent.click(radios(dlg).pay);
    expect(radios(dlg).pay.checked).toBe(true);
    expect(within(dlg).queryByText('Needs at least 4h 00m for half a day off.')).toBeNull();
  });
  it('earning half a day, a day, and days reads correctly', async () => {
    const big = { ...DAY, overtime_minutes: 960 };
    const f = api(MINE, { elig: eligible({ items: [big] }) });
    renderPage(<Overtime />);
    await userEvent.click(await screen.findByRole('button', { name: 'Claim' }));
    const dlg = await screen.findByRole('dialog', { name: /Claim overtime/ });
    await userEvent.click(radios(dlg).comp);
    expect(within(dlg).getByText('Earns 2 days off (8h 00m of overtime = 1 day).')).toBeTruthy();
    const minutes = within(dlg).getByLabelText(/^Minutes/);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '480');
    expect(within(dlg).getByText('Earns 1 day off (8h 00m of overtime = 1 day).')).toBeTruthy();
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '240');
    expect(within(dlg).getByText('Earns 0.5 days off (8h 00m of overtime = 1 day).')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Close');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/overtime/claims')).toHaveLength(1));
    expect(bodyOf(writes(f, '/overtime/claims')[0]!)).toMatchObject({ minutes: 240, payout: 'comp_off' });
  });
  it('without comp off the option says it is not offered', async () => {
    api(MINE, { elig: eligible({ payout: { pay: true, payBlocker: null, compOff: null } }) });
    renderPage(<Overtime />);
    const dlg = await open();
    expect(radios(dlg).comp.disabled).toBe(true);
    expect(within(dlg).getByText(/not offered/)).toBeTruthy();
  });
  it('a refusal keeps the form open with the reason', async () => {
    api(MINE, { extra: (url, init) => (init.method === 'POST' ? problem(409, 'Already claimed') : undefined) });
    renderPage(<Overtime />);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Close');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Already claimed')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Reason/) as HTMLTextAreaElement).value).toBe('Close');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('my claims', () => {
  it('says what became of each claim', async () => {
    api(MINE, { items: [
      claim({ id: 'a', work_date: '2026-10-01', status: 'approved', payout: 'comp_off', comp_off_days: '1' }),
      claim({ id: 'b', work_date: '2026-10-02', status: 'approved', payout: 'comp_off', comp_off_days: '1.5' }),
      claim({ id: 'd', work_date: '2026-10-03', status: 'approved', payroll_period: '2026-10', payroll_status: 'finalized' }),
      claim({ id: 'e', work_date: '2026-10-04', status: 'approved', payroll_period: '2026-11', payroll_status: 'computed' }),
      claim({ id: 'g', work_date: '2026-10-05', status: 'approved' }),
      claim({ id: 'h', work_date: '2026-10-06', status: 'cancelled', cancel_reason: 'Duplicate' }),
      claim({ id: 'i', work_date: '2026-10-07', status: 'rejected' }),
      claim({ id: 'j', work_date: '2026-10-08', status: 'pending' }),
    ] });
    renderPage(<Overtime />);
    const table = await screen.findByRole('table', { name: 'My overtime claims' });
    expect(within(table).getByText('1 day added to leave')).toBeTruthy();
    expect(within(table).getByText('1.5 days added to leave')).toBeTruthy();
    expect(within(table).getByText('In 2026-10 payroll')).toBeTruthy();
    expect(within(table).getByText('In 2026-11 payroll (not final yet)')).toBeTruthy();
    expect(within(table).getByText('In the next payroll')).toBeTruthy();
    expect(within(table).getByText('Cancelled: Duplicate')).toBeTruthy();
    expect(within(table).getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    expect(within(table).getAllByText('1.5 h')).toHaveLength(8);
    expect(within(table).getAllByText('Compensatory off')).toHaveLength(2);
  });
  it('withdrawing asks with the hours and day, then posts', async () => {
    const f = api(MINE, { items: [claim()] });
    renderPage(<Overtime />);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw overtime claim' });
    expect(within(dlg).getByText(`Withdraw your claim for 1.5 h on ${fmtDate('2026-10-01')}? You can claim the day again.`)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/overtime/claims/c1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Claim withdrawn')).toBeTruthy();
  });
  it('pages on from the table', async () => {
    const f = api(MINE, { extra: (url, init) => (init.method === 'GET' && url.includes('scope=mine') ? paged([claim()], { total: 60 }) : undefined) });
    renderPage(<Overtime />);
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'scope=mine&page=2')).toHaveLength(1));
  });
});

describe('all claims', () => {
  const MANAGE = ['overtime.read', 'overtime.manage'];
  it('shows totals and who claimed what; a withheld reason stays hidden', async () => {
    api(MANAGE, { totals: { approved: 150 }, items: [claim({ status: 'approved' }), claim({ id: 'c2', name: 'Ali Khan', reason: null, masked: true, maskedFields: ['reason'], payout: 'comp_off' })] });
    renderPage(<Overtime />);
    const row = await screen.findByRole('row', { name: /Bela Roy/ });
    expect(within(row).getByText('E9')).toBeTruthy();
    expect(within(row).getByText('2h 00m')).toBeTruthy();
    expect(within(row).getByText('Month end')).toBeTruthy();
    const totals = screen.getByRole('group', { name: 'Overtime totals' });
    expect(within(totals).getByText('2.5 h')).toBeTruthy();
    expect(within(totals).getByText('0 h')).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Ali Khan/ })).getByText(/^Hidden\./)).toBeTruthy();
  });
  it('only approved claims outside a closing payroll can be cancelled, and only by a manager', async () => {
    api(MANAGE, { items: [
      claim({ id: 'a', name: 'Open One', status: 'approved' }),
      claim({ id: 'b', name: 'Draft Run', status: 'approved', payroll_status: 'computed' }),
      claim({ id: 'd', name: 'Final Run', status: 'approved', payroll_status: 'finalized' }),
      claim({ id: 'e', name: 'Still Pending', status: 'pending' }),
    ] });
    renderPage(<Overtime />);
    expect(within(await screen.findByRole('row', { name: /Open One/ })).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Draft Run/ })).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Final Run/ })).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(screen.getByRole('row', { name: /Still Pending/ })).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('a reader sees the claim and no way to cancel', async () => {
    api(['overtime.read'], { items: [claim({ status: 'approved' })] });
    renderPage(<Overtime />);
    await screen.findByRole('row', { name: /Bela Roy/ });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('cancelling pay names it, needs a reason, and tells when a run must be recomputed', async () => {
    const f = api(MANAGE, { items: [claim({ status: 'approved' })], extra: (url, init) => (url.includes('/cancel') && init.method === 'POST' ? { payrollRunToRecompute: '2026-10' } : undefined) });
    renderPage(<Overtime />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel approved overtime' });
    expect(within(dlg).getByText(/It will not be paid\./)).toBeTruthy();
    await userEvent.type(within(dlg).getByRole('textbox'), 'Wrong date');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel claim' }));
    await waitFor(() => expect(writes(f, '/overtime/claims/c1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/overtime/claims/c1/cancel')[0]!)).toEqual({ reason: 'Wrong date' });
    expect(await screen.findByText('Claim cancelled. Recompute the 2026-10 payroll run.')).toBeTruthy();
  });
  it('cancelling comp off warns it is taken back; a refusal stays open', async () => {
    let fail = true;
    api(MANAGE, { items: [claim({ status: 'approved', payout: 'comp_off', comp_off_days: 1 })], extra: (url, init) => { if (!url.includes('/cancel') || init.method !== 'POST') return undefined; if (fail) { fail = false; return problem(409, 'Leave already used'); } return {}; } });
    renderPage(<Overtime />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel approved overtime' });
    expect(within(dlg).getByText(/compensatory off is taken back/)).toBeTruthy();
    await userEvent.type(within(dlg).getByRole('textbox'), 'Wrong date');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel claim' }));
    expect(await within(dlg).findByText('Leave already used')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel claim' }));
    expect(await screen.findByText('Claim cancelled')).toBeTruthy();
  });
  it('filters by month and status go to the server, and paging follows', async () => {
    const f = api(MANAGE, { extra: (url, init) => (init.method === 'GET' ? paged([claim()], { total: 60 }) : undefined) });
    renderPage(<Overtime />);
    await screen.findByRole('row', { name: /Bela Roy/ });
    await userEvent.type(screen.getByLabelText('Month'), '2026-10');
    await waitFor(() => expect(reads(f, 'period=2026-10')).toHaveLength(1));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'returned');
    await waitFor(() => expect(reads(f, 'status=returned&period=2026-10')).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'page=2')).toHaveLength(1));
  });
});
