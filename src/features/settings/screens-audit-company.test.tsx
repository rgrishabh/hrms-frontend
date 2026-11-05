import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { Audit } from './Audit';
import { AuditChain } from './AuditChain';
import { CompanySettings } from './Company';
import { DataRights } from './DataRights';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** The file the browser was told to save, without jsdom trying to navigate. */
const savedFiles = () => {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(this: HTMLAnchorElement) { names.push(this.download); });
  return names;
};

const paged = <T,>(items: T[], total = items.length, page = 1) => ({ items, page, pageSize: 50, total });

describe('audit history', () => {
  const ENTRY = { id: 'a1', created_at: '2026-10-01T04:30:00Z', actor_name: 'Kavita Menon', actor_type: 'user', category: 'security', action: 'user.locked', setting_key: null, target_type: 'user', change_metadata: { reason: 'too many tries' } };
  it('names the actor, falls back for devices and the system, and shows what changed', async () => {
    mockPageApi(['audit.read'], () => paged([ENTRY, { ...ENTRY, id: 'a2', actor_name: null, actor_type: 'device', setting_key: 'attendance.grace', target_type: null }, { ...ENTRY, id: 'a3', actor_name: null, actor_type: null, target_type: null }]));
    renderPage(<Audit />);
    const table = await screen.findByRole('table', { name: 'Audit history' });
    expect(within(table).getByText('Kavita Menon')).toBeTruthy();
    expect(within(table).getByText('Device')).toBeTruthy();
    expect(within(table).getByText('System')).toBeTruthy();
    expect(within(table).getByText('attendance.grace')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    expect(within(table).getAllByText(/too many tries/)).toHaveLength(3);
  });
  it('filters by category from the first page, and Clear removes the filter', async () => {
    const f = mockPageApi(['audit.read'], (url) => (url.includes('category=access') ? paged([]) : paged([ENTRY], 120, url.includes('page=2') ? 2 : 1)));
    renderPage(<Audit />);
    await screen.findByText('user.locked');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(reads(f, 'page=2')).toHaveLength(1));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'access');
    expect(await screen.findByText('No audit entries.')).toBeTruthy();
    expect(String(f.mock.calls.at(-1)![0])).toContain('/api/v1/tenant/audit?category=access&page=1&pageSize=50');
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(await screen.findByText('user.locked')).toBeTruthy();
  });
});

describe('audit chain', () => {
  const ROW = { chain_seq: '41', id: 'r1', action: 'user.created', category: 'access', actor_id: 'u1', actor_type: 'user', target_type: 'user', created_at: '2026-10-01T04:30:00Z', prev_hash: 'aaaaaaaaaaaaaaaaaaaa', row_hash: 'bbbbbbbbbbbbbbbbbbbb' };
  const chain = (verify: unknown) => (url: string) => (url.endsWith('/chain/verify') ? verify : paged([ROW]));
  it('shows shortened hashes with the whole hash on hover', async () => {
    mockPageApi(['audit.chain'], chain({}));
    renderPage(<AuditChain />);
    const prev = await screen.findByText('aaaaaaaaaaaa…');
    expect(prev.getAttribute('title')).toBe('aaaaaaaaaaaaaaaaaaaa');
    expect(screen.getByText('bbbbbbbbbbbb…').getAttribute('title')).toBe('bbbbbbbbbbbbbbbbbbbb');
    expect(screen.getByText('41')).toBeTruthy();
  });
  it('says the chain is intact and how many entries were checked', async () => {
    const f = mockPageApi(['audit.chain'], chain({ ok: true, checked: 1200, brokenAt: null, reason: null }));
    renderPage(<AuditChain />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify chain' }));
    expect(await screen.findByText(/The chain is intact\. 1,200 entries checked\./)).toBeTruthy();
    expect(reads(f, '/tenant/audit/chain/verify')).toHaveLength(1);
  });
  it('raises an alert naming the broken entry and the reason', async () => {
    mockPageApi(['audit.chain'], chain({ ok: false, checked: 41, brokenAt: '41', reason: 'hash mismatch' }));
    renderPage(<AuditChain />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify chain' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The chain is broken at entry 41: hash mismatch. 41 entries checked.');
  });
  it('a refused check shows the reason, and a second check clears it', async () => {
    let refuse = true;
    mockPageApi(['audit.chain'], (url) => {
      if (!url.endsWith('/chain/verify')) return paged([ROW]);
      return refuse ? problem(403, 'Only the owner may verify') : { ok: true, checked: 1, brokenAt: null, reason: null };
    });
    renderPage(<AuditChain />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify chain' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Only the owner may verify');
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Verify chain' }));
    await screen.findByText(/The chain is intact/);
    expect(screen.queryByText('Only the owner may verify')).toBeNull();
  });
  it('an empty chain says so', async () => {
    mockPageApi(['audit.chain'], () => paged([]));
    renderPage(<AuditChain />);
    expect(await screen.findByText('No entries in the chain yet.')).toBeTruthy();
  });
  it('asks for the next page of the chain', async () => {
    const f = mockPageApi(['audit.chain'], () => paged([ROW], 120));
    renderPage(<AuditChain />);
    await screen.findByText('41');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(reads(f, '/tenant/audit/chain?page=2&pageSize=50')).toHaveLength(1));
  });
});

describe('company details', () => {
  const BASE = { legalName: 'Acme Pvt Ltd', gstin: '27AAAAA0000A1Z5', panMasked: 'XXXXX1234X', tan: 'MUMA12345B', cin: 'U12345MH2020PTC000000', registeredAddress: '1 High St', pfRegistration: 'PF1', esiRegistration: 'ESI1', ptRegistration: 'PT1', signatoryName: 'Kavita Menon', signatoryDesignation: 'Director', hasSignature: true, hasStamp: false, editable: true, updatedAt: null, version: 4, stored: { legalName: 'Acme Pvt Ltd', gstin: null, cin: null } };
  const MASKED = { ...BASE, bankAccountHolder: null, bankName: null, bankIfsc: null, bankAccountMasked: 'XXXXXX4321', masked: true, maskedFields: ['bankAccountHolder', 'bankName', 'bankIfsc'] };
  const REVEALED = { ...BASE, bankAccountHolder: 'Acme', bankName: 'SBI', bankIfsc: 'SBIN0001234', bankAccountMasked: 'XXXXXX4321', bankAccountNumber: '1234567894321', masked: false, maskedFields: [] };
  const api = (extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    return url.includes('reveal=1') ? REVEALED : MASKED;
  };
  beforeEach(() => { vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })); });

  it('keeps the bank details hidden until shown, and showing asks with reveal=1', async () => {
    const f = mockPageApi(['company.read'], api());
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    expect(screen.getAllByText('Hidden')).toHaveLength(3);
    expect(screen.getByText('XXXXXX4321')).toBeTruthy();
    expect(screen.queryByText('SBI')).toBeNull();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Show bank details' }));
    expect(await screen.findByText('SBIN0001234')).toBeTruthy();
    expect(screen.getByText('1234567894321')).toBeTruthy();
    expect(reads(f, '/tenant/company?reveal=1').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Hide bank details' }));
    await waitFor(() => expect(screen.queryByText('SBIN0001234')).toBeNull());
    expect(screen.getAllByText('Hidden')).toHaveLength(3);
  });
  it('a reader without company.manage gets no editing or upload, and a missing stamp says so', async () => {
    mockPageApi(['company.read'], api());
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.getByText('None uploaded.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download signature' })).toBeTruthy();
  });
  it('a managed but read-only company offers no edit', async () => {
    mockPageApi(['company.manage'], () => ({ ...REVEALED, editable: false }));
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
  it('someone who cannot see the bank block never sees those rows', async () => {
    mockPageApi(['company.read'], () => ({ ...BASE, signatoryName: null, signatoryDesignation: null, gstin: null, panMasked: null, tan: null, cin: null }));
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    expect(screen.queryByText('Bank account')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
  it('editing waits until the bank details are shown, so masked values are not saved back', async () => {
    mockPageApi(['company.read', 'company.manage'], api());
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    const edit = screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe('Show the bank details first');
    await userEvent.click(screen.getByRole('button', { name: 'Show bank details' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(false));
  });
  it('saving sends trimmed text, null for empties and the version, and leaves PAN and account out unless typed', async () => {
    const f = mockPageApi(['company.read', 'company.manage'], (url, init) => (init.method === 'PUT' ? { ok: true } : REVEALED));
    renderPage(<CompanySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit company details' });
    const legal = within(dlg).getByLabelText(/Legal name/);
    await userEvent.clear(legal);
    await userEvent.type(legal, '  Acme India  ');
    await userEvent.clear(within(dlg).getByLabelText(/^TAN/));
    await userEvent.clear(within(dlg).getByLabelText(/Registered address/));
    await userEvent.type(within(dlg).getByLabelText(/Registered address/), ' 2 Low St ');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/tenant/company')).toHaveLength(1));
    const body = bodyOf(writes(f, '/tenant/company')[0]!);
    expect(body).toMatchObject({ legalName: 'Acme India', tan: null, registeredAddress: '2 Low St', expectedVersion: 4 });
    expect(body).not.toHaveProperty('pan');
    expect(body).not.toHaveProperty('bankAccountNumber');
    expect(await screen.findByText('Company details saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('PAN is uppercased, the account keeps only digits, and a refusal keeps the form open with the field error', async () => {
    const f = mockPageApi(['company.read', 'company.manage'], (url, init) => (init.method === 'PUT' ? problem(422, 'Check the details', { errors: [{ field: 'pan', message: 'PAN is already in use' }] }) : REVEALED));
    renderPage(<CompanySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit company details' });
    expect(within(dlg).getByText('Leave empty to keep XXXXX1234X')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^PAN/), 'abcde1234f');
    await userEvent.type(within(dlg).getByLabelText(/Bank account number/), '12-34 x56');
    expect((within(dlg).getByLabelText(/^PAN/) as HTMLInputElement).value).toBe('ABCDE1234F');
    expect((within(dlg).getByLabelText(/Bank account number/) as HTMLInputElement).value).toBe('123456');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/tenant/company')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/company')[0]!)).toMatchObject({ pan: 'ABCDE1234F', bankAccountNumber: '123456' });
    expect(await within(dlg).findByText('PAN is already in use')).toBeTruthy();
    expect(within(dlg).getByText('Check the details')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^PAN/) as HTMLInputElement).value).toBe('ABCDE1234F');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('uploads a stamp to its own URL and clears the choice afterwards', async () => {
    const f = mockPageApi(['company.read', 'company.manage'], (url, init) => (init.method === 'POST' || init.method === 'PUT' ? { ok: true } : REVEALED));
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    await userEvent.upload(screen.getByLabelText('Upload stamp'), new File(['x'], 'stamp.png', { type: 'image/png' }));
    expect(await screen.findByText('stamp.png')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(writes(f, '/tenant/company/images/stamp')).toHaveLength(1));
    expect((writes(f, '/images/stamp')[0]![1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(await screen.findByText('Stamp saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('stamp.png')).toBeNull());
  });
  it('a refused upload keeps the file and shows why; Cancel drops it', async () => {
    mockPageApi(['company.read', 'company.manage'], (url, init) => (init.method === 'POST' || init.method === 'PUT' ? problem(422, 'File failed the malware scan') : REVEALED));
    renderPage(<CompanySettings />);
    await screen.findByText('Acme Pvt Ltd');
    await userEvent.upload(screen.getByLabelText('Replace signature'), new File(['x'], 'sign.png', { type: 'image/png' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }));
    expect((await screen.findByRole('alert')).textContent).toContain('File failed the malware scan');
    expect(screen.getByText('sign.png')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('sign.png')).toBeNull();
  });
  it('removing an image asks first, then deletes it', async () => {
    const f = mockPageApi(['company.read', 'company.manage'], (url, init) => (init.method === 'DELETE' ? { ok: true } : REVEALED));
    renderPage(<CompanySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const dlg = await screen.findByRole('dialog', { name: 'Remove signature' });
    expect(writes(f, '/images/signature')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove signature' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(writes(f, '/tenant/company/images/signature')).toHaveLength(1));
    expect((writes(f, '/images/signature')[0]![1] as RequestInit).method).toBe('DELETE');
    expect(await screen.findByText('Signature removed')).toBeTruthy();
  });
  it('downloads the signature from its URL', async () => {
    const saved = savedFiles();
    const f = mockPageApi(['company.read'], (url) => (url.includes('/images/signature') ? new Response('png', { status: 200, headers: { 'content-type': 'image/png' } }) : REVEALED));
    renderPage(<CompanySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download signature' }));
    await waitFor(() => expect(saved).toEqual(['signature.png']));
    expect(reads(f, '/tenant/company/images/signature')).toHaveLength(1);
  });
});

describe('data rights', () => {
  const RETENTION = { carveOuts: [{ category: 'payroll', label: 'Payroll records', years: 8, basis: 'Income tax rules', setting: 'x' }], auditLog: 'Audit log is kept for 7 years.', notLegalAdvice: 'This is not legal advice.' };
  const REQ = { id: 'q1', subject_type: 'employee', subject_id: 'e1', subject_name: 'Rohan Iyer', status: 'requested', reason: 'Left the company', requested_by_name: 'A', created_at: '2026-10-01T04:30:00Z', retained_until: null };
  const list = (items: unknown[], extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if (url.endsWith('/retention')) return RETENTION;
    if (url.includes('/erasure-requests')) return { items, page: 1, pageSize: 25, total: items.length };
    if (url.includes('/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }], page: 1, pageSize: 20, total: 1 };
    return {};
  };
  it('someone with only settings.read sees what is kept, not the requests or the export', async () => {
    const f = mockPageApi(['settings.read'], list([REQ]));
    renderPage(<DataRights />);
    expect(await screen.findByText('Payroll records')).toBeTruthy();
    expect(screen.getByText('Income tax rules')).toBeTruthy();
    expect(screen.getByText('Audit log is kept for 7 years.')).toBeTruthy();
    expect(screen.getByText('This is not legal advice.')).toBeTruthy();
    expect(screen.queryByText('Erasure requests')).toBeNull();
    expect(screen.queryByText('Export what is held about a person')).toBeNull();
    expect(reads(f, '/erasure-requests')).toHaveLength(0);
  });
  it('without any of the permissions nothing is requested', async () => {
    const f = mockPageApi(['employees.read'], list([]));
    renderPage(<DataRights />);
    await waitFor(() => expect(reads(f, '/auth/me').length).toBeGreaterThan(0));
    expect(reads(f, '/data-rights')).toHaveLength(0);
  });
  it('lists requests with fallbacks for names, reasons and retention', async () => {
    mockPageApi(['data_rights.manage'], list([REQ, { ...REQ, id: 'q2', subject_type: 'candidate', subject_name: null, status: 'completed', reason: null, retained_until: '2034-03-31' }, { ...REQ, id: 'q3', subject_name: null, status: 'rejected' }]));
    renderPage(<DataRights />);
    const table = await screen.findByRole('table', { name: 'Erasure requests' });
    expect(within(table).getByText('Rohan Iyer')).toBeTruthy();
    expect(within(table).getByText('Candidate')).toBeTruthy();
    expect(within(table).getByText('Employee')).toBeTruthy();
    expect(within(table).getByText(/31\/03\/2034|Mar.*2034/)).toBeTruthy();
    expect(within(table).queryByRole('button', { name: 'Carry out' })).toBeNull();
  });
  it('shows an empty list and raises nothing until a person is chosen', async () => {
    const f = mockPageApi(['data_rights.manage'], list([], (url, init) => (init.method === 'POST' ? { id: 'q9' } : undefined)));
    renderPage(<DataRights />);
    expect(await screen.findByText('No erasure requests.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Raise a request' }));
    const dlg = await screen.findByRole('dialog', { name: 'Raise an erasure request' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Raise request' }));
    expect(await within(dlg).findByText('Choose a person')).toBeTruthy();
    expect(writes(f, '/erasure-requests')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Asked in writing');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Raise request' }));
    await waitFor(() => expect(writes(f, '/tenant/data-rights/erasure-requests')).toHaveLength(1));
    expect(bodyOf(writes(f, '/erasure-requests')[0]!)).toEqual({ subjectType: 'employee', subjectId: 'e9', reason: 'Asked in writing' });
    expect(await screen.findByText('Erasure request raised')).toBeTruthy();
  });
  it('a refused request stays open with the reason and the typed text', async () => {
    mockPageApi(['data_rights.manage'], list([], (url, init) => (init.method === 'POST' ? problem(409, 'This person is still employed') : undefined)));
    renderPage(<DataRights />);
    await userEvent.click(await screen.findByRole('button', { name: 'Raise a request' }));
    const dlg = await screen.findByRole('dialog', { name: 'Raise an erasure request' });
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Asked');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Raise request' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('This person is still employed');
    expect((within(dlg).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Asked');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('carrying out needs the word ERASE typed, then posts to the execute URL', async () => {
    const f = mockPageApi(['data_rights.execute'], list([REQ, { ...REQ, id: 'q2', status: 'completed' }], (url, init) => (init.method === 'POST' ? { ok: true } : undefined)));
    renderPage(<DataRights />);
    await screen.findByRole('table', { name: 'Erasure requests' });
    expect(screen.queryByRole('button', { name: 'Raise a request' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Carry out' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Carry out' }));
    const dlg = await screen.findByRole('dialog', { name: 'Carry out erasure' });
    const erase = within(dlg).getByRole('button', { name: 'Erase' }) as HTMLButtonElement;
    expect(erase.disabled).toBe(true);
    await userEvent.type(within(dlg).getByLabelText(/Type ERASE to confirm/), 'ERASE');
    expect(erase.disabled).toBe(false);
    await userEvent.click(erase);
    await waitFor(() => expect(writes(f, '/erasure-requests/q1/execute')).toHaveLength(1));
    expect(await screen.findByText('Erasure carried out')).toBeTruthy();
  });
  it('rejecting a pending request posts to reject; a refusal stays in the dialog', async () => {
    let refuse = true;
    const f = mockPageApi(['data_rights.execute'], list([{ ...REQ, status: 'pending' }], (url, init) => {
      if (init.method !== 'POST') return undefined;
      return refuse ? problem(409, 'You raised this one') : { ok: true };
    }));
    renderPage(<DataRights />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dlg = await screen.findByRole('dialog', { name: 'Reject erasure request' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('You raised this one');
    refuse = false;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, '/erasure-requests/q1/reject')).toHaveLength(2);
    expect(await screen.findByText('Request rejected')).toBeTruthy();
  });
  it('exports what is held about a chosen person', async () => {
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    const saved = savedFiles();
    const f = mockPageApi(['employees.manage'], list([], (url) => (url.includes('/export') ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) : undefined)));
    renderPage(<DataRights />);
    await screen.findByText('Export what is held about a person');
    expect(screen.queryByRole('button', { name: 'Download JSON' })).toBeNull();
    await userEvent.click(screen.getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Rohan Iyer/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }));
    await waitFor(() => expect(saved).toEqual(['personal-data-e9.json']));
    expect(reads(f, '/tenant/data-rights/employees/e9/export')).toHaveLength(1);
  });
});
