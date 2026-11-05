import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Lifecycle } from '../../pages/Lifecycle';
import { addDays, todayLocal } from '../../format';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';

configure({ asyncUtilTimeout: 10000 });

const FLAGS = ['FEATURE_ONBOARDING', 'FEATURE_OFFBOARDING'];
const HR = ['lifecycle.manage', 'lifecycle.read', 'lifecycle.self'];
const TASK = { id: 't1', title: 'Issue laptop', owner: 'it', due_date: '2026-01-05', status: 'pending', note: null, done_by_name: null, done_at: null, canAct: true };
const CHECKLIST = { id: 'c1', kind: 'onboarding', status: 'open', anchor_date: '2026-01-01', separation_id: null, employee: { id: 'e2', name: 'Bo Das', status: 'pre_joining' }, tasks: [TASK] };
const ROW = { id: 'c1', kind: 'onboarding', status: 'open', anchor_date: '2026-01-01', employee_name: 'Bo Das', employee_code: 'E2', done: 1, tasks: 4, overdue: 2 };
const SEP = { id: 's1', kind: 'resignation', status: 'approved', initiated_by: 'u2', initiated_by_name: 'Bo Das', employee: { id: 'e2', name: 'Bo Das', status: 'on_notice' }, employee_name: 'Bo Das', employee_code: 'E2', notice_date: '2026-01-01', requested_lwd: '2026-02-01', approved_lwd: '2026-02-10', shortfall_days: 0, waive_shortfall: false, reason: 'Moving', notice_days_required: 30, fnf_status: 'not_started', fnf_note: null, checklist: null, leaveBalances: [] };
const PROBATION = { id: 'p1', employee_id: 'e9', employee_name: 'Rohan Iyer', employee_code: 'E9', designation: 'Engineer', date_of_joining: '2025-07-01', probation_end: '2026-01-01', recommendation: null, extend_months: null, comments: null, status: 'open' };
const TEMPLATE = { id: 'tp1', kind: 'onboarding', name: 'Standard joiner', is_default: true, status: 'active', tasks: [{ title: 'Laptop', description: null, owner: 'it', offsetDays: -2 }] };

/** Reads answered from these fixtures; writes succeed unless a test says otherwise. */
const api = (over: { sep?: object; checklist?: object; extra?: Handler } = {}): Handler => (url, init) => {
  const x = over.extra?.(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { id: 's1' };
  if (url.includes('/checklists/c1')) return over.checklist ?? CHECKLIST;
  if (url.includes('/lifecycle/checklists')) return { items: [ROW], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/separations/s1')) return over.sep ?? SEP;
  if (url.includes('/separations')) return { items: [over.sep ?? SEP], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/probation')) return { items: [PROBATION] };
  if (url.includes('/templates')) return { items: [TEMPLATE] };
  if (url.includes('/tasks/mine')) return { date: '2026-01-05', items: [] };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
  return { items: [] };
};
const pickEmployee = async (dlg: HTMLElement) => {
  await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
  await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
};
const openSeparation = async (sep: object, permissions: readonly string[] = HR, employeeId: string | null = 'e1', extra?: Handler) => {
  const f = mockPageApi(permissions, FLAGS, api({ sep, extra }), employeeId);
  showPage(<Lifecycle />, '/lifecycle?tab=separations');
  await userEvent.click(await screen.findByRole('button', { name: 'Bo Das' }));
  await screen.findByRole('dialog', { name: /Bo Das/ });
  return f;
};

describe('tabs', () => {
  it('someone with no lifecycle role and no flags sees only their own tasks, without a tab bar', async () => {
    mockPageApi([], [], api(), null);
    showPage(<Lifecycle />, '/lifecycle');
    expect(await screen.findByText('No open tasks for you')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('an employee gets probation and separations but no onboarding or templates', async () => {
    mockPageApi(['lifecycle.self'], FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle');
    const tabs = within(await screen.findByRole('tablist')).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['My tasks', 'Probation', 'Separations']);
  });
});

describe('my tasks', () => {
  it('shows overdue and today, and a person opens the checklist from the row', async () => {
    const f = mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/tasks/mine') ? { date: '2026-01-05', items: [
      { id: 't1', title: 'Issue laptop', description: 'Dell', owner: 'it', due_date: '2026-01-01', checklist_id: 'c1', kind: 'offboarding', employee_name: 'Bo Das' },
      { id: 't2', title: 'Badge', description: null, owner: 'other', due_date: '2026-01-05', checklist_id: 'c1', kind: 'onboarding', employee_name: 'Kim' },
    ] } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=tasks');
    expect(await screen.findByText(/Overdue /)).toBeTruthy();
    expect(screen.getByText('Exit clearance · IT')).toBeTruthy();
    expect(screen.getByText('Onboarding · other')).toBeTruthy();
    expect(screen.getByText('Dell')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Bo Das' }));
    await screen.findByRole('dialog', { name: /Onboarding — Bo Das/ });
    expect(reads(f, '/checklists/c1').length).toBeGreaterThan(0);
  });
});

describe('onboarding', () => {
  it('lists progress and overdue, and the status filter goes to the server', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    expect(await screen.findByText('1/4')).toBeTruthy();
    expect(screen.getByText('2 overdue')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'completed');
    await waitFor(() => expect(reads(f, 'status=completed')).toHaveLength(1));
    expect(String(reads(f, 'status=completed')[0]![0])).toContain('kind=onboarding');
  });
  it('an empty list says where checklists come from', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/lifecycle/checklists') ? { items: [], page: 1, pageSize: 25, total: 0 } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    expect(await screen.findByText('No onboarding checklists')).toBeTruthy();
  });
  it('a reader cannot start onboarding', async () => {
    mockPageApi(['lifecycle.read'], FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await screen.findByText('1/4');
    expect(screen.queryByRole('button', { name: 'Start onboarding' })).toBeNull();
  });
  it('Start asks for a person, posts them and opens the new checklist', async () => {
    const f = mockPageApi(HR, FLAGS, api({ extra: (url, init) => (url.endsWith('/lifecycle/checklists') && init.method === 'POST' ? { id: 'c1' } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Start onboarding' }));
    const dlg = await screen.findByRole('dialog', { name: 'Start onboarding' });
    await pickEmployee(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(writes(f, '/lifecycle/checklists')).toHaveLength(1));
    expect(bodyOf(writes(f, '/lifecycle/checklists')[0]!)).toEqual({ employeeId: 'e9' });
    expect(await screen.findByText('Onboarding started; owners notified')).toBeTruthy();
    await screen.findByRole('dialog', { name: /Onboarding — Bo Das/ });
    expect(screen.queryByRole('dialog', { name: 'Start onboarding' })).toBeNull();
  });
  it('a failed start stays open with the reason', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url, init) => (url.endsWith('/lifecycle/checklists') && init.method === 'POST' ? problem(409, 'No default template') : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Start onboarding' }));
    const dlg = await screen.findByRole('dialog', { name: 'Start onboarding' });
    await pickEmployee(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Start' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('No default template');
  });
});

describe('checklist', () => {
  const open = async (checklist: object, permissions = HR) => {
    const f = mockPageApi(permissions, FLAGS, api({ checklist }));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo Das' }));
    return { f, dlg: await screen.findByRole('dialog', { name: /Bo Das/ }) };
  };
  it('Done posts the task, and its Undo reopens it', async () => {
    const { f, dlg } = await open(CHECKLIST);
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Done: Issue laptop' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/done')).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/reopen')).toHaveLength(1));
  });
  it('Skip needs a comment, sends it and offers an Undo', async () => {
    const { f, dlg } = await open(CHECKLIST);
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Skip' }));
    const skip = await screen.findByRole('dialog', { name: 'Skip task' });
    expect(within(skip).getByText('Why is "Issue laptop" not needed?')).toBeTruthy();
    expect((within(skip).getByRole('button', { name: 'Skip' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(skip).getByLabelText(/Comment/), 'Own device');
    await userEvent.click(within(skip).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/skip')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tasks/t1/skip')[0]!)).toEqual({ note: 'Own device' });
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/reopen')).toHaveLength(1));
  });
  it('Skip can be cancelled without a request', async () => {
    const { f, dlg } = await open(CHECKLIST);
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Skip' }));
    const skip = await screen.findByRole('dialog', { name: 'Skip task' });
    await userEvent.click(within(skip).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Skip task' })).toBeNull());
    expect(writes(f, '/skip')).toHaveLength(0);
  });
  it('a finished task shows who did it and can be reopened by a manager', async () => {
    const done = { ...TASK, status: 'done', note: 'Dell issued', done_by_name: 'Kim', done_at: '2026-01-02T05:00:00Z' };
    const { f, dlg } = await open({ ...CHECKLIST, tasks: [done] });
    expect(await within(dlg).findByText('Dell issued')).toBeTruthy();
    expect(within(dlg).getByText(/^Kim · /)).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: /Done:/ })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/reopen')).toHaveLength(1));
    expect(await screen.findByText('Reopened')).toBeTruthy();
  });
  it('Confirm joining makes a pre-joining employee active after asking', async () => {
    const { f, dlg } = await open(CHECKLIST);
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Confirm joining' }));
    const ask = await screen.findByRole('dialog', { name: 'Confirm joining' });
    expect(within(ask).getByText('Bo Das becomes an active employee.')).toBeTruthy();
    expect(writes(f, '/joined')).toHaveLength(0);
    await userEvent.click(within(ask).getByRole('button', { name: 'Confirm joining' }));
    await waitFor(() => expect(writes(f, '/lifecycle/employees/e2/joined')).toHaveLength(1));
    expect(await screen.findByText('Joining confirmed; employee is active')).toBeTruthy();
  });
  it('a reader sees the tasks but no action', async () => {
    const { dlg } = await open(CHECKLIST, ['lifecycle.read']);
    expect(await within(dlg).findByText('Issue laptop')).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Confirm joining' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Cancel checklist' })).toBeNull();
  });
});

describe('probation', () => {
  it('lists the designation and a decided recommendation with its months and comment', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/probation') ? { items: [PROBATION, { ...PROBATION, id: 'p2', designation: null, status: 'pending', recommendation: 'extend', extend_months: 2, comments: 'Needs more time' }] } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    expect(await screen.findByText(/Engineer/)).toBeTruthy();
    expect(screen.getByText(/Extend \(2 months\)/)).toBeTruthy();
    expect(screen.getByText('Needs more time')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Recommend' })).toHaveLength(1);
  });
  it('nobody is offered a recommendation on their own probation', async () => {
    mockPageApi(HR, FLAGS, api(), 'e9');
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    await screen.findByText(/Engineer/);
    expect(screen.queryByRole('button', { name: 'Recommend' })).toBeNull();
  });
  it('the status filter goes to the server, and clearing returns to open', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    await screen.findByText(/Engineer/);
    expect(reads(f, '/probation?status=open').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await waitFor(() => expect(reads(f, '/probation?status=approved')).toHaveLength(1));
  });
  it('an empty list says so', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/probation') ? { items: [] } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    expect(await screen.findByText('No probation reviews')).toBeTruthy();
  });
  it('holds a short comment, then sends an extension with its months', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    await userEvent.click(await screen.findByRole('button', { name: 'Recommend' }));
    const dlg = await screen.findByRole('dialog', { name: /Probation — Rohan Iyer/ });
    expect(within(dlg).queryByLabelText(/Extend by/)).toBeNull();
    await userEvent.selectOptions(within(dlg).getByLabelText('Recommendation'), 'extend');
    const months = within(dlg).getByLabelText(/Extend by/);
    await userEvent.clear(months);
    await userEvent.type(months, '4');
    await userEvent.type(within(dlg).getByLabelText(/Comments/), 'Too short');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect(await within(dlg).findByText('Write at least 10 characters.')).toBeTruthy();
    expect(writes(f, '/submit')).toHaveLength(0);
    await userEvent.type(within(dlg).getByLabelText(/Comments/), ' to judge fairly');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/probation/p1/submit')).toHaveLength(1));
    expect(bodyOf(writes(f, '/probation/p1/submit')[0]!)).toEqual({ recommendation: 'extend', comments: 'Too short to judge fairly', extendMonths: 4 });
    expect(await screen.findByText('Sent to HR for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Probation/ })).toBeNull());
  });
  it('a confirmation sends no months, and a refusal stays open with the reason', async () => {
    const f = mockPageApi(HR, FLAGS, api({ extra: (url, init) => (url.endsWith('/submit') && init.method === 'POST' ? problem(409, 'Already submitted') : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=probation');
    await userEvent.click(await screen.findByRole('button', { name: 'Recommend' }));
    const dlg = await screen.findByRole('dialog', { name: /Probation — Rohan Iyer/ });
    await userEvent.type(within(dlg).getByLabelText(/Comments/), 'Met every goal this term');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already submitted');
    expect(bodyOf(writes(f, '/submit')[0]!)).toEqual({ recommendation: 'confirm', comments: 'Met every goal this term', extendMonths: null });
    expect((within(dlg).getByLabelText(/Comments/) as HTMLTextAreaElement).value).toBe('Met every goal this term');
  });
});

describe('separations', () => {
  it('lists the shortfall, waived or not, and the last working day approved over requested', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.endsWith('pageSize=25') && url.includes('/separations') ? { items: [{ ...SEP, shortfall_days: 5 }, { ...SEP, id: 's2', employee_name: 'Kim', shortfall_days: 3, waive_shortfall: true, kind: 'other_kind', approved_lwd: null }], page: 1, pageSize: 25, total: 2 } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    expect(await screen.findByText('5 days')).toBeTruthy();
    expect(screen.getByText('3 days (waived)')).toBeTruthy();
    expect(screen.getByText('other_kind')).toBeTruthy();
    expect(screen.getByText('Resignation')).toBeTruthy();
  });
  it('HR starts on all; the scope filter goes to the server', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await screen.findByRole('button', { name: 'Bo Das' });
    expect(reads(f, 'scope=all').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'team');
    await waitFor(() => expect(reads(f, 'scope=team')).toHaveLength(1));
  });
  it('an employee starts on their own, cannot see all, and can only resign', async () => {
    const f = mockPageApi(['lifecycle.self'], FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    expect(await screen.findByRole('button', { name: 'Resign' })).toBeTruthy();
    expect(reads(f, 'scope=mine').length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: 'All separations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start separation' })).toBeNull();
  });
  it('an empty list says so', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/separations') ? { items: [], page: 1, pageSize: 25, total: 0 } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    expect(await screen.findByText('No separations')).toBeTruthy();
  });
  it('resigning posts the reason and date, reports the shortfall and opens the request', async () => {
    const f = mockPageApi(HR, FLAGS, api({ extra: (url, init) => (url.endsWith('/resign') && init.method === 'POST' ? { id: 's1', shortfallDays: 12, noticeDaysRequired: 30 } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Resign' }));
    const dlg = await screen.findByRole('dialog', { name: 'Resign' });
    expect((within(dlg).getByLabelText(/Proposed last working day/) as HTMLInputElement).value).toBe(addDays(todayLocal(), 30));
    fireEvent.change(within(dlg).getByLabelText(/Proposed last working day/), { target: { value: '2030-03-15' } });
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Moving city');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/separations/resign')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/resign')[0]!)).toEqual({ reason: 'Moving city', requestedLwd: '2030-03-15' });
    expect(await screen.findByText('Submitted. Notice short by 12 day(s) of the 30 required.')).toBeTruthy();
    await screen.findByRole('dialog', { name: /Resignation — Bo Das/ });
  });
  it('HR starts a separation for a chosen person, kind and dates, with no resignation among the kinds', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Start separation' }));
    const dlg = await screen.findByRole('dialog', { name: 'Start separation' });
    expect(within(within(dlg).getByLabelText('Kind')).queryByRole('option', { name: 'Resignation' })).toBeNull();
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'End of contract');
    await pickEmployee(dlg);
    await userEvent.selectOptions(within(dlg).getByLabelText('Kind'), 'contract_end');
    fireEvent.change(within(dlg).getByLabelText(/Notice date/), { target: { value: '2030-01-01' } });
    fireEvent.change(within(dlg).getByLabelText(/Proposed last working day/), { target: { value: '2030-02-01' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/lifecycle/separations')).toHaveLength(1));
    expect(bodyOf(writes(f, '/lifecycle/separations')[0]!)).toEqual({ kind: 'contract_end', reason: 'End of contract', noticeDate: '2030-01-01', requestedLwd: '2030-02-01', employeeId: 'e9' });
    expect(await screen.findByText('Submitted for approval')).toBeTruthy();
  });
  it('the pending request lets HR set the last working day and waive the shortfall', async () => {
    const f = await openSeparation({ ...SEP, status: 'pending', shortfall_days: 5 });
    expect(await screen.findByText(/Notice short by 5 days/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exit interview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set last working day' }));
    const dlg = await screen.findByRole('dialog', { name: 'Last working day' });
    expect((within(dlg).getByLabelText(/Approved last working day/) as HTMLInputElement).value).toBe('2026-02-10');
    fireEvent.change(within(dlg).getByLabelText(/Approved last working day/), { target: { value: '2026-02-20' } });
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Waive any notice shortfall' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/separations/s1/lwd')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/s1/lwd')[0]!)).toEqual({ approvedLwd: '2026-02-20', waiveShortfall: true });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Last working day' })).toBeNull());
  });
  it('withdrawing a separation that is not a resignation says separation', async () => {
    const f = await openSeparation({ ...SEP, status: 'pending', kind: 'termination', initiated_by: 'u1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw separation' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/separations/s1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Withdrawn')).toBeTruthy();
  });
  it('shows F&F note, exit clearance progress, leave balances and recorded answers without bookkeeping fields', async () => {
    await openSeparation({
      ...SEP, fnf_status: 'in_progress', fnf_note: 'Awaiting bank',
      checklist: { id: 'c1', status: 'open', tasks: [{ status: 'done' }, { status: 'pending' }, { status: 'skipped' }] },
      leaveBalances: [{ code: 'EL', balance: 3 }, { code: 'SL', balance: '1.5' }],
      exit_interview: { _recordedBy: 'u9', reasonForLeaving: 'Family', customQuestion: 'Yes' },
    });
    expect(await screen.findByText(/Awaiting bank/)).toBeTruthy();
    expect(screen.getByText('2/3 cleared')).toBeTruthy();
    expect(screen.getByText('EL 3 · SL 1.5')).toBeTruthy();
    expect(screen.getByText('Main reason for leaving')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('customQuestion')).toBeTruthy();
    expect(screen.queryByText('u9')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open checklist' }));
    await screen.findByRole('dialog', { name: /Onboarding — Bo Das/ });
  });
  it('the exit interview starts from recorded answers and drops bookkeeping and blanks', async () => {
    const f = await openSeparation({ ...SEP, exit_interview: { _at: 'x', reasonForLeaving: 'Family', whatWentWell: null } });
    await userEvent.click(await screen.findByRole('button', { name: 'Exit interview' }));
    const dlg = await screen.findByRole('dialog', { name: 'Exit interview' });
    expect((within(dlg).getByLabelText('Main reason for leaving') as HTMLTextAreaElement).value).toBe('Family');
    await userEvent.type(within(dlg).getByLabelText('What should we improve'), 'Tools');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/separations/s1/exit-interview')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/s1/exit-interview')[0]!)).toEqual({ answers: { reasonForLeaving: 'Family', whatToImprove: 'Tools' } });
    expect(await screen.findByText('Exit interview recorded')).toBeTruthy();
  });
  it('the leaver gets the exit interview, but none of the HR actions', async () => {
    await openSeparation(SEP, ['lifecycle.self'], 'e2');
    expect(await screen.findByRole('button', { name: 'Exit interview' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update F&F' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Complete exit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel separation' })).toBeNull();
  });
  it('F&F saves status and note, and an empty note is sent as null', async () => {
    const f = await openSeparation({ ...SEP, fnf_status: 'in_progress', fnf_note: 'Old' });
    await userEvent.click(await screen.findByRole('button', { name: 'Update F&F' }));
    const dlg = await screen.findByRole('dialog', { name: 'Full and final settlement' });
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'settled');
    await userEvent.clear(within(dlg).getByLabelText('Note'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/separations/s1/fnf')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/s1/fnf')[0]!)).toEqual({ status: 'settled', note: null });
    expect(await screen.findByText('F&F status saved')).toBeTruthy();
  });
  it('a refused F&F stays open with the note and the reason', async () => {
    await openSeparation(SEP, HR, 'e1', (url, init) => (url.endsWith('/fnf') && init.method === 'POST' ? problem(409, 'Payroll run is open') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Update F&F' }));
    const dlg = await screen.findByRole('dialog', { name: 'Full and final settlement' });
    await userEvent.type(within(dlg).getByLabelText('Note'), 'Paid');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Payroll run is open');
    expect((within(dlg).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Paid');
  });
  it('cancelling asks for a reason and sends it', async () => {
    const f = await openSeparation(SEP);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel separation' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel separation' });
    expect(within(dlg).getByText(/returns to active/)).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Stayed on');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel separation' }));
    await waitFor(() => expect(writes(f, '/separations/s1/cancel')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/s1/cancel')[0]!)).toEqual({ reason: 'Stayed on' });
    expect(await screen.findByText('Separation cancelled')).toBeTruthy();
  });
  it('completing sends the rehire choice as ticked by default', async () => {
    const f = await openSeparation(SEP);
    await userEvent.click(await screen.findByRole('button', { name: 'Complete exit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Complete exit' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(writes(f, '/separations/s1/complete')).toHaveLength(1));
    expect(bodyOf(writes(f, '/separations/s1/complete')[0]!)).toEqual({ rehireEligible: true });
    expect(await screen.findByText('Exit completed')).toBeTruthy();
  });
});

describe('templates', () => {
  it('lists name, default badge, kind and task count', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/templates') ? { items: [TEMPLATE, { ...TEMPLATE, id: 'tp2', kind: 'offboarding', name: 'Leavers', is_default: false, tasks: [] }] } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=templates');
    expect(await screen.findByText('Standard joiner')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByText('Exit')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Checklist templates' })).getByText('Onboarding')).toBeTruthy();
  });
  it('an empty list says what to create', async () => {
    mockPageApi(HR, FLAGS, api({ extra: (url) => (url.includes('/templates') ? { items: [] } : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=templates');
    expect(await screen.findByText('No templates yet')).toBeTruthy();
  });
  it('a new exit template sends its tasks, with numbers as numbers and an empty description as null', async () => {
    const f = mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=templates');
    await userEvent.click(await screen.findByRole('button', { name: 'New exit template' }));
    const dlg = await screen.findByRole('dialog', { name: 'New exit template' });
    expect(within(dlg).getByText(/counted from the last working day/)).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Leavers');
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'inactive');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Default template/ }));
    await userEvent.type(within(dlg).getByLabelText(/^Task 1/), 'Collect badge');
    await userEvent.selectOptions(within(dlg).getByLabelText('Owner of task 1'), 'admin');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add task' }));
    await userEvent.type(within(dlg).getByLabelText(/^Task 2/), 'Temporary');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove task 2' }));
    expect(within(dlg).queryByLabelText(/^Task 2/)).toBeNull();
    expect((within(dlg).getByRole('button', { name: 'Remove task 1' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText(/Days, task 1/), { target: { value: '-5' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/lifecycle/templates')).toHaveLength(1));
    const [call] = writes(f, '/lifecycle/templates');
    expect((call![1] as RequestInit).method).toBe('POST');
    expect(bodyOf(call!)).toEqual({ kind: 'offboarding', name: 'Leavers', isDefault: false, status: 'inactive', tasks: [{ title: 'Collect badge', description: null, owner: 'admin', offsetDays: -5 }] });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('editing starts from the template and PUTs to it; a refusal stays open', async () => {
    const f = mockPageApi(HR, FLAGS, api({ extra: (url, init) => (url.endsWith('/templates/tp1') && init.method === 'PUT' ? problem(422, 'A task needs an owner') : undefined) }));
    showPage(<Lifecycle />, '/lifecycle?tab=templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Standard joiner' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit Standard joiner' });
    expect(within(dlg).getByText(/counted from the joining date/)).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Task 1/) as HTMLInputElement).value).toBe('Laptop');
    expect((within(dlg).getByLabelText(/Days, task 1/) as HTMLInputElement).value).toBe('-2');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('A task needs an owner');
    expect(writes(f, '/templates/tp1')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a new onboarding template is titled as such', async () => {
    mockPageApi(HR, FLAGS, api());
    showPage(<Lifecycle />, '/lifecycle?tab=templates');
    await userEvent.click(await screen.findByRole('button', { name: 'New onboarding template' }));
    expect(await screen.findByRole('dialog', { name: 'New onboarding template' })).toBeTruthy();
  });
});
