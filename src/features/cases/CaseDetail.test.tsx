import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cases } from '../../pages/Cases';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

configure({ asyncUtilTimeout: 10000 });
afterEach(() => vi.restoreAllMocks());

const CASE = { id: 'c1', kind: 'grievance', reference: 'GR-0001', category: 'pay', status: 'open', anonymous: false, role: 'complainant', version: 3, complainantName: 'Asha', respondentName: null, respondentText: null, incidentDate: null, description: 'Pay was short by two days this month.', lateReason: null, outcome: null, receivedAt: '2026-11-01T04:30:00Z', inquiryDue: null, reportDue: null, slaDue: '2026-11-20', assigneeName: null, allowedMoves: [], events: [] };
const POSH = { ...CASE, kind: 'posh', reference: 'PC-0001', category: 'verbal', status: 'inquiry', role: 'handler', inquiryDue: '2027-01-30', reportDue: '2027-02-10', slaDue: null, allowedMoves: ['report_submitted', 'closed'] };

type Extra = (url: string, init: RequestInit) => unknown;
const open = (detail: object, perms: readonly string[] = ['cases.self'], extra: Extra = () => undefined) => {
  const f = mockPageApi(perms, ['FEATURE_GRIEVANCE', 'FEATURE_POSH'], (url, init) => {
    const out = extra(url, init);
    if (out !== undefined) return out;
    if (init.method !== 'GET') return { ok: true };
    if (url.includes('/cases/committee')) return { members: [], external: [], warnings: [] };
    if (url.endsWith('/cases/c1')) return detail;
    return { items: [] };
  });
  renderPage(<Cases />, '/cases?case=c1');
  return f;
};

describe('reading a case', () => {
  it('a handler sees the parties, the dates, the late reason and internal notes marked', async () => {
    open({ ...POSH, anonymous: true, respondentName: 'Ravi Nair', respondentText: 'A contractor too', incidentDate: '2026-10-02', lateReason: 'Was on medical leave', assigneeName: 'Priya', events: [
      { type: 'note', text: 'Spoke to witness', from_status: null, to_status: null, visible_to_complainant: false, at: '2026-11-02T05:00:00Z', actor: 'Priya' },
      { type: 'status', text: null, from_status: 'received', to_status: 'inquiry', visible_to_complainant: true, at: '2026-11-03T05:00:00Z', actor: null },
    ] });
    const dlg = await screen.findByRole('dialog', { name: 'PC-0001, POSH complaint' });
    await within(dlg).findByText('Verbal, filed 01/11/2026', { exact: false });
    expect(within(dlg).getByText('Inquiry due 30/01/2027')).toBeTruthy();
    expect(within(dlg).getByText('Anonymous')).toBeTruthy();
    expect(within(dlg).getByText('Ravi Nair')).toBeTruthy();
    expect(within(dlg).getByText('A contractor too')).toBeTruthy();
    expect(within(dlg).getByText('Priya', { selector: 'dd,dd *' })).toBeTruthy();
    expect(within(dlg).getByText('Incident date: 02/10/2026')).toBeTruthy();
    expect(within(dlg).getByText('Filed late: Was on medical leave')).toBeTruthy();
    const note = within(dlg).getByText('Spoke to witness').closest('li')!;
    expect(within(note).getByText('Internal')).toBeTruthy();
    const change = within(dlg).getByText('Received → Inquiry').closest('li')!;
    expect(within(change).getByText('—')).toBeTruthy();
    expect(within(change).queryByText('Internal')).toBeNull();
  });
  it('a POSH case with the report in shows the report date', async () => {
    open({ ...POSH, status: 'report_submitted' });
    expect(await screen.findByText('Report due 10/02/2027')).toBeTruthy();
    expect(screen.queryByText(/Inquiry due/)).toBeNull();
  });
  it('a complainant sees the response date, no handler details and no internal mark', async () => {
    open({ ...CASE, events: [{ type: 'note', text: 'We are looking at it', from_status: null, to_status: 'in_progress', visible_to_complainant: false, at: '2026-11-02T05:00:00Z', actor: 'HR' }] });
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    expect(await within(dlg).findByText('Response due 20/11/2026')).toBeTruthy();
    expect(within(dlg).getByText('We are looking at it')).toBeTruthy();
    expect(within(dlg).getByText(/→ In progress/)).toBeTruthy();
    expect(within(dlg).queryByText('Internal')).toBeNull();
    expect(within(dlg).queryByText('Complainant')).toBeNull();
    expect(within(dlg).queryByRole('checkbox', { name: /Share with the complainant/ })).toBeNull();
  });
  it('a closed case shows its outcome, no form and no way to withdraw', async () => {
    open({ ...CASE, status: 'closed', outcome: 'Arrears paid', slaDue: null });
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    expect(await within(dlg).findByText('Outcome: Arrears paid')).toBeTruthy();
    expect(within(dlg).getByText('None yet.')).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
  it('a case that cannot be loaded says why', async () => {
    open(CASE, undefined, (url) => (url.endsWith('/cases/c1') ? problem(404, 'No such case') : undefined));
    expect(await screen.findByText('No such case')).toBeTruthy();
  });
});

describe('updating a case', () => {
  it('a complainant comment is always shared, and carries the version read', async () => {
    const f = open(CASE);
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await userEvent.type(await within(dlg).findByLabelText(/Add a comment/), 'Any news?');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/c1/events')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/c1/events')[0]!)).toEqual({ text: 'Any news?', visibleToComplainant: true, expectedVersion: 3 });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect((within(dlg).getByLabelText(/Add a comment/) as HTMLTextAreaElement).value).toBe(''));
  });
  it('a handler note is private until shared', async () => {
    const f = open({ ...POSH, kind: 'grievance', reference: 'GR-0002', allowedMoves: [] });
    const dlg = await screen.findByRole('dialog', { name: 'GR-0002, grievance' });
    const note = await within(dlg).findByLabelText(/Add a note or update/);
    expect(within(dlg).queryByLabelText(/^Status/)).toBeNull();
    await userEvent.type(note, 'Called them');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/c1/events')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/c1/events')[0]!).visibleToComplainant).toBe(false);
    await userEvent.type(note, 'Told them');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Share with the complainant/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/c1/events')).toHaveLength(2));
    expect(bodyOf(writes(f, '/cases/c1/events')[1]!).visibleToComplainant).toBe(true);
  });
  it('closing a POSH case asks for the outcome and sends it with the move', async () => {
    const f = open(POSH);
    const dlg = await screen.findByRole('dialog', { name: 'PC-0001, POSH complaint' });
    await userEvent.type(await within(dlg).findByLabelText(/Add a note or update/), 'Inquiry finished');
    expect(within(dlg).queryByLabelText(/Outcome or recommendations/)).toBeNull();
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Status/), 'closed');
    const outcome = within(dlg).getByLabelText(/Outcome or recommendations/) as HTMLTextAreaElement;
    expect(outcome.required).toBe(true);
    await userEvent.type(outcome, 'Warning issued');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/c1/events')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/c1/events')[0]!)).toEqual({ text: 'Inquiry finished', visibleToComplainant: false, toStatus: 'closed', outcome: 'Warning issued', expectedVersion: 3 });
  });
  it('a complainant unhappy with a resolved grievance can reopen it, or change their mind', async () => {
    const f = open({ ...CASE, status: 'resolved' });
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await userEvent.type(await within(dlg).findByLabelText(/Add a comment/), 'Still short');
    const reopen = within(dlg).getByRole('checkbox', { name: 'Not resolved: reopen' });
    await userEvent.click(reopen);
    await userEvent.click(reopen);
    await userEvent.click(reopen);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/c1/events')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/c1/events')[0]!).toStatus).toBe('reopened');
  });
  it('a refused update stays open with the reason and the text', async () => {
    open(CASE, undefined, (url, init) => (url.endsWith('/events') && init.method === 'POST' ? problem(409, 'Someone else updated this case') : undefined));
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await userEvent.type(await within(dlg).findByLabelText(/Add a comment/), 'Any news?');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Someone else updated this case')).toBeTruthy();
    expect((within(dlg).getByLabelText(/Add a comment/) as HTMLTextAreaElement).value).toBe('Any news?');
  });
  it('closing with a typed comment asks before throwing it away', async () => {
    open(CASE);
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await userEvent.type(await within(dlg).findByLabelText(/Add a comment/), 'Half written');
    await userEvent.click(within(dlg).getAllByRole('button', { name: 'Close' })[0]!);
    expect(await within(dlg).findByRole('group', { name: 'Unsaved changes' })).toBeTruthy();
    expect((within(dlg).getByLabelText(/Add a comment/) as HTMLTextAreaElement).value).toBe('Half written');
  });
  it('closing an untouched case removes it from the page', async () => {
    open(CASE);
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await within(dlg).findByLabelText(/Add a comment/);
    await userEvent.click(within(dlg).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('withdrawing and assigning', () => {
  it('a withdrawal sends the reason', async () => {
    const f = open(CASE);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const confirm = await screen.findByRole('dialog', { name: 'Withdraw case' });
    await userEvent.type(within(confirm).getByRole('textbox'), 'Sorted out directly');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText('Withdrawn')).toBeTruthy();
    expect(bodyOf(writes(f, '/cases/c1/withdraw')[0]!)).toEqual({ reason: 'Sorted out directly' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Withdraw case' })).toBeNull());
  });
  it('assign is for a grievance manager, not for POSH or an ordinary person', async () => {
    open(POSH, ['cases.self', 'grievance.manage']);
    const dlg = await screen.findByRole('dialog', { name: 'PC-0001, POSH complaint' });
    await within(dlg).findByLabelText(/Add a note or update/);
    expect(within(dlg).queryByRole('button', { name: 'Assign handler' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
  it('a manager searches people by name and assigns the one picked', async () => {
    const f = open({ ...CASE, role: 'handler' }, ['cases.self', 'grievance.manage'], (url) => (url.includes('/cases/people') ? { items: [{ id: 'u7', display_name: 'Priya Shah' }, { id: 'u8', display_name: 'Sunil Rao' }] } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Assign handler' }));
    const form = await screen.findByRole('dialog', { name: 'Assign handler' });
    await userEvent.type(within(form).getByRole('combobox', { name: /Handler/ }), 'pri');
    await waitFor(() => expect(reads(f, '/cases/people?search=pri').length).toBeGreaterThan(0));
    await userEvent.click(await within(form).findByRole('option', { name: 'Priya Shah' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(writes(f, '/cases/c1/assign')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/c1/assign')[0]!)).toEqual({ userId: 'u7' });
    expect(await screen.findByText('Assigned')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign handler' })).toBeNull());
  });
  it('a refused assignment stays open with the reason and the person chosen', async () => {
    open({ ...CASE, role: 'handler' }, ['cases.self', 'grievance.manage'], (url, init) => {
      if (url.includes('/cases/people')) return { items: [{ id: 'u7', display_name: 'Priya Shah' }] };
      if (url.endsWith('/assign') && init.method === 'POST') return problem(422, 'The person named cannot handle it');
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Assign handler' }));
    const form = await screen.findByRole('dialog', { name: 'Assign handler' });
    await userEvent.click(within(form).getByRole('combobox', { name: /Handler/ }));
    await userEvent.click(await within(form).findByRole('option', { name: 'Priya Shah' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Assign' }));
    expect(await within(form).findByText('The person named cannot handle it')).toBeTruthy();
    expect(within(form).getByText('Priya Shah')).toBeTruthy();
  });
});
