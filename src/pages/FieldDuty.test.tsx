import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../test/page';
import { FieldDuty } from './FieldDuty';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const duty = (over = {}) => ({ id: 'f1', employee_id: 'e9', start_date: '2026-11-10', end_date: '2026-11-10', day_part: 'full', purpose: 'client_visit', place: 'Pune', client_name: null, reference: null, reason: 'Visit', status: 'pending', outcome: null, outcome_note: null, cancel_reason: null, recorded_by_other: false, name: 'Bela Roy', employee_code: 'E9', department: null, ...over });
const TODAY = '2026-11-05';
const page = (items: unknown[], extra = {}) => ({ items, page: 1, pageSize: 25, total: items.length, today: TODAY, ...extra });
const api = (perms: string[], items: unknown[], extra: Handler = () => undefined, flags: string[] = []) => mockPageApi(perms, flags, (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Bela', last_name: 'Roy', employee_code: 'E9' }] };
  return page(items);
});
const MINE = ['field_duty.self'];
const row = (name: RegExp) => screen.findByRole('row', { name });

afterEach(() => vi.restoreAllMocks());

describe('access', () => {
  it('without permission says so', async () => {
    api([], []);
    renderPage(<FieldDuty />);
    expect(await screen.findByText('You do not have access to field duty.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('someone with no employee record does not get a personal tab', async () => {
    mockPageApi(['field_duty.self', 'field_duty.read'], [], () => page([]), null);
    renderPage(<FieldDuty />);
    expect(await screen.findByText('No field duty matches.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('tabs follow permissions and ask for their own scope', async () => {
    const f = api(['field_duty.self', 'field_duty.team.read', 'field_duty.read'], []);
    renderPage(<FieldDuty />);
    expect(await screen.findByText('No field duty yet.')).toBeTruthy();
    expect(reads(f, '/field-duty/requests?scope=mine&page=1&pageSize=25')).toHaveLength(1);
    await userEvent.click(screen.getByRole('tab', { name: 'My team' }));
    await waitFor(() => expect(reads(f, 'scope=team')).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: 'Everyone' }));
    await waitFor(() => expect(reads(f, 'scope=all')).toHaveLength(1));
  });
});

describe('my field duty', () => {
  it('reads each kind of date and report, and offers only the action the status allows', async () => {
    api(MINE, [
      duty({ id: 'a', place: 'Pending place', client_name: 'Tata', reference: 'WO-1', day_part: 'first_half' }),
      duty({ id: 'b', place: 'Future place', status: 'approved', start_date: '2026-11-20', end_date: '2026-11-22', recorded_by_other: true, client_name: 'Infosys' }),
      duty({ id: 'c', place: 'Past place', status: 'approved', start_date: TODAY, end_date: TODAY, purpose: 'site_audit' }),
      duty({ id: 'd', place: 'Reported place', status: 'approved', start_date: '2026-11-01', end_date: '2026-11-01', outcome: 'partly_completed', outcome_note: 'Rain', purpose: 'unknown_code' }),
      duty({ id: 'e', place: 'Cancelled place', status: 'cancelled', cancel_reason: 'Client postponed' }),
      duty({ id: 'g', place: 'Bare place', status: 'approved', start_date: '2026-11-02', end_date: '2026-11-02', outcome: 'completed' }),
    ]);
    renderPage(<FieldDuty />);
    const pending = await row(/Pending place/);
    expect(within(pending).getByText(`${fmtDate('2026-11-10')} · first half`)).toBeTruthy();
    expect(within(pending).getByText('Tata · WO-1')).toBeTruthy();
    expect(within(pending).getByText('Client visit')).toBeTruthy();
    expect(within(pending).getByRole('button', { name: 'Withdraw' })).toBeTruthy();
    const future = await row(/Future place/);
    expect(within(future).getByText(`${fmtDate('2026-11-20')} – ${fmtDate('2026-11-22')}`)).toBeTruthy();
    expect(within(future).getByText('Recorded by HR')).toBeTruthy();
    expect(within(future).getByText('Infosys')).toBeTruthy();
    expect(within(future).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const past = await row(/Past place/);
    expect(within(past).getByText('Site audit')).toBeTruthy();
    expect(within(past).getByRole('button', { name: 'Report' })).toBeTruthy();
    const reported = await row(/Reported place/);
    expect(within(reported).getByText('Rain')).toBeTruthy();
    expect(within(reported).getByText('unknown_code')).toBeTruthy();
    expect(within(reported).getByRole('button', { name: 'Edit report' })).toBeTruthy();
    const cancelled = await row(/Cancelled place/);
    expect(within(cancelled).getByText('Cancelled: Client postponed')).toBeTruthy();
    expect(within(cancelled).queryByRole('button')).toBeNull();
    expect(within(await row(/Bare place/)).getByRole('button', { name: 'Edit report' })).toBeTruthy();
  });
  it('field work reads as sampling only for laboratories', async () => {
    api(MINE, [duty({ purpose: 'field_sampling' })], undefined, ['FEATURE_LAB_COMPETENCY']);
    renderPage(<FieldDuty />);
    expect(await screen.findByText('Field sampling')).toBeTruthy();
  });
  it('a generic installation reads it as field work', async () => {
    api(MINE, [duty({ purpose: 'field_sampling' })]);
    renderPage(<FieldDuty />);
    expect(await screen.findByText('Field work')).toBeTruthy();
  });
  it('pages on from the table', async () => {
    const f = api(MINE, [], (url, init) => (init.method === 'GET' && url.includes('scope=mine') ? { ...page([duty()]), total: 60 } : undefined));
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'scope=mine&page=2')).toHaveLength(1));
  });
  it('withdrawing posts and thanks', async () => {
    const f = api(MINE, [duty()]);
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw field duty request' });
    expect(within(dlg).getByText(`Withdraw your field duty for ${fmtDate('2026-11-10')}?`)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/field-duty/requests/f1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Request withdrawn')).toBeTruthy();
  });
  it('cancelling an approved future duty needs a reason and posts it', async () => {
    const f = api(MINE, [duty({ status: 'approved', start_date: '2026-11-20', end_date: '2026-11-20' })]);
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel field duty' });
    const go = within(dlg).getByRole('button', { name: 'Cancel field duty' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(within(dlg).getByRole('textbox'), 'Plans changed');
    await userEvent.click(go);
    await waitFor(() => expect(writes(f, '/field-duty/requests/f1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/field-duty/requests/f1/cancel')[0]!)).toEqual({ reason: 'Plans changed' });
    expect(await screen.findByText('Field duty cancelled')).toBeTruthy();
  });
});

describe('asking for field duty', () => {
  const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Request field duty' })); return screen.findByRole('dialog', { name: 'Request field duty' }); };
  const date = async (dlg: HTMLElement, label: RegExp, value: string) => { const el = within(dlg).getByLabelText(label); await userEvent.clear(el); await userEvent.type(el, value); };
  it('posts one day with optional fields left out', async () => {
    const f = api(MINE, []);
    renderPage(<FieldDuty />);
    const dlg = await open();
    await date(dlg, /^From/, '2026-11-12');
    await userEvent.selectOptions(within(dlg).getByLabelText('Day'), 'second_half');
    await userEvent.selectOptions(within(dlg).getByLabelText('Purpose'), 'training');
    await userEvent.type(within(dlg).getByLabelText(/^Place/), 'Mumbai');
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Course');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/field-duty/requests')).toHaveLength(1));
    const post = writes(f, '/field-duty/requests')[0]!;
    expect(String(post[0])).toBe('/api/v1/field-duty/requests');
    expect(bodyOf(post)).toEqual({ startDate: '2026-11-12', endDate: '2026-11-12', dayPart: 'second_half', purpose: 'training', place: 'Mumbai', reason: 'Course' });
    expect(await screen.findByText('Field duty requested; sent for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('more than one day forces a full day, and client and reference go with it', async () => {
    const f = api(MINE, []);
    renderPage(<FieldDuty />);
    const dlg = await open();
    await date(dlg, /^From/, '2026-11-12');
    await userEvent.selectOptions(within(dlg).getByLabelText('Day'), 'first_half');
    await date(dlg, /^To/, '2026-11-14');
    expect((within(dlg).getByLabelText('Day') as HTMLSelectElement).value).toBe('full');
    expect((within(dlg).getByLabelText('Day') as HTMLSelectElement).disabled).toBe(true);
    expect(within(dlg).getByText('Half days are for a single date')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Place/), 'Mumbai');
    await userEvent.type(within(dlg).getByLabelText(/^Client/), 'Tata');
    await userEvent.type(within(dlg).getByLabelText(/^Work order/), 'WO-9');
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Audit');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/field-duty/requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/field-duty/requests')[0]!)).toMatchObject({ startDate: '2026-11-12', endDate: '2026-11-14', dayPart: 'full', clientName: 'Tata', reference: 'WO-9' });
  });
  it('moving From past To brings To along', async () => {
    api(MINE, []);
    renderPage(<FieldDuty />);
    const dlg = await open();
    await date(dlg, /^From/, '2030-01-15');
    expect((within(dlg).getByLabelText(/^To/) as HTMLInputElement).value).toBe('2030-01-15');
  });
  it('a refusal stays open with the reason and field messages', async () => {
    api(MINE, [], (url, init) => (init.method === 'POST' ? problem(409, 'Overlaps approved leave') : undefined));
    renderPage(<FieldDuty />);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText(/^Place/), 'Mumbai');
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Audit');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Overlaps approved leave')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Place/) as HTMLInputElement).value).toBe('Mumbai');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('reporting on a duty', () => {
  const approved = duty({ status: 'approved', start_date: TODAY, end_date: TODAY });
  const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Report' })); return screen.findByRole('dialog', { name: `Field duty report — ${fmtDate(TODAY)}` }); };
  it('completed needs no note, and sends none', async () => {
    const f = api(MINE, [approved]);
    renderPage(<FieldDuty />);
    const dlg = await open();
    expect(within(dlg).getByText('Client visit at Pune')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    await waitFor(() => expect(writes(f, '/field-duty/requests/f1/report')).toHaveLength(1));
    expect(bodyOf(writes(f, '/field-duty/requests/f1/report')[0]!)).toEqual({ outcome: 'completed' });
    expect(await screen.findByText('Report saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('anything else asks what was not done, and requires it', async () => {
    const f = api(MINE, [approved]);
    renderPage(<FieldDuty />);
    const dlg = await open();
    await userEvent.selectOptions(within(dlg).getByLabelText('Outcome'), 'not_done');
    const note = within(dlg).getByLabelText(/What was not done, and why/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    expect(writes(f, '/report')).toHaveLength(0);
    await userEvent.type(note, 'Client closed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    await waitFor(() => expect(writes(f, '/report')).toHaveLength(1));
    expect(bodyOf(writes(f, '/report')[0]!)).toEqual({ outcome: 'not_done', note: 'Client closed' });
  });
  it('editing starts from the saved report; a refusal stays open with the reason', async () => {
    api(MINE, [{ ...approved, outcome: 'partly_completed', outcome_note: 'Half', purpose: 'unknown_code' }], (url, init) => (init.method === 'POST' ? problem(409, 'Report window closed') : undefined));
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit report' }));
    const dlg = await screen.findByRole('dialog', { name: /Field duty report/ });
    expect(within(dlg).getByText('unknown_code at Pune')).toBeTruthy();
    expect((within(dlg).getByLabelText('Outcome') as HTMLSelectElement).value).toBe('partly_completed');
    expect((within(dlg).getByLabelText(/What was not done/) as HTMLTextAreaElement).value).toBe('Half');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    expect(await within(dlg).findByText('Report window closed')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('everyone', () => {
  const MANAGE = ['field_duty.read', 'field_duty.manage'];
  it('shows who and why, hides a withheld reason, and only others\' approved duty can be cancelled', async () => {
    api(MANAGE, [
      duty({ id: 'a', place: 'Mine', status: 'approved', employee_id: 'e1' }),
      duty({ id: 'b', place: 'Theirs', status: 'approved', department: 'Ops', outcome: 'completed' }),
      duty({ id: 'c', place: 'Waiting', reason: null, masked: true, maskedFields: ['reason'], purpose: 'made_up' }),
    ]);
    renderPage(<FieldDuty />);
    const theirs = await row(/Theirs/);
    expect(within(theirs).getByText('E9 · Ops')).toBeTruthy();
    expect(within(theirs).getByText('Visit')).toBeTruthy();
    expect(within(theirs).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(await row(/Mine/)).queryByRole('button', { name: 'Cancel' })).toBeNull();
    const waiting = await row(/Waiting/);
    expect(within(waiting).getByText(/^Hidden\./)).toBeTruthy();
    expect(within(waiting).getByText('made_up')).toBeTruthy();
    expect(within(waiting).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('a read-only role can neither record nor cancel', async () => {
    api(['field_duty.read'], [duty({ status: 'approved' })]);
    renderPage(<FieldDuty />);
    await row(/Pune/);
    expect(screen.queryByRole('button', { name: 'Record field duty' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('filters go to the server, Out today uses the server\'s date, and clearing resets them', async () => {
    const f = api(MANAGE, [], (url, init) => (init.method === 'GET' && url.includes('scope=all') ? page([duty()], { total: 60 }) : undefined));
    renderPage(<FieldDuty />);
    await row(/Pune/);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await waitFor(() => expect(reads(f, 'status=approved')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Out today' }));
    await waitFor(() => expect(reads(f, `on=${TODAY}`)).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'page=2')).toHaveLength(1));
    const on = screen.getByLabelText('On date');
    await userEvent.clear(on);
    await userEvent.type(on, '2026-11-01');
    await waitFor(() => expect(reads(f, 'on=2026-11-01')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(''));
    expect((screen.getByLabelText('On date') as HTMLInputElement).value).toBe('');
  });
  it('recording for someone needs an employee and sends their id', async () => {
    const f = api(MANAGE, []);
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Record field duty' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record field duty for an employee' });
    const person = within(dlg).getByRole('combobox', { name: /Employee/ });
    await userEvent.type(person, 'Bel');
    await waitFor(() => expect(reads(f, 'search=Bel')).toHaveLength(1)); // the search has settled, so the options will not change under the click
    await userEvent.type(within(dlg).getByLabelText(/^Place/), 'Mumbai');
    await userEvent.type(within(dlg).getByLabelText(/^Reason/), 'Audit');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(dlg).findByText('Choose an employee')).toBeTruthy();
    expect(writes(f, '/field-duty/requests')).toHaveLength(0);
    await userEvent.click(person);
    await userEvent.click(await within(dlg).findByRole('option', { name: /Bela Roy/ }));
    expect(within(dlg).queryByText('Choose an employee')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/field-duty/requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/field-duty/requests')[0]!)).toMatchObject({ employeeId: 'e9', place: 'Mumbai' });
    expect(await screen.findByText('Field duty recorded; sent to the manager for approval')).toBeTruthy();
  });
  it('cancelling someone\'s duty names them, needs a reason and posts it', async () => {
    const f = api(MANAGE, [duty({ status: 'approved' })]);
    renderPage(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel approved field duty' });
    expect(within(dlg).getByText(/Cancel Bela Roy's field duty/)).toBeTruthy();
    await userEvent.type(within(dlg).getByRole('textbox'), 'Duplicate');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel field duty' }));
    await waitFor(() => expect(writes(f, '/requests/f1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/requests/f1/cancel')[0]!)).toEqual({ reason: 'Duplicate' });
    expect(await screen.findByText('Field duty cancelled')).toBeTruthy();
  });
});
