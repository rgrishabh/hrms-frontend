import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../components/Money';
import { addDays, fmtDate, todayLocal } from '../../format';
import { Travel } from '../../pages/Travel';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';
import type { Trip, TripDetailData } from './types';

const FLAG = ['FEATURE_TRAVEL'];
const CLAIMS = ['FEATURE_TRAVEL', 'FEATURE_EXPENSE_CLAIMS'];
const SELF = ['travel.self'];
const TODAY = '2026-03-02';
const trip = (over: Partial<Trip> = {}): Trip => ({ id: 't1', employee_id: 'e1', name: 'Rohan Iyer', employee_code: 'E5', department: 'Ops', start_date: '2026-03-10', end_date: '2026-03-12', origin: 'Pune', destination: 'Mumbai', purpose: 'Client audit', travel_mode: 'rail', trip_type: 'domestic', estimate_total: '5000', advance_requested: '0', advance_paid_at: null, advance_reference: null, status: 'approved', ...over });
const SETTLED = { advancePaid: '3000', claimed: '2000', advanceAdjusted: '2000', reimbursable: '0', recovered: '200', outstanding: '800', claims: [] };
const detail = (over: Partial<TripDetailData> = {}): TripDetailData => ({ ...trip(), settlement: SETTLED, estimate_travel: '4000', estimate_stay: '1000', estimate_local: '0', estimate_meals: '0', estimate_other: '0', ...over });

const api = (trips: Trip[], extra: Handler = () => undefined, one: TripDetailData = detail()): Handler => (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if ((init.method ?? 'GET') !== 'GET') return { id: 'c9', outstanding: '300' };
  if (/\/requests\/t\d$/.test(url)) return one;
  if (url.includes('/travel/requests')) return { items: trips, page: 1, pageSize: 25, total: trips.length, today: TODAY };
  return { items: [] };
};
const actionRow = async (name: string) => (await screen.findByRole('table', { name })).querySelector('tbody')!;

afterEach(() => vi.restoreAllMocks());

describe('tabs', () => {
  it('someone without travel access is told so', async () => {
    mockPageApi([], FLAG, () => ({ items: [] }));
    showPage(<Travel />, '/travel');
    expect(await screen.findByText('You do not have access to travel')).toBeTruthy();
  });
  it('a team lead sees their team with no advance filter', async () => {
    const f = mockPageApi(['travel.team.read'], FLAG, api([trip({ employee_id: 'e2' })]));
    showPage(<Travel />, '/travel');
    await screen.findByRole('table', { name: 'Trips' });
    expect(reads(f, 'scope=team').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Advance')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pay advance' })).toBeNull();
  });
});

describe('my trips', () => {
  it('with no trips, invites a request', async () => {
    mockPageApi(SELF, FLAG, api([]));
    showPage(<Travel />, '/travel');
    expect(await screen.findByText('No trips yet')).toBeTruthy();
  });

  it('describes a trip: mode, international, advance state', async () => {
    mockPageApi(SELF, FLAG, api([
      trip({ travel_mode: 'air', trip_type: 'international', advance_requested: '3000' }),
      trip({ id: 't2', travel_mode: 'hovercraft', advance_requested: '100', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'NEFT1', start_date: '2026-03-20', end_date: '2026-03-20' }),
      trip({ id: 't3', status: 'rejected', advance_requested: '500', purpose: 'Other work' }),
    ]));
    showPage(<Travel />, '/travel');
    const table = await screen.findByRole('table', { name: 'My trips' });
    expect(within(table).getByText('Air · international')).toBeTruthy();
    expect(within(table).getByText('hovercraft')).toBeTruthy();
    expect(within(table).getByText('Not paid yet')).toBeTruthy();
    expect(within(table).getByText('Paid · NEFT1')).toBeTruthy();
    expect(within(table).getByText(fmtDate('2026-03-20'))).toBeTruthy();
    expect(within(within(table).getByText('Other work').closest('tr')!).queryByText('Not paid yet')).toBeNull();
  });

  it('withdraws a pending request', async () => {
    const f = mockPageApi(SELF, FLAG, api([trip({ status: 'pending' })]));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw travel request' });
    expect(within(dlg).getByText(/Pune → Mumbai/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/requests/t1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Request withdrawn')).toBeTruthy();
  });

  it('points to the approver comment when a trip was returned', async () => {
    mockPageApi(SELF, FLAG, api([trip({ status: 'returned' })]));
    showPage(<Travel />, '/travel');
    expect((await screen.findByRole('link', { name: 'See the comment in Approvals' })).getAttribute('href')).toBe('/approvals?tab=mine');
  });

  it('a future approved trip is cancelled with a reason, and warns about a paid advance', async () => {
    const f = mockPageApi(SELF, FLAG, api([trip({ advance_requested: '100', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'NEFT1' })]));
    showPage(<Travel />, '/travel');
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    expect(screen.queryByRole('button', { name: 'Back from trip' })).toBeNull();
    await userEvent.click(cancel);
    const dlg = await screen.findByRole('dialog', { name: 'Cancel trip' });
    expect(within(dlg).getByText(/The advance paid to you must be returned to finance/)).toBeTruthy();
    const confirm = within(dlg).getByRole('button', { name: 'Cancel trip' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dlg).getByRole('textbox'), 'Client moved');
    await userEvent.click(confirm);
    await waitFor(() => expect(writes(f, '/requests/t1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/t1/cancel')[0]!)).toEqual({ reason: 'Client moved' });
    expect(await screen.findByText('Trip cancelled')).toBeTruthy();
  });

  it('a trip already under way is marked completed, not cancelled', async () => {
    const f = mockPageApi(SELF, FLAG, api([trip({ start_date: TODAY })]));
    showPage(<Travel />, '/travel');
    const back = await screen.findByRole('button', { name: 'Back from trip' });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.click(back);
    const dlg = await screen.findByRole('dialog', { name: 'Back from the trip' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark completed' }));
    await waitFor(() => expect(writes(f, '/requests/t1/complete')).toHaveLength(1));
    expect(await screen.findByText('Trip completed')).toBeTruthy();
  });

  it('starts a claim from the trip, only when claims are on', async () => {
    const f = mockPageApi(SELF, CLAIMS, api([trip({ status: 'completed' })]));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Claim expenses' }));
    await waitFor(() => expect(writes(f, '/requests/t1/claim')).toHaveLength(1));
  });

  it('a refused claim says why', async () => {
    mockPageApi(SELF, CLAIMS, api([trip({ status: 'completed' })], (url) => (url.endsWith('/claim') ? problem(409, 'A claim is already open') : undefined)));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Claim expenses' }));
    expect(await screen.findByText('A claim is already open')).toBeTruthy();
  });

  it('without the claims feature there is no Claim expenses', async () => {
    mockPageApi(SELF, FLAG, api([trip({ status: 'completed' })]));
    showPage(<Travel />, '/travel');
    await screen.findByRole('table', { name: 'My trips' });
    expect(screen.queryByRole('button', { name: 'Claim expenses' })).toBeNull();
  });
});

describe('trip detail', () => {
  it('shows only the estimate parts that were filled, the settlement and the claims', async () => {
    mockPageApi(SELF, FLAG, api([trip()], undefined, detail({ project: 'WO-9', on_duty_note: 'Two days already on leave', field_duty_id: 'fd1', settlement: { ...SETTLED, claims: [{ id: 'c1', title: 'Hotel claim', total: '2000', status: 'approved' }] } })));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const dlg = await screen.findByRole('dialog', { name: 'Trip — Pune → Mumbai' });
    expect(await within(dlg).findByText('Tickets / fuel')).toBeTruthy();
    expect(within(dlg).getByText('Stay')).toBeTruthy();
    expect(within(dlg).queryByText('Meals')).toBeNull();
    expect(within(dlg).getByText(/WO-9/)).toBeTruthy();
    expect(within(dlg).getByText('Two days already on leave')).toBeTruthy();
    expect(within(dlg).getByText('Counted as field duty in attendance.')).toBeTruthy();
    expect(within(dlg).getByText('Hotel claim')).toBeTruthy();
    const tiles = within(dlg).getByLabelText('Settlement');
    expect(within(tiles).getByText('Advance outstanding')).toBeTruthy();
    expect(within(tiles).getByText(formatMoney('800'))).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('leaves out the notes and claims a trip does not have', async () => {
    mockPageApi(SELF, FLAG, api([trip()], undefined, detail({ travel_mode: 'teleport' })));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const dlg = await screen.findByRole('dialog', { name: 'Trip — Pune → Mumbai' });
    expect(await within(dlg).findByText(/teleport/)).toBeTruthy();
    expect(within(dlg).queryByText(/Counted as field duty/)).toBeNull();
    expect(within(dlg).queryByRole('table', { name: 'Trip claims' })).toBeNull();
  });
});

describe('request form', () => {
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Request travel' }));
    return screen.findByRole('dialog', { name: 'Request travel' });
  };
  const num = (dlg: HTMLElement, label: RegExp, value: string) => fireEvent.change(within(dlg).getByLabelText(label), { target: { value } });

  it('sends the whole request, adds up the estimate, and blank parts go as zero', async () => {
    const f = mockPageApi(SELF, FLAG, api([]));
    showPage(<Travel />, '/travel');
    const dlg = await open();
    const start = addDays(todayLocal(), 5);
    const back = addDays(todayLocal(), 7);
    await userEvent.type(within(dlg).getByLabelText(/^Purpose/), 'Audit');
    await userEvent.type(within(dlg).getByLabelText(/^From \(city\)/), 'Pune');
    await userEvent.type(within(dlg).getByLabelText(/^Destination/), 'Delhi');
    fireEvent.change(within(dlg).getByLabelText(/^Start/), { target: { value: start } });
    fireEvent.change(within(dlg).getByLabelText(/^Return/), { target: { value: back } });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Mode/), 'air');
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Trip/), 'international');
    await userEvent.type(within(dlg).getByLabelText(/^Client/), 'WO-1');
    num(dlg, /^Tickets/, '1000');
    num(dlg, /^Stay/, '500.50');
    num(dlg, /^Advance needed/, '700');
    await userEvent.click(within(dlg).getByLabelText('Needs accommodation'));
    await userEvent.click(within(dlg).getByLabelText('Count the trip days as field duty'));
    expect(within(dlg).getByText(formatMoney(1500.5))).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/travel/requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/travel/requests')[0]!)).toEqual({ purpose: 'Audit', tripType: 'international', origin: 'Pune', destination: 'Delhi', startDate: start, endDate: back, travelMode: 'air', accommodation: true, project: 'WO-1', markOnDuty: false, estimate: { travel: '1000', stay: '500.50', local: 0, meals: 0, other: 0 }, advance: '700' });
    expect(await screen.findByText('Travel requested; sent for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('moving Start past Return pulls Return along; no project is left out of the request', async () => {
    const f = mockPageApi(SELF, FLAG, api([]));
    showPage(<Travel />, '/travel');
    const dlg = await open();
    const later = addDays(todayLocal(), 30);
    fireEvent.change(within(dlg).getByLabelText(/^Start/), { target: { value: later } });
    expect((within(dlg).getByLabelText(/^Return/) as HTMLInputElement).value).toBe(later);
    await userEvent.type(within(dlg).getByLabelText(/^Purpose/), 'Audit');
    await userEvent.type(within(dlg).getByLabelText(/^From \(city\)/), 'Pune');
    await userEvent.type(within(dlg).getByLabelText(/^Destination/), 'Delhi');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/travel/requests')).toHaveLength(1));
    const body = bodyOf(writes(f, '/travel/requests')[0]!);
    expect(body).not.toHaveProperty('project');
    expect(body).toMatchObject({ advance: 0, markOnDuty: true, accommodation: false });
  });

  it('a refused request stays open with the reason and what was typed', async () => {
    mockPageApi(SELF, FLAG, api([], (url, init) => (url.endsWith('/travel/requests') && init.method === 'POST' ? problem(422, 'Check the trip', { errors: [{ field: 'destination', message: 'Too vague' }] }) : undefined)));
    showPage(<Travel />, '/travel');
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText(/^Purpose/), 'Audit');
    await userEvent.type(within(dlg).getByLabelText(/^From \(city\)/), 'Pune');
    await userEvent.type(within(dlg).getByLabelText(/^Destination/), 'XY');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Too vague')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Purpose/) as HTMLTextAreaElement).value).toBe('Audit');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  const perDiem: Handler = (url) => {
    if (url.includes('/allowance-rates')) return { items: [], tiers: ['METRO', 'OTHER'], canManage: false };
    if (url.includes('/allowance-quote')) return url.includes('tier=OTHER') ? { rate: null } : { rate: '1000', quantity: '2', amount: '2000' };
    return undefined;
  };

  it('offers the per-diem for the dates and fills meals from it', async () => {
    const f = mockPageApi(SELF, CLAIMS, api([], perDiem));
    showPage(<Travel />, '/travel');
    const dlg = await open();
    const helper = await within(dlg).findByRole('group', { name: 'Per diem' });
    expect(await within(helper).findByText(/2 day\(s\) × /)).toBeTruthy();
    await userEvent.click(within(helper).getByRole('button', { name: 'Use for meals' }));
    expect((within(dlg).getByLabelText(/^Meals/) as HTMLInputElement).value).toBe('2000');
    expect(reads(f, `kind=per_diem&tier=METRO&date=${todayLocal()}&to=${todayLocal()}`).length).toBeGreaterThan(0);
    await userEvent.selectOptions(within(helper).getByLabelText(/^Per-diem class/), 'OTHER');
    expect(await within(helper).findByText('No per-diem rate for OTHER on these dates')).toBeTruthy();
    expect(within(helper).queryByRole('button', { name: 'Use for meals' })).toBeNull();
  });

  it('stays out of the way when there are no rates', async () => {
    mockPageApi(SELF, CLAIMS, api([], (url) => (url.includes('/allowance-rates') ? { items: [], tiers: [], canManage: false } : undefined)));
    showPage(<Travel />, '/travel');
    const dlg = await open();
    await waitFor(() => expect(within(dlg).queryByRole('group', { name: 'Per diem' })).toBeNull());
    expect(within(dlg).getByLabelText(/^Meals/)).toBeTruthy();
  });

  it('resubmitting a returned trip starts from its details and its still-future dates', async () => {
    const start = addDays(todayLocal(), 10);
    const end = addDays(todayLocal(), 11);
    const f = mockPageApi(SELF, FLAG, api([trip({ status: 'returned', start_date: start, end_date: end, project: 'WO-2' })]));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Correct and resubmit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Correct and resubmit' });
    expect((within(dlg).getByLabelText(/^Start/) as HTMLInputElement).value).toBe(start);
    expect((within(dlg).getByLabelText(/^Client/) as HTMLInputElement).value).toBe('WO-2');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/requests/t1/resubmit')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/t1/resubmit')[0]!)).toMatchObject({ startDate: start, endDate: end, origin: 'Pune', project: 'WO-2' });
    expect(await screen.findByText('Sent back for approval')).toBeTruthy();
  });
});

describe('everyone', () => {
  const PAY = ['expenses.pay', 'travel.read', 'travel.approve'];
  const other = (over: Partial<Trip> = {}) => trip({ employee_id: 'e2', ...over });

  it('filters by status, advance and date, and sends them to the server; clearing returns to all', async () => {
    const f = mockPageApi(PAY, FLAG, api([]));
    showPage(<Travel />, '/travel?tab=all');
    expect(await screen.findByText('No trips match')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await userEvent.selectOptions(screen.getByLabelText('Advance'), 'to_pay');
    fireEvent.change(screen.getByLabelText('Travelling on'), { target: { value: '2026-03-11' } });
    await waitFor(() => expect(reads(f, 'scope=all&status=approved&advance=to_pay&on=2026-03-11').length).toBeGreaterThan(0));
    expect(await screen.findByText('Try clearing the filters.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(''));
    expect(screen.queryByText('Try clearing the filters.')).toBeNull();
  });

  it('finance pays an advance with a reference, keeping it on refusal', async () => {
    let refuse = true;
    const f = mockPageApi(PAY, FLAG, api([other({ advance_requested: '3000' })], (url) => {
      if (!url.endsWith('/advance-paid')) return undefined;
      if (refuse) { refuse = false; return problem(409, 'Reference already used'); }
      return { ok: true };
    }));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Pay advance' }));
    const dlg = await screen.findByRole('dialog', { name: 'Pay travel advance' });
    expect(within(dlg).getByText(formatMoney('3000'))).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Payment reference/), 'NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record as paid' }));
    expect(await within(dlg).findByText('Reference already used')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record as paid' }));
    await waitFor(() => expect(writes(f, '/requests/t1/advance-paid')).toHaveLength(2));
    expect(bodyOf(writes(f, '/requests/t1/advance-paid')[1]!)).toEqual({ reference: 'NEFT-1' });
    expect(await screen.findByText('Advance recorded as paid')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('nobody handles their own advance or cancels their own trip here', async () => {
    mockPageApi(PAY, FLAG, api([trip({ advance_requested: '3000', advance_paid_at: null })]));
    showPage(<Travel />, '/travel?tab=all');
    await actionRow('Trips');
    expect(screen.queryByRole('button', { name: 'Pay advance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('records a returned advance up to what is outstanding', async () => {
    const f = mockPageApi(PAY, FLAG, api([other({ advance_requested: '3000', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'N1', department: null })]));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance returned' }));
    const dlg = await screen.findByRole('dialog', { name: 'Advance returned' });
    expect((await within(dlg).findByText(/still has/)).textContent).toContain(formatMoney(800));
    fireEvent.change(within(dlg).getByLabelText(/^Amount returned/), { target: { value: '900' } });
    await userEvent.type(within(dlg).getByLabelText(/^How it was returned/), 'Cash to accounts');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record' }));
    expect(await within(dlg).findByText(`Only ${formatMoney(800)} is outstanding`)).toBeTruthy();
    expect(writes(f, '/advance-returned')).toHaveLength(0);
    fireEvent.change(within(dlg).getByLabelText(/^Amount returned/), { target: { value: '500' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(writes(f, '/requests/t1/advance-returned')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/t1/advance-returned')[0]!)).toEqual({ amount: '500', note: 'Cash to accounts' });
    expect(await screen.findByText(`Recorded. Outstanding ${formatMoney('300')}`)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('with nothing outstanding, Record is held', async () => {
    mockPageApi(PAY, FLAG, api([other({ advance_requested: '3000', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'N1' })], undefined, detail({ settlement: { ...SETTLED, outstanding: '0' } })));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance returned' }));
    const dlg = await screen.findByRole('dialog', { name: 'Advance returned' });
    expect(((await within(dlg).findByRole('button', { name: 'Record' })) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes a completed trip; refusal keeps the dialog with the reason', async () => {
    let refuse = true;
    const f = mockPageApi(PAY, FLAG, api([other({ status: 'completed' })], (url) => {
      if (!url.endsWith('/close')) return undefined;
      if (refuse) { refuse = false; return problem(409, 'A claim is still in progress'); }
      return { ok: true };
    }));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    const dlg = await screen.findByRole('dialog', { name: 'Close trip' });
    expect(within(dlg).getByText(/Close Rohan Iyer's trip Pune → Mumbai/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close trip' }));
    expect(await within(dlg).findByText('A claim is still in progress')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close trip' }));
    await waitFor(() => expect(writes(f, '/requests/t1/close')).toHaveLength(2));
    expect(await screen.findByText('Trip closed')).toBeTruthy();
  });

  it('an approver cancels with a reason and is told a paid advance stays outstanding', async () => {
    const f = mockPageApi(['travel.approve'], FLAG, api([other({ advance_requested: '100', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'N1' })]));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel approved trip' });
    expect(within(dlg).getByText(/the paid advance stays outstanding until returned/)).toBeTruthy();
    await userEvent.type(within(dlg).getByRole('textbox'), 'Budget frozen');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel trip' }));
    await waitFor(() => expect(writes(f, '/requests/t1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/t1/cancel')[0]!)).toEqual({ reason: 'Budget frozen' });
    expect(await screen.findByText('Trip cancelled')).toBeTruthy();
  });

  it('opens details from the list', async () => {
    mockPageApi(['travel.read'], FLAG, api([other()]));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('dialog', { name: 'Trip — Pune → Mumbai' })).toBeTruthy();
  });
});
