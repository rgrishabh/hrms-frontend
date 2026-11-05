import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Lifecycle } from '../../pages/Lifecycle';
import { mockApi, problem, showPage, writes } from '../recruitment/harness.test-util';

const HR = ['lifecycle.manage', 'lifecycle.read', 'lifecycle.self'];
const TASK = { id: 't1', title: 'Issue laptop', owner: 'it', due_date: '2026-01-05', status: 'pending', note: null, done_by_name: null, done_at: null, canAct: true };
const CHECKLIST = { id: 'c1', kind: 'onboarding', status: 'open', anchor_date: '2026-01-01', separation_id: null, employee: { id: 'e2', name: 'Bo', status: 'active' }, tasks: [TASK] };
const SEP = { id: 's1', kind: 'resignation', status: 'approved', initiated_by: 'u2', initiated_by_name: 'Bo', employee: { id: 'e2', name: 'Bo', status: 'on_notice' }, employee_name: 'Bo', employee_code: 'E2', notice_date: '2026-01-01', requested_lwd: '2026-02-01', approved_lwd: '2026-02-01', shortfall_days: 0, waive_shortfall: false, reason: 'Moving', notice_days_required: 30, fnf_status: 'not_started', fnf_note: null, checklist: null, leaveBalances: [] };
const lists = (url: string, sep = SEP) => {
  if (url.includes('/checklists/c1')) return CHECKLIST;
  if (url.includes('/checklists')) return { items: [{ id: 'c1', kind: 'onboarding', status: 'open', anchor_date: '2026-01-01', employee_name: 'Bo', employee_code: 'E2', done: 0, tasks: 1, overdue: 0 }], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/separations/s1')) return sep;
  if (url.includes('/separations')) return { items: [sep], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/tasks/mine')) return { date: '2026-01-01', items: [{ id: 't1', title: 'Issue laptop', description: null, owner: 'it', due_date: '2026-01-05', checklist_id: 'c1', kind: 'onboarding', employee_name: 'Bo' }] };
  return { items: [] };
};

describe('dialogs stay open when the server refuses', () => {
  it('a failed Skip keeps the reason typed and shows why', async () => {
    mockApi(HR, (url, method) => (method === 'POST' && url.endsWith('/skip') ? problem(409, 'Task is already done') : lists(url)));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    const dlg = await screen.findByRole('dialog', { name: 'Skip task' });
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Not needed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Skip' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Task is already done');
    expect(screen.getByRole('dialog', { name: 'Skip task' })).toBeTruthy();
  });
  it('a failed Complete exit stays open with the reason, and the rehire choice is sent', async () => {
    const f = mockApi(HR, (url, method) => (method === 'POST' && url.endsWith('/complete') ? problem(409, 'Clearance is not finished') : lists(url)));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Complete exit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Complete exit' });
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Eligible for rehire' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Complete' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Clearance is not finished');
    expect(JSON.parse(String((writes(f, '/complete')[0]![1] as RequestInit).body))).toEqual({ rehireEligible: false });
  });
  it('a failed last working day stays open with the reason', async () => {
    mockApi(HR, (url, method) => (method === 'PUT' ? problem(400, 'Before the joining date') : lists(url, { ...SEP, status: 'pending' })));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Set last working day' }));
    const dlg = await screen.findByRole('dialog', { name: 'Last working day' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Before the joining date');
  });
  it('a failed separation form keeps what was typed', async () => {
    mockApi(HR, (url, method) => (method === 'POST' && url.endsWith('/resign') ? problem(409, 'Already resigned') : lists(url)));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Resign' }));
    const dlg = await screen.findByRole('dialog', { name: 'Resign' });
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'New job');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already resigned');
    expect(within(dlg).getByLabelText<HTMLTextAreaElement>(/Reason/).value).toBe('New job');
  });
});

describe('actions the server refuses are hidden', () => {
  it('only the person who started a pending separation may withdraw it', async () => {
    mockApi(HR, (url) => lists(url, { ...SEP, status: 'pending', initiated_by: 'u2' }));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await screen.findByRole('button', { name: 'Set last working day' });
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).toBeNull();
  });
  it('the requester can withdraw, after confirming', async () => {
    const f = mockApi(['lifecycle.self'], (url) => lists(url, { ...SEP, status: 'pending', initiated_by: 'u1' }));
    showPage(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw resignation' });
    expect(writes(f, '/withdraw')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/withdraw')).toHaveLength(1));
  });
});

describe('checklist cancel', () => {
  it('asks for a reason and posts it', async () => {
    const f = mockApi(HR, (url) => lists(url));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel checklist' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel onboarding' });
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Candidate did not join');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel onboarding' }));
    await waitFor(() => expect(writes(f, '/checklists/c1/cancel')).toHaveLength(1));
    expect(JSON.parse(String((writes(f, '/checklists/c1/cancel')[0]![1] as RequestInit).body))).toEqual({ reason: 'Candidate did not join' });
  });
  it('an exit clearance has no cancel: it follows its separation', async () => {
    mockApi(HR, (url) => (url.includes('/checklists/c1') ? { ...CHECKLIST, kind: 'offboarding', separation_id: 's1' } : lists(url)));
    showPage(<Lifecycle />, '/lifecycle?tab=onboarding');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await screen.findByRole('button', { name: 'Skip' });
    expect(screen.queryByRole('button', { name: 'Cancel checklist' })).toBeNull();
  });
});

describe('my tasks', () => {
  it('marking done offers an undo to those who may reopen', async () => {
    const f = mockApi(HR, (url) => lists(url));
    showPage(<Lifecycle />, '/lifecycle');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/tasks/t1/reopen')).toHaveLength(1));
  });
  it('those who cannot reopen get no undo', async () => {
    mockApi(['lifecycle.self'], (url) => lists(url));
    showPage(<Lifecycle />, '/lifecycle');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    await screen.findByText('Done');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
