import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayLocal } from '../../format';
import { Cases } from '../../pages/Cases';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

afterEach(() => vi.restoreAllMocks());

const BOTH = ['FEATURE_GRIEVANCE', 'FEATURE_POSH'];
const row = (over: object = {}) => ({ id: 'c1', kind: 'grievance', reference: 'GR-0001', category: 'pay', status: 'open', anonymous: false, received_at: '2026-11-01T04:30:00Z', inquiry_due: null, report_due: null, sla_due: '2026-11-20', complainant_name: 'Asha', assignee_name: 'Priya', ...over });
const POSH_ROW = row({ id: 'c2', kind: 'posh', reference: 'PC-0001', category: 'verbal', status: 'inquiry', inquiry_due: '2027-01-30', report_due: '2027-02-10', sla_due: null, assignee_name: null });
const DETAIL = { id: 'c9', kind: 'grievance', reference: 'GR-0009', category: 'pay', status: 'open', anonymous: false, role: 'complainant', version: 1, complainantName: 'A', incidentDate: null, description: 'Text', lateReason: null, outcome: null, receivedAt: '2026-11-01T04:30:00Z', inquiryDue: null, reportDue: null, slaDue: null, assigneeName: null, allowedMoves: [], events: [] };

type Extra = (url: string, init: RequestInit) => unknown;
const api = (flags: readonly string[], perms: readonly string[], extra: Extra = () => undefined) => mockPageApi(perms, flags, (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (init.method !== 'GET') return { ok: true };
  if (url.includes('/cases/committee')) return { members: [{ user_id: 'u1', display_name: 'A', role: 'member' }], external: [], warnings: [] };
  return { items: [] };
});

describe('my cases', () => {
  it('lists grievances and complaints together and marks anonymous ones', async () => {
    const f = api(BOTH, ['cases.self'], (url) => {
      if (url.includes('kind=grievance&scope=mine')) return { items: [row({ anonymous: true, category: 'custom' })] };
      if (url.includes('kind=posh&scope=mine')) return { items: [POSH_ROW] };
      return undefined;
    });
    renderPage(<Cases />);
    const gr = (await screen.findByRole('button', { name: 'GR-0001' })).closest('tr')!;
    expect(within(gr).getByText('Grievance (anonymous)')).toBeTruthy();
    expect(within(gr).getByText('custom')).toBeTruthy();
    const pc = screen.getByRole('button', { name: 'PC-0001' }).closest('tr')!;
    expect(within(pc).getByText('POSH')).toBeTruthy();
    expect(within(pc).getByText('Verbal')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Grievances & POSH' })).toBeTruthy();
    expect(reads(f, 'kind=posh&scope=mine')).toHaveLength(1);
  });
  it('nothing raised says it can be raised in confidence; POSH alone is named as POSH', async () => {
    const f = api(['FEATURE_POSH'], ['cases.self']);
    renderPage(<Cases />);
    expect(await screen.findByText('You have not raised any case')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'POSH' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise a grievance' })).toBeNull();
    expect(reads(f, 'kind=grievance')).toHaveLength(0);
  });
  it('a failed list says why, and retry asks again for just what failed', async () => {
    let fail = true;
    const f = api(BOTH, ['cases.self'], (url) => {
      if (url.includes('kind=grievance&scope=mine') && fail) return problem(500, 'Cases are unavailable');
      return undefined;
    });
    renderPage(<Cases />);
    expect(await screen.findByText('Cases are unavailable')).toBeTruthy();
    const poshAsked = reads(f, 'kind=posh&scope=mine').length;
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByText('You have not raised any case')).toBeTruthy();
    expect(reads(f, 'kind=grievance&scope=mine').length).toBeGreaterThan(1);
    expect(reads(f, 'kind=posh&scope=mine')).toHaveLength(poshAsked);
  });
});

describe('filing', () => {
  it('a POSH complaint explains who sees it, requires the date and sends everything', async () => {
    const f = api(BOTH, ['cases.self'], (url, init) => {
      if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Nina', last_name: 'Das', employee_code: 'E9' }] };
      if (url.endsWith('/api/v1/cases') && init.method === 'POST') return { id: 'c9', reference: 'PC-0009' };
      if (url.endsWith('/cases/c9')) return { ...DETAIL, kind: 'posh', reference: 'PC-0009' };
      return undefined;
    });
    renderPage(<Cases />);
    await userEvent.click(await screen.findByRole('button', { name: 'File a POSH complaint' }));
    const form = await screen.findByRole('dialog', { name: 'File a POSH complaint' });
    expect(within(form).getByText(/HR and administrators cannot see it/)).toBeTruthy();
    expect(within(form).queryByRole('checkbox', { name: /anonymously/ })).toBeNull();
    const when = within(form).getByLabelText(/When did it happen/) as HTMLInputElement;
    expect(when.required).toBe(true);
    expect(when.max).toBe(todayLocal());
    fireEvent.change(when, { target: { value: addDays(todayLocal(), -100) } });
    await userEvent.selectOptions(within(form).getByLabelText(/Category/), 'online');
    await userEvent.type(within(form).getByLabelText(/What happened/), 'Messages were sent after work hours repeatedly.');
    await userEvent.click(within(form).getByRole('combobox', { name: /Respondent/ }));
    await userEvent.click(await within(form).findByRole('option', { name: /Nina Das/ }));
    await userEvent.type(within(form).getByLabelText(/Or describe the person/), 'Also a vendor');
    await userEvent.type(within(form).getByLabelText(/more than three months/), 'Was afraid to report');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/api/v1/cases')).toHaveLength(1));
    expect(bodyOf(writes(f, '/api/v1/cases')[0]!)).toEqual({ kind: 'posh', category: 'online', description: 'Messages were sent after work hours repeatedly.', incidentDate: addDays(todayLocal(), -100), respondentEmployeeId: 'e9', respondentText: 'Also a vendor', anonymous: false, lateReason: 'Was afraid to report' });
    expect(await screen.findByText('Filed as PC-0009')).toBeTruthy();
    expect(await screen.findByRole('dialog', { name: 'PC-0009, POSH complaint' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'File a POSH complaint' })).toBeNull();
  });
  it('a grievance can be anonymous and sends nulls for what was left blank', async () => {
    const f = api(BOTH, ['cases.self'], (url, init) => {
      if (url.endsWith('/api/v1/cases') && init.method === 'POST') return { id: 'c9', reference: 'GR-0009' };
      if (url.endsWith('/cases/c9')) return DETAIL;
      return undefined;
    });
    renderPage(<Cases />);
    await userEvent.click(await screen.findByRole('button', { name: 'Raise a grievance' }));
    const form = await screen.findByRole('dialog', { name: 'Raise a grievance' });
    expect((within(form).getByLabelText(/When did it happen/) as HTMLInputElement).required).toBe(false);
    expect(within(form).queryByLabelText(/more than three months/)).toBeNull();
    await userEvent.type(within(form).getByLabelText(/What happened/), 'The overtime was not paid for October.');
    await userEvent.click(within(form).getByRole('checkbox', { name: /Raise anonymously/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/api/v1/cases')).toHaveLength(1));
    expect(bodyOf(writes(f, '/api/v1/cases')[0]!)).toEqual({ kind: 'grievance', category: 'pay', description: 'The overtime was not paid for October.', incidentDate: null, respondentEmployeeId: null, respondentText: null, anonymous: true, lateReason: null });
  });
  it('a refused filing stays open with the reason and the text, and Cancel sends nothing more', async () => {
    const f = api(BOTH, ['cases.self'], (url, init) => (url.endsWith('/api/v1/cases') && init.method === 'POST' ? problem(422, 'Describe it in more detail') : undefined));
    renderPage(<Cases />);
    await userEvent.click(await screen.findByRole('button', { name: 'Raise a grievance' }));
    const form = await screen.findByRole('dialog', { name: 'Raise a grievance' });
    const text = 'The overtime was not paid for October.';
    await userEvent.type(within(form).getByLabelText(/What happened/), text);
    await userEvent.click(within(form).getByRole('button', { name: 'Submit' }));
    expect(await within(form).findByText('Describe it in more detail')).toBeTruthy();
    expect((within(form).getByLabelText(/What happened/) as HTMLTextAreaElement).value).toBe(text);
    expect(writes(f, '/api/v1/cases')).toHaveLength(1);
  });
});

describe('handling', () => {
  const today = todayLocal();
  const managed = (extra: Extra = () => undefined) => api(BOTH, ['cases.self', 'grievance.manage'], extra);
  it('a grievance manager sees complainants, handlers and which responses are late', async () => {
    managed((url) => (url.includes('kind=grievance&scope=handling') ? { items: [
      row({ sla_due: addDays(today, -1) }),
      row({ id: 'c3', reference: 'GR-0003', anonymous: true, sla_due: addDays(today, 5), assignee_name: null }),
      row({ id: 'c4', reference: 'GR-0004', status: 'closed', complainant_name: null }),
      row({ id: 'c5', reference: 'GR-0005', sla_due: null }),
    ] } : undefined));
    renderPage(<Cases />, '/cases?tab=grievances');
    const late = (await screen.findByRole('button', { name: 'GR-0001' })).closest('tr')!;
    expect(within(late).getByText(/^Overdue /).className).toContain('danger');
    expect(within(late).getByText('Asha')).toBeTruthy();
    expect(within(late).getByText('Priya')).toBeTruthy();
    const anon = screen.getByRole('button', { name: 'GR-0003' }).closest('tr')!;
    expect(within(anon).getByText('Anonymous')).toBeTruthy();
    expect(within(anon).queryByText(/Overdue/)).toBeNull();
    expect(within(anon).getAllByText('—')).toHaveLength(1);
    const closed = screen.getByRole('button', { name: 'GR-0004' }).closest('tr')!;
    expect(within(closed).queryByText(/Overdue/)).toBeNull();
    expect(within(closed).getAllByText('—')).toHaveLength(2);
    expect(within(screen.getByRole('button', { name: 'GR-0005' }).closest('tr')!).getByText('—')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Response due' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Grievances' })).toBeTruthy();
  });
  it('the committee sees inquiry dates, then report dates once the report is in, and no handler column', async () => {
    api(BOTH, ['cases.self'], (url) => (url.includes('kind=posh&scope=handling') ? { items: [POSH_ROW, row({ ...POSH_ROW, id: 'c6', reference: 'PC-0006', status: 'report_submitted' })] } : undefined));
    renderPage(<Cases />, '/cases?tab=posh');
    const inquiry = (await screen.findByRole('button', { name: 'PC-0001' })).closest('tr')!;
    expect(within(inquiry).getByText('30/01/2027')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: 'PC-0006' }).closest('tr')!).getByText('10/02/2027')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Inquiry or report due' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Handler' })).toBeNull();
  });
  it('filtering by status asks the server, an empty result suggests another, and Clear returns', async () => {
    const f = managed();
    renderPage(<Cases />, '/cases?tab=grievances');
    expect(await screen.findByText('No cases')).toBeTruthy();
    expect(screen.queryByText('Try a different status.')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await waitFor(() => expect(reads(f, 'kind=grievance&scope=handling&status=resolved').length).toBeGreaterThan(0));
    expect(await screen.findByText('Try a different status.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(''));
    expect(await screen.findByText('No cases')).toBeTruthy();
  });
  it('opening a case from the list puts it in the page, and closing takes it away', async () => {
    managed((url) => {
      if (url.includes('kind=grievance&scope=handling')) return { items: [row()] };
      if (url.endsWith('/cases/c1')) return { ...DETAIL, id: 'c1', reference: 'GR-0001' };
      return undefined;
    });
    renderPage(<Cases />, '/cases?tab=grievances');
    await userEvent.click(await screen.findByRole('button', { name: 'GR-0001' }));
    const dlg = await screen.findByRole('dialog', { name: 'GR-0001, grievance' });
    await within(dlg).findByLabelText(/Add a comment/);
    await userEvent.click(within(dlg).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
