import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../test/page';
import { Approvals } from './Approvals';

afterEach(() => vi.restoreAllMocks());

const paged = <T,>(items: T[], total = items.length, page = 1) => ({ items, page, pageSize: 25, total });
const ITEM = { id: 'a1', summary: 'Leave for Rohan', entity_type: 'leave_request', requester_name: 'Rohan Iyer', created_at: '2026-10-01T04:30:00Z' };
const MINE = { id: 'm1', summary: 'My expense', status: 'pending', created_at: '2026-10-01T04:30:00Z', decided_at: null };
const STUCK = { id: 's1', entity_type: 'mystery_type', summary: 'Stuck claim', created_at: '2026-10-01T04:30:00Z', requester_name: 'Bo' };
const api = (o: { inbox?: unknown[]; mine?: unknown[]; stuck?: unknown[]; detail?: unknown; total?: number } = {}, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { status: 'approved' };
  if (url.includes('/approvals/inbox')) return paged(o.inbox ?? [], o.total ?? (o.inbox ?? []).length, url.includes('page=2') ? 2 : 1);
  if (url.includes('/approvals/mine')) return paged(o.mine ?? []);
  if (url.includes('/approvals/stuck')) return paged(o.stuck ?? []);
  if (url.includes('/approvals/delegations')) return { given: [], received: [] };
  if (url.includes('/profile-changes/')) return { section: 'contacts', items: [], current: [], note: null };
  return o.detail ?? {};
};

describe('awaiting me', () => {
  it('shows who it came from, the type, how it reached me, and the count', async () => {
    mockPageApi([], api({ inbox: [{ ...ITEM, via: 'delegation', on_behalf_of: 'Asha' }, { ...ITEM, id: 'a2', summary: 'Second', via: 'escalation', on_behalf_of: null, entity_type: 'new_kind' }, { ...ITEM, id: 'a3', summary: 'Third', via: 'escalation', on_behalf_of: 'Bo' }] }));
    renderPage(<Approvals />);
    const table = within(await screen.findByRole('table', { name: 'Awaiting my approval' }));
    expect(table.getByText('Covering for Asha')).toBeTruthy();
    expect(table.getByText('Escalated: waiting on the approver')).toBeTruthy();
    expect(table.getByText('Escalated: waiting on Bo')).toBeTruthy();
    expect(table.getAllByText('Leave').length).toBeGreaterThan(0);
    expect(table.getByText('new_kind')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Awaiting me/ }).textContent).toContain('3');
    expect(table.queryByRole('button', { name: 'Reassign' })).toBeNull();
  });
  it('says when nothing is waiting, and the stuck tab is only for administrators', async () => {
    mockPageApi([], api());
    renderPage(<Approvals />);
    expect(await screen.findByText('Nothing waiting for you')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Stuck' })).toBeNull();
  });
  it('approving posts the action with no comment and reports the new status', async () => {
    const f = mockPageApi([], api({ inbox: [ITEM] }));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dlg = await screen.findByRole('dialog', { name: 'Approve request' });
    expect(within(dlg).getByText('Leave for Rohan')).toBeTruthy();
    expect(within(dlg).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes(f, '/api/v1/approvals/a1/act')).toHaveLength(1));
    expect(bodyOf(writes(f, '/act')[0]!)).toEqual({ action: 'approve' });
    expect(await screen.findByText('Request approved')).toBeTruthy();
  });
  it('rejecting needs a comment and sends it', async () => {
    const f = mockPageApi([], api({ inbox: [ITEM] }));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dlg = await screen.findByRole('dialog', { name: 'Reject request' });
    const confirm = within(dlg).getByRole('button', { name: 'Reject' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dlg).getByRole('textbox'), 'No cover');
    await userEvent.click(confirm);
    await waitFor(() => expect(writes(f, '/act')).toHaveLength(1));
    expect(bodyOf(writes(f, '/act')[0]!)).toEqual({ action: 'reject', comment: 'No cover' });
  });
  it('a refused return stays open with the reason and the comment', async () => {
    mockPageApi([], api({ inbox: [ITEM] }, (url, init) => (init.method === 'POST' ? problem(409, 'Already decided') : undefined)));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Return' }));
    const dlg = await screen.findByRole('dialog', { name: 'Return request' });
    await userEvent.type(within(dlg).getByRole('textbox'), 'Add the dates');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Return for correction' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already decided');
    expect((within(dlg).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Add the dates');
  });
  it('asks for the next page', async () => {
    const f = mockPageApi([], api({ inbox: [ITEM], total: 60 }));
    renderPage(<Approvals />);
    await screen.findByRole('table', { name: 'Awaiting my approval' });
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(reads(f, '/api/v1/approvals/inbox?page=2&pageSize=25').length).toBeGreaterThan(0));
  });
  it('someone who handles escalations can open Reassign', async () => {
    mockPageApi(['approvals.escalations'], api({ inbox: [ITEM] }));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reassign' }));
    expect(await screen.findByRole('dialog', { name: /Reassign/ })).toBeTruthy();
  });
});

describe('approval history', () => {
  const STEP = { step_index: 0, status: 'approved', approver_name: 'Asha', approver_permission: 'leave.approve', escalated_at: null, escalated_to_name: null, acted_by_name: 'Asha', acted_for_name: null, acted_via: null, acted_at: '2026-10-02T04:30:00Z', comment: 'Fine' };
  it('walks through the steps with group names, escalations and who acted', async () => {
    const f = mockPageApi([], api({ inbox: [ITEM], detail: { summary: 'Leave for Rohan', status: 'pending', entity_type: 'leave_request', entity_id: 'x', steps: [
      STEP,
      { ...STEP, step_index: 1, status: 'pending', approver_name: null, approver_permission: 'payroll.approve', escalated_at: '2026-10-03T04:30:00Z', escalated_to_name: null, acted_by_name: 'Bo', acted_for_name: 'Asha', acted_via: 'escalation', comment: null },
      { ...STEP, step_index: 2, status: 'waiting', approver_name: null, approver_permission: 'odd.perm', escalated_at: '2026-10-03T04:30:00Z', escalated_to_name: 'Kavita', acted_by_name: null, comment: null },
      { ...STEP, step_index: 3, status: 'rejected', approver_name: 'Cy', acted_by_name: null, comment: null },
    ] } }));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Leave for Rohan' }));
    const dlg = within(await screen.findByRole('dialog', { name: 'Approval history' }));
    expect(await dlg.findByText(/Step 1: Asha/)).toBeTruthy();
    expect(dlg.getByText(/Step 2: Payroll approvers/)).toBeTruthy();
    expect(dlg.getByText(/Step 3: odd\.perm/)).toBeTruthy();
    expect(dlg.getByText('“Fine”')).toBeTruthy();
    expect(dlg.getByText(/Escalated to HR/)).toBeTruthy();
    expect(dlg.getByText(/Escalated to Kavita/)).toBeTruthy();
    expect(dlg.getByText(/Bo for Asha \(escalated\)/)).toBeTruthy();
    expect(reads(f, '/api/v1/approvals/a1').length).toBeGreaterThan(0);
  });
  it('a personal details change shows the proposal beside the record', async () => {
    const f = mockPageApi([], api({ inbox: [ITEM], detail: { summary: 'Leave for Rohan', status: 'pending', entity_type: 'employee_profile_change', entity_id: 'c1', steps: [] } }));
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Leave for Rohan' }));
    expect(await screen.findByText('Proposed emergency contacts')).toBeTruthy();
    expect(reads(f, '/api/v1/employees/profile-changes/c1')).toHaveLength(1);
  });
});

describe('my requests', () => {
  it('lists mine, and only a pending one can be cancelled, after asking', async () => {
    const f = mockPageApi([], api({ mine: [MINE, { ...MINE, id: 'm2', summary: 'Decided', status: 'approved', decided_at: '2026-10-05T04:30:00Z' }] }));
    renderPage(<Approvals />, '/approvals?tab=mine');
    const table = within(await screen.findByRole('table', { name: 'My requests' }));
    expect(table.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    await userEvent.click(table.getByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel request' });
    expect(writes(f, '/cancel')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(writes(f, '/api/v1/approvals/m1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Request cancelled')).toBeTruthy();
  });
  it('says when I have none', async () => {
    mockPageApi([], api());
    renderPage(<Approvals />, '/approvals?tab=mine');
    expect(await screen.findByText('You have not submitted any requests')).toBeTruthy();
  });
  it('opens the history of my own request', async () => {
    mockPageApi([], api({ mine: [MINE], detail: { summary: 'My expense', status: 'pending', entity_type: 'expense_claim', entity_id: 'x', steps: [] } }));
    renderPage(<Approvals />, '/approvals?tab=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'My expense' }));
    const dlg = await screen.findByRole('dialog', { name: 'Approval history' });
    expect(await within(dlg).findByText('My expense')).toBeTruthy();
  });
});

describe('other tabs', () => {
  it('moving to While I am away shows the handover screen', async () => {
    const f = mockPageApi([], api());
    renderPage(<Approvals />);
    await userEvent.click(await screen.findByRole('tab', { name: "While I'm away" }));
    expect(await screen.findByRole('region', { name: 'My handover' })).toBeTruthy();
    expect(reads(f, '/approvals/delegations').length).toBeGreaterThan(0);
  });
  it('stuck requests are loaded only on that tab, for administrators, and can be reassigned', async () => {
    const f = mockPageApi(['users.manage'], api({ stuck: [STUCK] }));
    renderPage(<Approvals />);
    await screen.findByRole('tab', { name: 'Stuck' });
    expect(reads(f, '/approvals/stuck')).toHaveLength(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Stuck' }));
    const table = within(await screen.findByRole('table', { name: 'Stuck requests' }));
    expect(table.getByText('mystery_type')).toBeTruthy();
    expect(table.getByText('Bo')).toBeTruthy();
    await userEvent.click(table.getByRole('button', { name: 'Reassign Stuck claim' }));
    expect(await screen.findByRole('dialog', { name: /Reassign/ })).toBeTruthy();
  });
  it('says when nothing is stuck', async () => {
    mockPageApi(['users.manage'], api());
    renderPage(<Approvals />, '/approvals?tab=stuck');
    expect(await screen.findByText('Nothing is stuck')).toBeTruthy();
  });
});
