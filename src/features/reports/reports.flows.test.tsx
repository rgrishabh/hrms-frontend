import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Reports } from '../../pages/Reports';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../../test/page';

configure({ asyncUtilTimeout: 10000 });

const PAY = { key: 'pay', name: 'Payroll cost', description: 'Cost by department', category: 'Pay', scope: 'all', params: [{ key: 'month', label: 'Month', type: 'month', default: '2026-10' }, { key: 'dept', label: 'Department', type: 'select', default: 'all', options: [{ value: 'all', label: 'All' }, { value: 'ops', label: 'Ops' }] }, { key: 'days', label: 'Days', type: 'int', default: 30, min: 1, max: 90 }, { key: 'from', label: 'From', type: 'date', default: '2026-10-01' }] };
const LEAVE = { key: 'leave', name: 'Leave used', description: 'By person', category: 'Leave', scope: 'team', params: [] };
const COLUMNS = [{ key: 'employee_code', label: 'Code', type: 'text' }, { key: 'dept', label: 'Dept', type: 'text' }, { key: 'cost', label: 'Cost', type: 'money' }, { key: 'share', label: 'Share', type: 'percent' }, { key: 'joined', label: 'Joined', type: 'date' }, { key: 'days_left', label: 'Days left', type: 'int' }, { key: 'score', label: 'Score', type: 'number' }];
const ROWS = [
  { employee_code: 'E2', dept: 'Ops', cost: 2000, share: 66.5, joined: '2025-01-15', days_left: -3, score: 1.5 },
  { employee_code: 'E10', dept: 'Tech', cost: 1000, share: 33.5, joined: null, days_left: 4, score: null },
];
const REPORT = { key: 'pay', name: 'Payroll cost', generatedAt: '2026-11-01T10:00:00Z', scope: 'all', params: {}, columns: COLUMNS, rows: ROWS, totals: { cost: 3000, dept: 'x', share: 100 }, notes: [], truncated: false };
const SCHEDULE = { frequency: 'weekly', dayOfMonth: null, weekday: 3, period: 'last_7_days', enabled: false, nextRunOn: '2026-12-01', recipientIds: ['u7'], lastResult: 'Sent to 2' };
const SAVED = { id: 's1', name: 'Weekly cost', report_key: 'pay', reportName: 'Payroll cost', params: { month: '2026-09' }, schedule: SCHEDULE };
const PLAIN = { ...SAVED, id: 's2', name: 'Plain one', schedule: null };
const api = (over: { advanced?: boolean; items?: object[]; report?: object; saved?: object[]; people?: object[]; snapshots?: object[]; extra?: Handler } = {}): Handler => (url, init) => {
  const x = over.extra?.(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { nextRunOn: '2026-12-08' };
  if (url.endsWith('/api/v1/reports')) return { items: over.items ?? [PAY, LEAVE], today: '2026-11-01', advanced: over.advanced ?? false };
  if (url.includes('/recipients')) return { items: over.people ?? [{ id: 'u7', name: 'Kim', email: 'kim@x.test' }, { id: 'u8', name: 'Lee', email: 'lee@x.test' }] };
  if (url.endsWith('/reports/saved')) return { items: over.saved ?? [SAVED, PLAIN] };
  if (url.includes('/reports/snapshots/')) return { ...REPORT, name: 'Copy of cost', truncated: true };
  if (url.includes('/reports/snapshots')) return { items: over.snapshots ?? [] };
  if (url.includes('/reports/pay')) return over.report ?? REPORT;
  return { items: [] };
};

describe('catalogue', () => {
  it('groups reports by category, links to each, and marks team scope', async () => {
    mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports');
    const pay = await screen.findByRole('region', { name: 'Pay' });
    expect(within(pay).getByRole('link', { name: 'Payroll cost' }).getAttribute('href')).toBe('/reports?r=pay');
    expect(within(screen.getByRole('region', { name: 'Leave' })).getByText('Your team')).toBeTruthy();
    expect(screen.queryByText('My saved reports')).toBeNull();
  });
  it('a role with no reports says so', async () => {
    mockPageApi(['x'], api({ items: [] }));
    renderPage(<Reports />, '/reports');
    expect(await screen.findByText('No reports are available for your role.')).toBeTruthy();
  });
  it('a report someone may not see says so, with a way back', async () => {
    mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports?r=secret');
    expect(await screen.findByText('This report is not available to you.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All reports' })).toBeTruthy();
  });
  it('lists scheduled copies other people sent, linking to each', async () => {
    mockPageApi(['x'], api({ advanced: true, snapshots: [{ id: 'sn1', name: 'October cost', owner: 'Kim', generated_at: '2026-11-01T05:00:00Z', row_count: 1200 }] }));
    renderPage(<Reports />, '/reports');
    const table = await screen.findByRole('table', { name: 'Reports sent to me' });
    expect(within(table).getByRole('link', { name: 'October cost' }).getAttribute('href')).toBe('/reports?snapshot=sn1');
    expect(within(table).getByText('Kim')).toBeTruthy();
    expect(within(table).getByText(/1,200/)).toBeTruthy();
  });
});

describe('snapshot', () => {
  it('shows the copy and its downloads, marked as scheduled', async () => {
    mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports?snapshot=sn1');
    expect(await screen.findByText('Scheduled copy')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Copy of cost' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Copy of cost' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run report' })).toBeNull();
  });
});

describe('report view', () => {
  it('formats each column type, with dashes for blanks and a total row for numbers', async () => {
    mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports?r=pay');
    const table = await screen.findByRole('table', { name: 'Payroll cost' });
    expect(within(table).getByText(/2,000/)).toBeTruthy();
    expect(within(table).getByText('66.5%')).toBeTruthy();
    expect(within(table).getByText(/15\/01\/2025/)).toBeTruthy();
    expect(within(table).getByText('-3').className).toBe('report-negative');
    expect(within(table).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(table).getByText('Total')).toBeTruthy();
    expect(within(table).getByText(/3,000/)).toBeTruthy();
    expect(within(table).queryByText('x')).toBeNull();
    expect(screen.getByText(/2 rows · generated/)).toBeTruthy();
  });
  it('says one row, shows notes, and tells nothing about exclusions when notes already do', async () => {
    mockPageApi(['x'], api({ report: { ...REPORT, rows: [ROWS[0]], notes: ['Contractors are left out'], excluded: 2 } }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText(/^1 row · generated/)).toBeTruthy();
    expect(screen.getByText('Contractors are left out')).toBeTruthy();
    expect(screen.queryByText(/above your salary level/)).toBeNull();
  });
  it('tells about people left out, in the singular and plural', async () => {
    mockPageApi(['x'], api({ report: { ...REPORT, excluded: 1 } }));
    const one = renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('1 person is above your salary level and left out.')).toBeTruthy();
    one.unmount();
    mockPageApi(['x'], api({ report: { ...REPORT, excluded: 4 } }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('4 people are above your salary level and left out.')).toBeTruthy();
  });
  it('no rows says so', async () => {
    mockPageApi(['x'], api({ report: { ...REPORT, rows: [], totals: null } }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('No data for these options.')).toBeTruthy();
  });
  it('masked pay stays hidden until reveal, which asks with reveal=1, and a blank elsewhere stays a dash', async () => {
    const masked = { ...REPORT, masked: true, maskedFields: ['cost'], rows: [{ ...ROWS[0], cost: null, score: null }], totals: { cost: null } };
    const f = mockPageApi(['x'], api({ extra: (url) => (url.includes('/reports/pay') ? (url.includes('reveal=1') ? REPORT : masked) : undefined) }));
    renderPage(<Reports />, '/reports?r=pay');
    const table = await screen.findByRole('table', { name: 'Payroll cost' });
    expect(within(table).getAllByText('Hidden')).toHaveLength(2);
    expect(within(table).queryByText(/2,000/)).toBeNull();
    expect(within(table).getByText('—')).toBeTruthy();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(await screen.findByText(/2,000/)).toBeTruthy();
    expect(reads(f, 'reveal=1').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    await waitFor(() => expect(screen.queryByText(/2,000/)).toBeNull());
  });
  it('options start from the URL and defaults, and running with new ones asks the server', async () => {
    const f = mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports?r=pay&month=2026-08');
    await screen.findByRole('table', { name: 'Payroll cost' });
    expect(reads(f, '/reports/pay?month=2026-08&dept=all&days=30&from=2026-10-01')).toHaveLength(1);
    const form = screen.getByRole('form', { name: 'Report options' });
    expect((within(form).getByLabelText(/^Month/) as HTMLInputElement).value).toBe('2026-08');
    await userEvent.selectOptions(within(form).getByLabelText(/^Department/), 'ops');
    const days = within(form).getByLabelText(/^Days/);
    await userEvent.clear(days);
    await userEvent.type(days, '7');
    fireEvent.change(within(form).getByLabelText(/^From/), { target: { value: '2026-09-01' } });
    fireEvent.change(within(form).getByLabelText(/^Month/), { target: { value: '2026-09' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Run report' }));
    await waitFor(() => expect(reads(f, '/reports/pay?month=2026-09&dept=ops&days=7&from=2026-09-01')).toHaveLength(1));
  });
  it('a failed report shows the reason, and Try again asks the server again', async () => {
    const f = mockPageApi(['x'], api({ extra: (url) => (url.includes('/reports/pay') ? problem(500, 'Report engine is down') : undefined) }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('Report engine is down')).toBeTruthy();
    expect(reads(f, '/reports/pay')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(reads(f, '/reports/pay')).toHaveLength(2));
  });
  it('a report someone may not run says they have no access, without the server wording', async () => {
    mockPageApi(['x'], api({ extra: (url) => (url.includes('/reports/pay') ? problem(403, 'scope') : undefined) }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('You do not have access to this')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
  it('the filter looks at text columns, hides the total while filtering, and sorts blanks last', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ ...ROWS[0], employee_code: `E${i}`, dept: i === 0 ? 'Finance' : 'Ops', score: i === 1 ? null : i }));
    mockPageApi(['x'], api({ report: { ...REPORT, rows } }));
    renderPage(<Reports />, '/reports?r=pay');
    const table = await screen.findByRole('table', { name: 'Payroll cost' });
    const firstCode = () => within(within(table).getAllByRole('row')[1]!).getAllByRole('cell')[0]!.textContent;
    await userEvent.click(within(table).getByRole('button', { name: 'Code' }));
    expect(firstCode()).toBe('E0');
    await userEvent.click(within(table).getByRole('button', { name: 'Code' }));
    expect(firstCode()).toBe('E11');
    await userEvent.click(within(table).getByRole('button', { name: 'Score' }));
    const last = within(table).getAllByRole('row').slice(1, 13).at(-1)!;
    expect(within(last).getAllByRole('cell')[0]!.textContent).toBe('E1');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter rows' }), 'finance');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).queryByText('Total')).toBeNull();
    expect(firstCode()).toBe('E0');
  });
  it('pages long results on the screen', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ ...ROWS[0], employee_code: `E${i}` }));
    mockPageApi(['x'], api({ report: { ...REPORT, rows } }));
    renderPage(<Reports />, '/reports?r=pay');
    expect(await screen.findByText('E99')).toBeTruthy();
    expect(screen.queryByText('E100')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('E100')).toBeTruthy();
  });
});

describe('saving', () => {
  it('saves the options it ran with, under a chosen name', async () => {
    const f = mockPageApi(['x'], api({ advanced: true }));
    renderPage(<Reports />, '/reports?r=pay&month=2026-08');
    await userEvent.click(await screen.findByRole('button', { name: 'Save report' }));
    const dlg = await screen.findByRole('dialog', { name: 'Save report' });
    const name = within(dlg).getByLabelText(/^Name/) as HTMLInputElement;
    expect(name.value).toBe('Payroll cost');
    await userEvent.clear(name);
    await userEvent.type(name, 'August cost');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/reports/saved')).toHaveLength(1));
    expect(bodyOf(writes(f, '/reports/saved')[0]!)).toEqual({ reportKey: 'pay', name: 'August cost', params: { month: '2026-08', dept: 'all', days: '30', from: '2026-10-01' } });
    expect(await screen.findByText('Saved. Find it, and schedule it, under All reports.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a refused save stays open with the reason; Cancel closes it', async () => {
    mockPageApi(['x'], api({ advanced: true, extra: (url, init) => (url.endsWith('/reports/saved') && init.method === 'POST' ? problem(409, 'That name is taken') : undefined) }));
    renderPage(<Reports />, '/reports?r=pay');
    await userEvent.click(await screen.findByRole('button', { name: 'Save report' }));
    const dlg = await screen.findByRole('dialog', { name: 'Save report' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('That name is taken');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('without advanced reports there is no save', async () => {
    mockPageApi(['x'], api());
    renderPage(<Reports />, '/reports?r=pay');
    await screen.findByRole('table', { name: 'Payroll cost' });
    expect(screen.queryByRole('button', { name: 'Save report' })).toBeNull();
  });
});

describe('saved reports', () => {
  const open = async (over: Parameters<typeof api>[0] = {}) => {
    const f = mockPageApi(['x'], api({ advanced: true, ...over }));
    renderPage(<Reports />, '/reports');
    return { f, table: await screen.findByRole('table', { name: 'My saved reports' }) };
  };
  it('describes each schedule: weekday, period, pause, recipients and last result; links carry saved options', async () => {
    const { table } = await open();
    expect(within(table).getByText(/Every week on Wednesday · The last 7 days/)).toBeTruthy();
    expect(within(table).getByText('Paused')).toBeTruthy();
    expect(within(table).getByText(/\+1 recipient\(s\) · Sent to 2/)).toBeTruthy();
    expect(within(table).getByRole('link', { name: 'Weekly cost' }).getAttribute('href')).toBe('/reports?r=pay&month=2026-09');
    expect(within(table).getByRole('button', { name: 'Schedule' })).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Edit schedule' })).toBeTruthy();
  });
  it('monthly and daily read plainly, an unknown period as it is, and a report no longer available has no link', async () => {
    const { table } = await open({ saved: [
      { ...SAVED, id: 'a', name: 'M', schedule: { ...SCHEDULE, frequency: 'monthly', dayOfMonth: 5, weekday: null, enabled: true, recipientIds: [], lastResult: null } },
      { ...SAVED, id: 'b', name: 'Gone', report_key: 'old', schedule: { ...SCHEDULE, frequency: 'daily', period: 'custom', enabled: true } },
    ] });
    expect(within(table).getByText(/Every month on day 5 · The last 7 days/)).toBeTruthy();
    expect(within(table).getByText(/Every day · custom/)).toBeTruthy();
    expect(within(table).queryByRole('link', { name: 'Gone' })).toBeNull();
    expect(within(table).getByText('Gone')).toBeTruthy();
  });
  it('deleting asks first, naming the schedule, then sends DELETE', async () => {
    const { f, table } = await open();
    await userEvent.click(within(table).getAllByRole('button', { name: 'Delete' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Delete saved report' });
    expect(within(dlg).getByText('Delete “Weekly cost” and its schedule?')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(writes(f, '/reports/saved/s1')).toHaveLength(1));
    expect((writes(f, '/reports/saved/s1')[0]![1] as RequestInit).method).toBe('DELETE');
    expect(await screen.findByText('Deleted')).toBeTruthy();
  });
  it('a new schedule defaults to monthly and sends the day, chosen people and period', async () => {
    const { f, table } = await open();
    await userEvent.click(within(table).getByRole('button', { name: 'Schedule' }));
    const dlg = await screen.findByRole('dialog', { name: 'Schedule — Plain one' });
    expect(within(dlg).queryByRole('button', { name: 'Remove schedule' })).toBeNull();
    const day = within(dlg).getByLabelText(/^On day/);
    await userEvent.clear(day);
    await userEvent.type(day, '15');
    await userEvent.selectOptions(within(dlg).getByLabelText('Covering'), 'month_to_date');
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Kim/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Lee/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Kim/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(writes(f, '/saved/s2/schedule')).toHaveLength(1));
    expect(bodyOf(writes(f, '/saved/s2/schedule')[0]!)).toEqual({ frequency: 'monthly', dayOfMonth: 15, period: 'month_to_date', recipientIds: ['u8'], enabled: true });
    expect(await screen.findByText(/Scheduled; next run/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('an existing schedule starts from what is saved; weekly sends a weekday, daily sends neither', async () => {
    const { f, table } = await open();
    await userEvent.click(within(table).getByRole('button', { name: 'Edit schedule' }));
    const dlg = await screen.findByRole('dialog', { name: 'Schedule — Weekly cost' });
    expect((within(dlg).getByLabelText('On') as HTMLSelectElement).value).toBe('3');
    expect((await within(dlg).findByRole('checkbox', { name: /Kim/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.selectOptions(within(dlg).getByLabelText('On'), '5');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Active' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(writes(f, '/saved/s1/schedule')).toHaveLength(1));
    expect(bodyOf(writes(f, '/saved/s1/schedule')[0]!)).toEqual({ frequency: 'weekly', weekday: 5, period: 'last_7_days', recipientIds: ['u7'], enabled: true });
  });
  it('a daily schedule sends no day, and a refusal stays open', async () => {
    const { f, table } = await open({ extra: (url, init) => (url.endsWith('/schedule') && init.method === 'PUT' ? problem(422, 'Too many schedules') : undefined) });
    await userEvent.click(within(table).getByRole('button', { name: 'Schedule' }));
    const dlg = await screen.findByRole('dialog', { name: 'Schedule — Plain one' });
    await userEvent.selectOptions(within(dlg).getByLabelText('How often'), 'daily');
    expect(within(dlg).queryByLabelText(/^On/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save schedule' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Too many schedules');
    const body = bodyOf(writes(f, '/schedule')[0]!);
    expect(body).not.toHaveProperty('weekday');
    expect(body).not.toHaveProperty('dayOfMonth');
    expect(body).toMatchObject({ frequency: 'daily' });
  });
  it('when nobody else may see it, says only you', async () => {
    const { table } = await open({ people: [] });
    await userEvent.click(within(table).getByRole('button', { name: 'Schedule' }));
    const dlg = await screen.findByRole('dialog', { name: 'Schedule — Plain one' });
    expect(await within(dlg).findByText(/Only you: nobody else can see this report/)).toBeTruthy();
  });
  it('removing a schedule sends DELETE to it', async () => {
    const { f, table } = await open();
    await userEvent.click(within(table).getByRole('button', { name: 'Edit schedule' }));
    const dlg = await screen.findByRole('dialog', { name: 'Schedule — Weekly cost' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove schedule' }));
    const ask = await screen.findByRole('dialog', { name: 'Remove schedule' });
    expect(within(ask).getByText(/stays saved, but stops running/)).toBeTruthy();
    await userEvent.click(within(ask).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(writes(f, '/saved/s1/schedule')).toHaveLength(1));
    expect((writes(f, '/saved/s1/schedule')[0]![1] as RequestInit).method).toBe('DELETE');
  });
});
