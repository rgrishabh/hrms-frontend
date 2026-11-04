import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Approvals } from '../../pages/Approvals';
import { mockPageApi, problem, renderPage, writes } from '../../test/pageHarness';

const INBOX = { items: [{ id: 'a1', summary: 'Salary change', entity_type: 'salary_change', requester_name: 'Asha', created_at: '2026-11-01T04:00:00Z', via: 'escalation' }] };
const handler = (reassign: () => unknown) => (url: string) => {
  if (url.endsWith('/approvals/inbox')) return INBOX;
  if (url.endsWith('/approvals/mine')) return { items: [] };
  if (url.includes('/approvals/delegates')) return { items: [{ id: 'u9', name: 'Meera Nair', code: 'E9', designation: null }] };
  if (url.endsWith('/approvals/a1/reassign')) return reassign();
  return { items: [] };
};

afterEach(() => vi.restoreAllMocks());

async function fill(reason: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Reassign' }));
  const dialog = await screen.findByRole('dialog', { name: 'Reassign request' });
  const search = screen.getByRole('combobox', { name: /Decided by/ });
  await userEvent.type(search, 'Me');
  await userEvent.click(await screen.findByRole('option', { name: /Meera Nair/ }));
  await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), reason);
  return dialog;
}

describe('reassign', () => {
  it('is offered only to those who may do it', async () => {
    mockPageApi(['employees.directory'], handler(() => ({ ok: true })));
    renderPage(<Approvals />);
    await screen.findByRole('button', { name: 'Approve' });
    expect(screen.queryByRole('button', { name: 'Reassign' })).toBeNull();
  });
  it('a reason that is too short stops at the field', async () => {
    const f = mockPageApi(['approvals.escalations'], handler(() => ({ ok: true })));
    renderPage(<Approvals />);
    const dialog = await fill('no');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    expect(await screen.findByText(/at least 5 characters/)).toBeTruthy();
    expect(writes(f, '/reassign')).toHaveLength(0);
  });
  it('sends who and why, and a refusal keeps the form open with the reason', async () => {
    let refuse = true;
    const f = mockPageApi(['approvals.escalations'], handler(() => { if (refuse) { refuse = false; return problem(400, 'That person cannot act on this request'); } return { ok: true }; }));
    renderPage(<Approvals />);
    const dialog = await fill('Approver is on leave');
    const go = () => userEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    await go();
    expect(await screen.findByText('That person cannot act on this request')).toBeTruthy();
    await go();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Request reassigned to Meera Nair')).toBeTruthy();
    expect(JSON.parse(String((writes(f, '/reassign')[1]![1] as RequestInit).body))).toEqual({ userId: 'u9', reason: 'Approver is on leave' });
  });
});
