import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Policies } from '../../pages/Policies';
import { mockPageApi, problem, reads, renderPage, writes } from '../../test/pageHarness';

afterEach(() => vi.restoreAllMocks());

const LIST = { id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', published_version: 1, effective_from: '2026-01-01', requires_ack: true, drafts: 1, audience: 10, acknowledged: 4 };
const VERSION = { id: 'v2', version_no: 2, status: 'draft', change_summary: 'Updated gifts', effective_from: '2026-12-01', requires_ack: true, ack_due_days: 14, file_name: null, has_body: true, audience_branch_ids: [], audience_department_ids: [], created_at: '2026-11-01T10:00:00Z', published_at: null, created_by: 'u9', created_by_name: 'Someone', published_by_name: null, acknowledgements: 0 };
const DETAIL = { id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', created_at: '2026-01-01T00:00:00Z', versions: [VERSION] };

const manage = (extra: (url: string, init: RequestInit) => unknown = () => undefined, perms = ['policies.self', 'policies.read', 'policies.manage', 'policies.publish']) => mockPageApi(perms, (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (url.endsWith('/policies/mine')) return { items: [], pending: 0, overdue: 0, date: '2026-11-01' };
  if (url.endsWith('/api/v1/policies')) return { items: [LIST] };
  if (url.endsWith('/policies/p1')) return DETAIL;
  return { items: [] };
});

const openDetail = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Code of conduct' }));
  return screen.findByRole('dialog', { name: /COC/ });
};

describe('policies', () => {
  it('a publish that fails keeps the dialog open with the reason', async () => {
    manage((url, init) => (url.includes('/publish') && init.method === 'POST' ? problem(409, 'Someone else already published') : undefined));
    renderPage(<Policies />, '/policies?tab=manage');
    const detail = await openDetail();
    await userEvent.click(within(detail).getByRole('button', { name: 'Publish' }));
    const dlg = await screen.findByRole('dialog', { name: 'Publish version' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Publish' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Someone else already published');
  });
  it('someone who can publish or manage but not read is told so, and nothing fails', async () => {
    const f = manage(undefined, ['policies.publish']);
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText('Your role cannot view the policy list')).toBeTruthy();
    expect(reads(f, '/api/v1/policies')).toHaveLength(0);
  });
  it('the tab is in the URL', async () => {
    manage();
    renderPage(<Policies />, '/policies?tab=manage');
    expect((await screen.findByRole('tab', { name: 'Manage policies' })).getAttribute('aria-selected')).toBe('true');
  });
  it('a policy can be renamed from its detail', async () => {
    const f = manage((url, init) => (init.method === 'PUT' ? { ok: true } : undefined));
    renderPage(<Policies />, '/policies?tab=manage');
    const detail = await openDetail();
    await userEvent.click(within(detail).getByRole('button', { name: 'Edit details' }));
    const form = await screen.findByRole('dialog', { name: 'Edit policy details' });
    const title = within(form).getByLabelText(/Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Conduct');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/policies/p1')).toHaveLength(1));
    expect(JSON.parse((writes(f, '/policies/p1')[0]![1] as RequestInit).body as string).title).toBe('Conduct');
  });
  it('an acknowledgement shows the organization date, not the UTC one', async () => {
    mockPageApi(['policies.self'], () => ({ pending: 0, overdue: 0, date: '2026-11-01', items: [{ id: 'v1', title: 'Leave policy', category: 'hr', version_no: 1, effective_from: '2026-01-01', change_summary: 'First', requires_ack: true, acknowledged_at: '2026-03-01T20:00:00Z', due_on: null }] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText(/Acknowledged 02\/03\/2026/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave policy' })).toBeTruthy();
  });
});
