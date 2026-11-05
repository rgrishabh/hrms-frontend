import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Policies } from '../../pages/Policies';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

afterEach(() => vi.restoreAllMocks());

const mine = (over: object = {}) => ({ id: 'v1', title: 'Leave policy', category: 'hr', version_no: 3, effective_from: '2026-01-15', change_summary: 'Carry forward', requires_ack: true, acknowledged_at: null, due_on: '2026-12-01', ...over });
const view = (over: object = {}) => ({ id: 'v1', policyId: 'p1', code: 'LV', title: 'Leave policy', versionNo: 3, status: 'published', body: 'Earned leave accrues monthly.', fileName: null, hasFile: false, contentSha256: 'sha-1', requiresAck: true, changeSummary: 'Carry forward', effectiveFrom: '2026-01-15', publishedAt: '2026-01-01T00:00:00Z', acknowledgedAt: null, ...over });
const row = (over: object = {}) => ({ id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', published_version: 1, effective_from: '2026-01-01', requires_ack: true, drafts: 0, audience: 10, acknowledged: 4, ...over });

describe('my policies', () => {
  it('tells someone with one due and shows its version, category and due date', async () => {
    mockPageApi(['policies.self'], () => ({ pending: 1, overdue: 0, date: '2026-11-01', items: [mine()] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText('1 policy needs your acknowledgement.')).toBeTruthy();
    const line = screen.getByRole('button', { name: 'Leave policy' }).closest('tr')!;
    expect(within(line).getByText('Due 01/12/2026').className).toContain('warn');
    expect(within(line).getByText('HR')).toBeTruthy();
    expect(within(line).getByText('v3')).toBeTruthy();
    expect(within(line).getByText('15/01/2026')).toBeTruthy();
    expect(within(line).getByText('Carry forward')).toBeTruthy();
  });
  it('an overdue policy is an error, in plural, and marks the row', async () => {
    mockPageApi(['policies.self'], () => ({ pending: 2, overdue: 1, date: '2026-11-01', items: [mine({ due_on: '2026-10-01' }), mine({ id: 'v2', title: 'Hygiene', category: 'custom', requires_ack: false, due_on: null })] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText('2 policies need your acknowledgement (1 overdue).')).toBeTruthy();
    expect(screen.getByText('Due 01/10/2026').className).toContain('danger');
    const info = screen.getByRole('button', { name: 'Hygiene' }).closest('tr')!;
    expect(within(info).getByText('For information')).toBeTruthy();
    expect(within(info).getByText('custom')).toBeTruthy();
  });
  it('says so when nothing is published', async () => {
    mockPageApi(['policies.self'], () => ({ pending: 0, overdue: 0, date: '2026-11-01', items: [] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText('No policies have been published for you yet.')).toBeTruthy();
  });
});

describe('reading a version', () => {
  const open = (over: object, extra: (url: string, init: RequestInit) => unknown = () => undefined, employeeId: string | null = 'e1') => mockPageApi(['policies.self'], [], (url, init) => {
    const out = extra(url, init);
    if (out !== undefined) return out;
    if (url.endsWith('/policies/mine')) return { pending: 1, overdue: 0, date: '2026-11-01', items: [mine()] };
    if (url.endsWith('/policies/versions/v1')) return view(over);
    return { ok: true };
  }, employeeId);
  it('opens from the list, shows the text, and closing leaves the version out of the URL', async () => {
    const f = open({});
    renderPage(<Policies />, '/policies');
    await userEvent.click(await screen.findByRole('button', { name: 'Leave policy' }));
    const dlg = await screen.findByRole('dialog', { name: 'Leave policy — v3' });
    expect(await within(dlg).findByText('Earned leave accrues monthly.')).toBeTruthy();
    expect(within(dlg).getByText('What changed: Carry forward')).toBeTruthy();
    expect(within(dlg).getByText('Effective 15/01/2026')).toBeTruthy();
    expect(reads(f, '/policies/versions/v1')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('the acknowledgement waits for the tick and sends the hash of what was read', async () => {
    const f = open({});
    renderPage(<Policies />, '/policies?version=v1');
    const go = await screen.findByRole('button', { name: 'Acknowledge' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /I have read and understood/ }));
    expect(go.disabled).toBe(false);
    await userEvent.click(go);
    await waitFor(() => expect(writes(f, '/policies/versions/v1/acknowledge')).toHaveLength(1));
    expect(bodyOf(writes(f, '/policies/versions/v1/acknowledge')[0]!)).toEqual({ contentSha256: 'sha-1' });
    expect(await screen.findByText('Thank you — acknowledgement recorded')).toBeTruthy();
  });
  it('a refused acknowledgement shows why, and the form stays', async () => {
    open({}, (url, init) => (url.endsWith('/acknowledge') && init.method === 'POST' ? problem(409, 'This version was replaced') : undefined));
    renderPage(<Policies />, '/policies?version=v1');
    await userEvent.click(await screen.findByRole('checkbox', { name: /I have read and understood/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('This version was replaced')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeTruthy();
  });
  it('already acknowledged says when, with no form', async () => {
    open({ acknowledgedAt: '2026-03-01T20:00:00Z' });
    renderPage(<Policies />, '/policies?version=v1');
    expect(await screen.findByText(/You acknowledged this version on 0?2\/0?3\/2026/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });
  it('a draft or an information-only policy asks for no acknowledgement; a PDF has its link', async () => {
    open({ status: 'draft', hasFile: true, fileName: 'signed.pdf', body: null });
    renderPage(<Policies />, '/policies?version=v1');
    const link = await screen.findByRole('link', { name: 'Open signed.pdf' });
    expect(link.getAttribute('href')).toBe('/api/v1/policies/versions/v1/file?inline=true');
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('a login with no employee record is not asked to acknowledge', async () => {
    open({}, undefined, null);
    renderPage(<Policies />, '/policies?version=v1');
    await screen.findByText('Earned leave accrues monthly.');
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });
  it('a version that cannot be loaded says why', async () => {
    open({}, (url) => (url.endsWith('/policies/versions/v1') ? problem(404, 'No such version') : undefined));
    renderPage(<Policies />, '/policies?version=v1');
    expect(await screen.findByText('No such version')).toBeTruthy();
  });
});

describe('managing the list', () => {
  const list = (items: object[], perms: readonly string[] = ['policies.read', 'policies.manage'], extra: (url: string, init: RequestInit) => unknown = () => undefined) => mockPageApi(perms, (url, init) => {
    const out = extra(url, init);
    if (out !== undefined) return out;
    if (url.endsWith('/api/v1/policies') && init.method === 'GET') return { items };
    return { items: [] };
  });
  it('shows what is published, who acknowledged and which have drafts', async () => {
    list([row({ drafts: 1 }), row({ id: 'p2', title: 'Hygiene', code: 'HYG', requires_ack: false, category: 'misc' }), row({ id: 'p3', title: 'Unpublished', code: 'NEW', published_version: null, effective_from: null, requires_ack: null, audience: null, acknowledged: null })]);
    renderPage(<Policies />, '/policies?tab=manage');
    const coc = (await screen.findByRole('button', { name: 'Code of conduct' })).closest('tr')!;
    expect(within(coc).getByText('Draft')).toBeTruthy();
    expect(within(coc).getByText('v1 · 01/01/2026')).toBeTruthy();
    expect(within(coc).getByText('4 / 10')).toBeTruthy();
    const hyg = screen.getByRole('button', { name: 'Hygiene' }).closest('tr')!;
    expect(within(hyg).getByText('Not required')).toBeTruthy();
    expect(within(hyg).getByText('misc')).toBeTruthy();
    expect(within(hyg).queryByText('Draft')).toBeNull();
    expect(within(screen.getByRole('button', { name: 'Unpublished' }).closest('tr')!).getAllByText('—')).toHaveLength(2);
  });
  it('an empty list suggests where to begin; read-only has no New policy', async () => {
    list([], ['policies.read']);
    renderPage(<Policies />, '/policies?tab=manage');
    expect(await screen.findByText('No policies yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New policy' })).toBeNull();
  });
  it('creating upper-cases the code, sends a null owner when blank, and opens the new policy', async () => {
    const f = list([], undefined, (url, init) => {
      if (url.endsWith('/api/v1/policies') && init.method === 'POST') return { id: 'p9' };
      if (url.endsWith('/policies/p9')) return { id: 'p9', code: 'GFT', title: 'Gifts policy', category: 'posh', owner: null, status: 'active', versions: [] };
      return undefined;
    });
    renderPage(<Policies />, '/policies?tab=manage');
    await userEvent.click(await screen.findByRole('button', { name: 'New policy' }));
    const form = await screen.findByRole('dialog', { name: 'New policy' });
    await userEvent.type(within(form).getByLabelText(/Code/), 'gft');
    expect((within(form).getByLabelText(/Code/) as HTMLInputElement).value).toBe('GFT');
    await userEvent.selectOptions(within(form).getByLabelText(/Category/), 'posh');
    await userEvent.type(within(form).getByLabelText(/Title/), 'Gifts policy');
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes(f, '/api/v1/policies')).toHaveLength(1));
    expect(bodyOf(writes(f, '/api/v1/policies')[0]!)).toEqual({ code: 'GFT', title: 'Gifts policy', category: 'posh', owner: null });
    expect(await screen.findByRole('dialog', { name: 'GFT — Gifts policy' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New policy' })).toBeNull();
  });
  it('a refused create stays open with the reason and keeps the owner typed', async () => {
    list([], undefined, (url, init) => (url.endsWith('/api/v1/policies') && init.method === 'POST' ? problem(409, 'That code is already used') : undefined));
    renderPage(<Policies />, '/policies?tab=manage');
    await userEvent.click(await screen.findByRole('button', { name: 'New policy' }));
    const form = await screen.findByRole('dialog', { name: 'New policy' });
    await userEvent.type(within(form).getByLabelText(/Code/), 'COC');
    await userEvent.type(within(form).getByLabelText(/Title/), 'Conduct');
    await userEvent.type(within(form).getByLabelText(/Owner/), 'Compliance');
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(await within(form).findByText('That code is already used')).toBeTruthy();
    expect((within(form).getByLabelText(/Owner/) as HTMLInputElement).value).toBe('Compliance');
  });
});

describe('the page', () => {
  it('someone with no policy permission is told, and nothing is asked of the API', async () => {
    const f = mockPageApi([], () => ({ items: [] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText('You do not have access to policies')).toBeTruthy();
    expect(reads(f, '/api/v1/policies')).toHaveLength(0);
  });
  it('someone with their own policies who may manage but not read gets the explanation beside the tab', async () => {
    mockPageApi(['policies.self', 'policies.manage'], () => ({ pending: 0, overdue: 0, date: '2026-11-01', items: [] }));
    renderPage(<Policies />, '/policies');
    expect(await screen.findByText(/Managing or publishing policies also needs permission to view them/)).toBeTruthy();
    expect(await screen.findByText('No policies have been published for you yet.')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Manage policies' })).toBeNull();
  });
  it('tabs switch between own policies and the list', async () => {
    const f = mockPageApi(['policies.self', 'policies.read'], (url) => (url.endsWith('/policies/mine') ? { pending: 0, overdue: 0, date: '2026-11-01', items: [] } : { items: [] }));
    renderPage(<Policies />, '/policies');
    await screen.findByText('No policies have been published for you yet.');
    await userEvent.click(screen.getByRole('tab', { name: 'Manage policies' }));
    expect(await screen.findByText('No policies yet')).toBeTruthy();
    expect(reads(f, '/api/v1/policies').some((c) => String(c[0]).endsWith('/api/v1/policies'))).toBe(true);
  });
});
