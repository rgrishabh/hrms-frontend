import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Policies } from '../../pages/Policies';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

configure({ asyncUtilTimeout: 10000 });
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const ALL = ['policies.self', 'policies.read', 'policies.manage', 'policies.publish'];
const LIST = { id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', published_version: 1, effective_from: '2026-01-01', requires_ack: true, drafts: 1, audience: 10, acknowledged: 4 };
const version = (over: object = {}) => ({ id: 'v1', version_no: 1, status: 'published', change_summary: 'First issue', effective_from: '2026-01-01', requires_ack: true, audience_branch_ids: [], audience_department_ids: [], created_by: 'u9', created_by_name: 'Meera', published_by_name: 'Sunil', acknowledgements: 4, ...over });
const DRAFT = version({ id: 'v2', version_no: 2, status: 'draft', change_summary: 'Updated gifts', published_by_name: null, acknowledgements: 0 });
const detail = (versions: object[], over: object = {}) => ({ id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', versions, ...over });
const ACK_PAGE = { items: [
  { employee_id: 'e2', name: 'Asha Rao', employee_code: 'E2', branch: 'Pune', department: 'Finance', acknowledged_at: '2026-02-01T05:00:00Z' },
  { employee_id: 'e3', name: 'Ravi Nair', employee_code: 'E3', branch: null, department: null, acknowledged_at: null },
], page: 1, pageSize: 25, total: 60 };

type Extra = (url: string, init: RequestInit) => unknown;
const api = (policy: object, extra: Extra = () => undefined, perms: readonly string[] = ALL) => mockPageApi(perms, (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (init.method && init.method !== 'GET') return { id: 'x' };
  if (url.endsWith('/policies/mine')) return { items: [], pending: 0, overdue: 0, date: '2026-11-01' };
  if (url.endsWith('/api/v1/policies')) return { items: [LIST] };
  if (url.endsWith('/policies/p1')) return policy;
  if (url.endsWith('/api/v1/org')) return { legalEntities: [], branches: [{ id: 'b1', name: 'Pune' }], departments: [{ id: 'd1', name: 'Finance' }, { id: 'd2', name: 'Sales' }] };
  if (url.includes('/acknowledgements')) return ACK_PAGE;
  return { items: [] };
});
const openDetail = async () => {
  renderPage(<Policies />, '/policies?tab=manage');
  await userEvent.click(await screen.findByRole('button', { name: 'Code of conduct' }));
  return screen.findByRole('dialog', { name: 'COC — Code of conduct' });
};

describe('policy versions', () => {
  it('shows who drafted and published each version, its audience and its acknowledgements', async () => {
    api(detail([version({ audience_department_ids: ['d1'] }), version({ id: 'v0', version_no: 0, requires_ack: false, status: 'withdrawn', change_summary: 'Old text', published_by_name: null })]));
    const dlg = await openDetail();
    const row = (await within(dlg).findByText(/First issue/)).closest('tr')!;
    expect(within(row).getByText('Limited audience')).toBeTruthy();
    expect(within(row).getByText('Meera → Sunil')).toBeTruthy();
    expect(within(row).getByText('4')).toBeTruthy();
    const old = within(dlg).getByText(/Old text/).closest('tr')!;
    expect(within(old).getByText('Meera')).toBeTruthy();
    expect(within(old).getByText('—')).toBeTruthy();
    expect(within(old).queryByRole('button', { name: 'Report' })).toBeNull();
    expect(within(dlg).getByText('Code of conduct · HR')).toBeTruthy();
  });
  it('a retired policy offers no changes, and an unknown category reads as sent', async () => {
    api(detail([], { status: 'retired', category: 'misc', owner: null }));
    const dlg = await openDetail();
    expect(await within(dlg).findByText('misc')).toBeTruthy();
    expect(within(dlg).getByText('No versions yet.')).toBeTruthy();
    for (const name of ['Edit details', 'New version', 'Retire']) expect(within(dlg).queryByRole('button', { name })).toBeNull();
  });
  it('the author of a draft is told another publisher is needed, and cannot publish it', async () => {
    api(detail([version({ ...DRAFT, created_by: 'u1' })]));
    const dlg = await openDetail();
    expect(await within(dlg).findByText('Needs another publisher')).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Publish' })).toBeNull();
  });
  it('someone who may only read sees versions and View, nothing that changes them', async () => {
    api(detail([DRAFT, version()]), undefined, ['policies.read']);
    const dlg = await openDetail();
    await within(dlg).findByText(/Updated gifts/);
    expect(within(dlg).getAllByRole('button', { name: 'View' })).toHaveLength(2);
    for (const name of ['Publish', 'Discard', 'Withdraw', 'Retire', 'Edit details', 'New version']) expect(within(dlg).queryByRole('button', { name })).toBeNull();
  });
  it('publishing posts to the version and says how many people were told', async () => {
    const f = api(detail([DRAFT]), (url, init) => (url.includes('/publish') && init.method === 'POST' ? { notified: 12 } : undefined));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Publish' }));
    const confirm = await screen.findByRole('dialog', { name: 'Publish version' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Published; 12 people notified')).toBeTruthy();
    const [call] = writes(f, '/policies/versions/v2/publish');
    expect((call![1] as RequestInit).method).toBe('POST');
    expect(bodyOf(call!)).toEqual({});
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Publish version' })).toBeNull());
  });
  it('discarding a draft asks first and sends no reason', async () => {
    const f = api(detail([DRAFT]));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Discard' }));
    expect(writes(f, '/discard')).toHaveLength(0);
    const confirm = await screen.findByRole('dialog', { name: 'Discard draft' });
    expect(within(confirm).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('Draft discarded')).toBeTruthy();
    expect(bodyOf(writes(f, '/policies/versions/v2/discard')[0]!)).toEqual({});
  });
  it('withdrawing waits for a reason and sends it', async () => {
    const f = api(detail([version()]));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Withdraw' }));
    const confirm = await screen.findByRole('dialog', { name: 'Withdraw version' });
    const go = within(confirm).getByRole('button', { name: 'Withdraw' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(within(confirm).getByRole('textbox'), 'Wrong annexure');
    await userEvent.click(go);
    expect(await screen.findByText('Withdrawn')).toBeTruthy();
    expect(bodyOf(writes(f, '/policies/versions/v1/withdraw')[0]!)).toEqual({ reason: 'Wrong annexure' });
  });
  it('retiring posts to the policy with the reason, and a cancel sends nothing', async () => {
    const f = api(detail([version()]));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Retire' }));
    let confirm = await screen.findByRole('dialog', { name: 'Retire policy' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Retire policy' })).toBeNull());
    expect(writes(f, '/retire')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Retire' }));
    confirm = await screen.findByRole('dialog', { name: 'Retire policy' });
    await userEvent.type(within(confirm).getByRole('textbox'), 'Merged into another');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Retire' }));
    expect(await screen.findByText('Policy retired')).toBeTruthy();
    expect(bodyOf(writes(f, '/policies/p1/retire')[0]!)).toEqual({ reason: 'Merged into another' });
  });
  it('View opens the version from the detail', async () => {
    const f = api(detail([version()]), (url) => (url.endsWith('/policies/versions/v1') ? { id: 'v1', policyId: 'p1', code: 'COC', title: 'Code of conduct', versionNo: 1, status: 'published', body: 'The text of the code', fileName: null, hasFile: false, contentSha256: 'abc', requiresAck: false, changeSummary: 'First issue', effectiveFrom: '2026-01-01', publishedAt: '2026-01-01T00:00:00Z', acknowledgedAt: null } : undefined));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'View' }));
    expect(await screen.findByText('The text of the code')).toBeTruthy();
    expect(reads(f, '/policies/versions/v1')).toHaveLength(1);
  });
});

describe('editing details', () => {
  it('saves the category and clears the owner to null', async () => {
    const f = api(detail([version()]));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Edit details' }));
    const form = await screen.findByRole('dialog', { name: 'Edit policy details' });
    await userEvent.selectOptions(within(form).getByLabelText(/Category/), 'posh');
    await userEvent.clear(within(form).getByLabelText(/Owner/));
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/policies/p1')).toHaveLength(1));
    expect(bodyOf(writes(f, '/policies/p1')[0]!)).toEqual({ title: 'Code of conduct', category: 'posh', owner: null });
    expect(await screen.findByText('Policy saved')).toBeTruthy();
  });
  it('a refused save stays open and puts the reason on the field', async () => {
    api(detail([version()]), (_url, init) => (init.method === 'PUT' ? problem(400, 'Check the form', { errors: [{ path: 'owner', message: 'Owner is too long' }] }) : undefined));
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Edit details' }));
    const form = await screen.findByRole('dialog', { name: 'Edit policy details' });
    await userEvent.type(within(form).getByLabelText(/Owner/), ' team');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByText('Owner is too long')).toBeTruthy();
    expect((within(form).getByLabelText(/Owner/) as HTMLInputElement).value).toBe('HR team');
  });
});

describe('new version', () => {
  const openForm = async () => {
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'New version' }));
    return screen.findByRole('dialog', { name: 'New policy version' });
  };
  it('is not offered while a draft exists', async () => {
    api(detail([DRAFT]));
    const dlg = await openDetail();
    await within(dlg).findByText(/Updated gifts/);
    expect(within(dlg).queryByRole('button', { name: 'New version' })).toBeNull();
  });
  it('needs text or a file before anything is sent', async () => {
    const f = api(detail([version()]));
    const form = await openForm();
    await userEvent.type(within(form).getByLabelText(/What changed/), 'New gifts rule');
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }));
    expect(await within(form).findByText('Enter the policy text or attach a PDF.')).toBeTruthy();
    expect(writes(f, '/versions')).toHaveLength(0);
  });
  it('sends the text, dates, days and the ticked audience as a form', async () => {
    const f = api(detail([version()]));
    const form = await openForm();
    await userEvent.type(within(form).getByLabelText(/What changed/), 'New gifts rule');
    fireEvent.change(within(form).getByLabelText(/Effective from/), { target: { value: '2026-12-15' } });
    fireEvent.change(within(form).getByLabelText(/Acknowledge within/), { target: { value: '30' } });
    await userEvent.type(within(form).getByLabelText(/Policy text/), 'Gifts over 500 are declared.');
    await userEvent.click(await within(form).findByRole('checkbox', { name: 'Pune' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Finance' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Sales' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Finance' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/policies/p1/versions')).toHaveLength(1));
    const sent = (writes(f, '/policies/p1/versions')[0]![1] as RequestInit).body as FormData;
    expect(Object.fromEntries(sent.entries())).toEqual({ changeSummary: 'New gifts rule', effectiveFrom: '2026-12-15', requiresAck: 'true', ackDueDays: '30', body: 'Gifts over 500 are declared.', audienceBranchIds: 'b1', audienceDepartmentIds: 'd2' });
    expect(await screen.findByText('Draft saved; another publisher must publish it')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New policy version' })).toBeNull());
  });
  it('accepts a PDF alone, and turning off acknowledgement holds the days', async () => {
    const f = api(detail([version()]));
    const form = await openForm();
    await userEvent.type(within(form).getByLabelText(/What changed/), 'Signed copy');
    await userEvent.click(within(form).getByRole('checkbox', { name: /must acknowledge/ }));
    expect((within(form).getByLabelText(/Acknowledge within/) as HTMLInputElement).disabled).toBe(true);
    const pdf = new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' });
    await userEvent.upload(within(form).getByLabelText(/PDF \(optional\)/), pdf);
    expect(within(form).getByText('signed.pdf')).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/policies/p1/versions')).toHaveLength(1));
    const sent = (writes(f, '/policies/p1/versions')[0]![1] as RequestInit).body as FormData;
    expect(sent.get('requiresAck')).toBe('false');
    expect(sent.get('body')).toBeNull();
    expect((sent.get('file') as File).name).toBe('signed.pdf');
  });
  it('a refused upload stays open with the reason and what was typed', async () => {
    api(detail([version()]), (url, init) => (url.endsWith('/policies/p1/versions') && init.method === 'POST' ? problem(422, 'The file failed the malware scan') : undefined));
    const form = await openForm();
    await userEvent.type(within(form).getByLabelText(/What changed/), 'Signed copy');
    await userEvent.type(within(form).getByLabelText(/Policy text/), 'Some text');
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }));
    expect(await within(form).findByText('The file failed the malware scan')).toBeTruthy();
    expect((within(form).getByLabelText(/Policy text/) as HTMLTextAreaElement).value).toBe('Some text');
  });
});

describe('acknowledgement report', () => {
  const openReport = async () => {
    const dlg = await openDetail();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Report' }));
    return screen.findByRole('dialog', { name: 'Acknowledgements — v1' });
  };
  it('starts with who has not acknowledged, filters, and returns to the first page', async () => {
    const f = api(detail([version()]));
    const rep = await openReport();
    await within(rep).findByText(/Asha Rao/);
    expect(reads(f, '/versions/v1/acknowledgements?status=pending&page=1&pageSize=25').length).toBeGreaterThan(0);
    const asha = within(rep).getByText(/Asha Rao/).closest('tr')!;
    expect(within(asha).getByText('Pune · Finance')).toBeTruthy();
    const ravi = within(rep).getByText(/Ravi Nair/).closest('tr')!;
    expect(within(ravi).getByText('Pending')).toBeTruthy();
    expect(within(ravi).getByText('—')).toBeTruthy();
    await userEvent.click(within(rep).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'acknowledgements?status=pending&page=2').length).toBeGreaterThan(0));
    await userEvent.selectOptions(within(rep).getByLabelText('Show'), 'acknowledged');
    await waitFor(() => expect(reads(f, 'acknowledgements?status=acknowledged&page=1').length).toBeGreaterThan(0));
    await userEvent.selectOptions(within(rep).getByLabelText('Show'), '');
    await waitFor(() => expect(reads(f, 'acknowledgements?page=1&pageSize=25').length).toBeGreaterThan(0));
  });
  it('says so when nobody matches', async () => {
    api(detail([version()]), (url) => (url.includes('/acknowledgements') ? { items: [], page: 1, pageSize: 25, total: 0 } : undefined));
    const rep = await openReport();
    expect(await within(rep).findByText('Nobody here.')).toBeTruthy();
  });
  it('exports ask the API for the file, and a failure stays on the page as a message', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const f = api(detail([version()]), (url) => {
      if (url.endsWith('acknowledgements.xlsx')) return new Response('x', { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      if (url.endsWith('acknowledgements.csv')) return problem(403, 'You cannot export this');
      return undefined;
    });
    const rep = await openReport();
    await userEvent.click(await within(rep).findByRole('button', { name: 'Export Excel' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(reads(f, '/versions/v1/acknowledgements.xlsx')).toHaveLength(1);
    await userEvent.click(within(rep).getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText('You cannot export this')).toBeTruthy();
    expect(click).toHaveBeenCalledTimes(1);
  });
});
