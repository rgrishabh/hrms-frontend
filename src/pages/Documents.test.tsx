import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayLocal } from '../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../test/page';
import { Documents } from './Documents';

configure({ asyncUtilTimeout: 10000 });
afterEach(() => vi.restoreAllMocks());

const category = (over: object = {}) => ({ id: 'k1', code: 'CERT', name: 'Certificates', scope: 'employee', status: 'active', restricted: false, requires_expiry: false, employee_visible: true, employee_upload: true, payroll_related: false, ...over });
const COMPANY = category({ id: 'k2', code: 'HB', name: 'Handbooks', scope: 'company', employee_upload: false });
const doc = (over: object = {}) => ({ id: 'd1', title: 'Degree', file_name: 'degree.pdf', size_bytes: 2048, category_name: 'Certificates', restricted: false, employee_name: 'Asha Rao', expires_on: null, created_at: '2026-10-01T05:00:00Z', uploaded_by_name: 'Meera', status: 'active', ...over });
const paged = (items: object[], over: object = {}) => ({ items, page: 1, pageSize: 25, total: items.length, ...over });
const pdf = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });

type Extra = (url: string, init: RequestInit) => unknown;
const api = (perms: readonly string[], cats: object[] = [], docs: object = paged([]), extra: Extra = () => undefined, employeeId: string | null = 'e1') => mockPageApi(perms, [], (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (init.method !== 'GET') return { ok: true };
  if (url.endsWith('/documents/categories')) return { items: cats };
  return docs;
}, employeeId);
const MANAGER = ['documents.read', 'documents.manage'];

describe('tabs', () => {
  it('an employee has their own and company documents, and asks for their own', async () => {
    const f = api([]);
    renderPage(<Documents />);
    await screen.findByText('No documents');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['My documents', 'Company documents']);
    expect(reads(f, '/api/v1/documents?scope=mine&page=1&pageSize=25')).toHaveLength(1);
  });
  it('a login with no employee record starts at company documents', async () => {
    const f = api([], [], paged([]), undefined, null);
    renderPage(<Documents />);
    await screen.findByText('No documents');
    expect(screen.queryByRole('tab', { name: 'My documents' })).toBeNull();
    expect(reads(f, '/api/v1/documents?scope=company')).toHaveLength(1);
  });
  it('a reader adds All documents; only a manager adds Categories', async () => {
    api(['documents.read']);
    renderPage(<Documents />);
    expect(await screen.findByRole('tab', { name: 'All documents' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Categories' })).toBeNull();
  });
  it('moving tab forgets the page and the expiring filter of the last one', async () => {
    const f = api(MANAGER, [], paged([doc()], { total: 60 }));
    renderPage(<Documents />, '/documents?tab=all');
    await screen.findByText('Degree');
    expect(reads(f, '/api/v1/documents?page=1&pageSize=25').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, '/api/v1/documents?page=2&pageSize=25').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('checkbox', { name: /Expiring within 30 days/ }));
    await waitFor(() => expect(reads(f, '/api/v1/documents?expiringWithinDays=30&page=1').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('tab', { name: 'Company documents' }));
    await waitFor(() => expect(reads(f, '/api/v1/documents?scope=company&page=1').length).toBeGreaterThan(0));
    expect(screen.queryByRole('checkbox', { name: /Expiring within 30 days/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'All documents' }));
    expect((await screen.findByRole('checkbox', { name: /Expiring within 30 days/ }) as HTMLInputElement).checked).toBe(false);
  });
  it('a list that cannot be loaded says why', async () => {
    api([], [], paged([]), (url) => (url.includes('scope=mine') ? problem(500, 'Storage is down') : undefined));
    renderPage(<Documents />);
    expect(await screen.findByText('Storage is down')).toBeTruthy();
  });
});

describe('the table', () => {
  it('shows size, who uploaded, restriction, and a download through the audited route', async () => {
    api([], [], paged([doc({ restricted: true }), doc({ id: 'd2', title: 'Scan', size_bytes: 3 * 1024 * 1024, employee_name: null, uploaded_by_name: null })]));
    renderPage(<Documents />);
    const line = (await screen.findByText('Degree')).closest('tr')!;
    expect(within(line).getByText('degree.pdf · 2 KB')).toBeTruthy();
    expect(within(line).getByText('Restricted')).toBeTruthy();
    expect(within(line).getByText('Asha Rao')).toBeTruthy();
    expect(within(line).getByText(/· Meera$/)).toBeTruthy();
    expect(within(line).getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('/api/v1/documents/d1/download');
    const scan = screen.getByText('Scan').closest('tr')!;
    expect(within(scan).getByText('degree.pdf · 3.0 MB')).toBeTruthy();
    expect(within(scan).getByText('Company')).toBeTruthy();
    expect(within(scan).queryByText('Restricted')).toBeNull();
    expect(within(scan).queryByText(/· /, { selector: 'span' })).toBeNull();
  });
  it('marks expired, soon and distant expiry differently, and none as a dash', async () => {
    const today = todayLocal();
    const dates = { past: addDays(today, -1), soon: addDays(today, 30), later: addDays(today, 31) };
    const iso = (d: string) => d.split('-').reverse().join('/');
    api([], [], paged([doc({ expires_on: dates.past }), doc({ id: 'd2', title: 'Soon', expires_on: dates.soon }), doc({ id: 'd3', title: 'Later', expires_on: dates.later }), doc({ id: 'd4', title: 'Never' })]));
    renderPage(<Documents />);
    expect((await screen.findByText(`Expired ${iso(dates.past)}`)).className).toContain('danger');
    expect(screen.getByText(`Expires ${iso(dates.soon)}`).className).toContain('warn');
    expect(screen.getByText(iso(dates.later)).className).toContain('neutral');
    expect(within(screen.getByText('Never').closest('tr')!).getByText('—')).toBeTruthy();
  });
  it('archiving asks, posts, and a read-only reader is not offered it', async () => {
    const f = api(MANAGER, [], paged([doc(), doc({ id: 'd2', title: 'Gone', status: 'archived' })]));
    renderPage(<Documents />, '/documents?tab=all');
    const gone = (await screen.findByText('Gone')).closest('tr')!;
    expect(within(gone).queryByRole('button', { name: 'Archive' })).toBeNull();
    await userEvent.click(within(screen.getByText('Degree').closest('tr')!).getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', { name: 'Archive document' });
    expect(within(confirm).getByText(/Archive “Degree”\? It stays in storage/)).toBeTruthy();
    expect(writes(f, '/archive')).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Archived')).toBeTruthy();
    expect(writes(f, '/api/v1/documents/d1/archive')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive document' })).toBeNull());
  });
  it('a refused archive stays open with the reason, and Cancel leaves it', async () => {
    api(MANAGER, [], paged([doc()]), (url, init) => (url.endsWith('/archive') && init.method === 'POST' ? problem(409, 'On legal hold') : undefined));
    renderPage(<Documents />, '/documents?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', { name: 'Archive document' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await within(confirm).findByText('On legal hold')).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive document' })).toBeNull());
  });
});

describe('uploading', () => {
  const openUpload = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }));
    return screen.findByRole('dialog', { name: 'Upload document' });
  };
  it('is not offered on own documents when no active category allows it', async () => {
    api([], [category({ employee_upload: false }), category({ id: 'k3', status: 'inactive' })]);
    renderPage(<Documents />);
    await screen.findByText('No documents');
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  });
  it('is not offered on company documents without documents.manage', async () => {
    api([], [category()]);
    renderPage(<Documents />, '/documents?tab=company');
    await screen.findByText('No documents');
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  });
  it('waits for a file; own uploads carry the employee, the title and an expiry date', async () => {
    const f = api([], [category(), category({ id: 'k3', name: 'Medical', restricted: true, requires_expiry: true })]);
    renderPage(<Documents />);
    const form = await openUpload();
    expect((within(form).getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(form).getAllByRole('option').map((o) => o.textContent)).toEqual(['Certificates', 'Medical (restricted)']);
    expect(within(form).getByLabelText(/Expiry date \(optional\)/)).toBeTruthy();
    await userEvent.selectOptions(within(form).getByLabelText(/Category/), 'k3');
    const expiry = within(form).getByLabelText(/Expiry date \(required\)/) as HTMLInputElement;
    expect(expiry.required).toBe(true);
    fireEvent.change(expiry, { target: { value: '2027-03-01' } });
    await userEvent.type(within(form).getByLabelText(/Title/), 'Fitness note');
    await userEvent.upload(within(form).getByLabelText(/^File/), pdf);
    await userEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(writes(f, '/api/v1/documents')).toHaveLength(1));
    const sent = (writes(f, '/api/v1/documents')[0]![1] as RequestInit).body as FormData;
    expect(sent.get('categoryId')).toBe('k3');
    expect(sent.get('title')).toBe('Fitness note');
    expect(sent.get('employeeId')).toBe('e1');
    expect(sent.get('expiresOn')).toBe('2027-03-01');
    expect((sent.get('file') as File).name).toBe('scan.pdf');
    expect(await screen.findByText('Document uploaded')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).toBeNull());
  });
  it('a manager on company documents picks company categories, with no employee and no expiry sent', async () => {
    const f = api(MANAGER, [category(), COMPANY]);
    renderPage(<Documents />, '/documents?tab=company');
    const form = await openUpload();
    expect(within(form).getAllByRole('option').map((o) => o.textContent)).toEqual(['Handbooks, company']);
    await userEvent.type(within(form).getByLabelText(/Title/), 'Handbook');
    await userEvent.upload(within(form).getByLabelText(/^File/), pdf);
    await userEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(writes(f, '/api/v1/documents')).toHaveLength(1));
    const sent = (writes(f, '/api/v1/documents')[0]![1] as RequestInit).body as FormData;
    expect(sent.get('employeeId')).toBeNull();
    expect(sent.get('expiresOn')).toBeNull();
    expect(sent.get('categoryId')).toBe('k2');
  });
  it('with no company category it says to ask HR, and Upload stays held', async () => {
    api(MANAGER, [category()]);
    renderPage(<Documents />, '/documents?tab=company');
    const form = await openUpload();
    expect(within(form).getByText('No document category allows uploads here. Ask HR to set one up.')).toBeTruthy();
    await userEvent.upload(within(form).getByLabelText(/^File/), pdf);
    expect((within(form).getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('a refused upload stays open with the reason and the file; Cancel closes it', async () => {
    api([], [category()], paged([]), (url, init) => (url.endsWith('/api/v1/documents') && init.method === 'POST' ? problem(422, 'The scanner found malware') : undefined));
    renderPage(<Documents />);
    const form = await openUpload();
    await userEvent.type(within(form).getByLabelText(/Title/), 'Scan');
    await userEvent.upload(within(form).getByLabelText(/^File/), pdf);
    await userEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    expect(await within(form).findByText('The scanner found malware')).toBeTruthy();
    expect(within(form).getByText('scan.pdf')).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).toBeNull());
  });
});

describe('categories', () => {
  const openCategories = () => renderPage(<Documents />, '/documents?tab=categories');
  it('lists the rules of each, in words', async () => {
    const f = api(MANAGER, [category(), category({ id: 'k3', code: 'MED', name: 'Medical', employee_visible: false, employee_upload: false, restricted: true, requires_expiry: true, payroll_related: true }), COMPANY]);
    openCategories();
    const cert = (await screen.findByText('Certificates')).closest('tr')!;
    expect(within(cert).getByText('Visible to employee · employee can upload')).toBeTruthy();
    expect(within(cert).getByText('Employee')).toBeTruthy();
    const med = screen.getByText('Medical').closest('tr')!;
    expect(within(med).getByText('HR only · payroll-related · restricted · expiry required')).toBeTruthy();
    expect(within(screen.getByText('Handbooks').closest('tr')!).getByText('Company')).toBeTruthy();
    expect(reads(f, '/api/v1/documents?')).toHaveLength(0);
  });
  it('none yet suggests some', async () => {
    api(MANAGER);
    openCategories();
    expect(await screen.findByText('No categories yet')).toBeTruthy();
  });
  it('a new one upper-cases its code and posts every rule', async () => {
    const f = api(MANAGER);
    openCategories();
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const form = await screen.findByRole('dialog', { name: 'New category' });
    await userEvent.type(within(form).getByLabelText(/Code/), 'med');
    await userEvent.type(within(form).getByLabelText(/^Name/), 'Medical');
    await userEvent.click(within(form).getByRole('checkbox', { name: /Employee can see their own/ }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /Employee can upload/ }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /Restricted/ }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /Expiry date required/ }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /Payroll-related/ }));
    await userEvent.selectOptions(within(form).getByLabelText(/Status/), 'inactive');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/documents/categories')).toHaveLength(1));
    expect((writes(f, '/documents/categories')[0]![1] as RequestInit).method).toBe('POST');
    expect(bodyOf(writes(f, '/documents/categories')[0]!)).toEqual({ code: 'MED', name: 'Medical', scope: 'employee', employeeVisible: false, employeeUpload: true, restricted: true, requiresExpiry: true, payrollRelated: true, status: 'inactive' });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New category' })).toBeNull());
  });
  it('choosing company scope clears and holds employee upload, and renames visibility', async () => {
    const f = api(MANAGER);
    openCategories();
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const form = await screen.findByRole('dialog', { name: 'New category' });
    await userEvent.type(within(form).getByLabelText(/Code/), 'HB');
    await userEvent.type(within(form).getByLabelText(/^Name/), 'Handbooks');
    await userEvent.click(within(form).getByRole('checkbox', { name: /Employee can upload/ }));
    await userEvent.selectOptions(within(form).getByLabelText(/Scope/), 'company');
    const upload = within(form).getByRole('checkbox', { name: /Employee can upload/ }) as HTMLInputElement;
    expect(upload.checked).toBe(false);
    expect(upload.disabled).toBe(true);
    expect(within(form).getByRole('checkbox', { name: 'Visible to all employees' })).toBeTruthy();
    await userEvent.selectOptions(within(form).getByLabelText(/Scope/), 'employee');
    expect(upload.checked).toBe(false);
    await userEvent.selectOptions(within(form).getByLabelText(/Scope/), 'company');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/documents/categories')).toHaveLength(1));
    expect(bodyOf(writes(f, '/documents/categories')[0]!)).toMatchObject({ scope: 'company', employeeUpload: false });
  });
  it('editing keeps its values, holds the scope and puts without the id in the body', async () => {
    const f = api(MANAGER, [category({ payroll_related: undefined })]);
    openCategories();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit CERT' });
    expect((within(form).getByLabelText(/Scope/) as HTMLSelectElement).disabled).toBe(true);
    await userEvent.clear(within(form).getByLabelText(/^Name/));
    await userEvent.type(within(form).getByLabelText(/^Name/), 'Qualifications');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/documents/categories/k1')).toHaveLength(1));
    expect((writes(f, '/documents/categories/k1')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/documents/categories/k1')[0]!)).toEqual({ code: 'CERT', name: 'Qualifications', scope: 'employee', employeeVisible: true, employeeUpload: true, restricted: false, requiresExpiry: false, payrollRelated: false, status: 'active' });
  });
  it('a refused save stays open with the reason, and Cancel leaves it', async () => {
    api(MANAGER, [], paged([]), (url, init) => (url.endsWith('/documents/categories') && init.method === 'POST' ? problem(409, 'That code is taken') : undefined));
    openCategories();
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const form = await screen.findByRole('dialog', { name: 'New category' });
    await userEvent.type(within(form).getByLabelText(/Code/), 'X');
    await userEvent.type(within(form).getByLabelText(/^Name/), 'Dup');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByText('That code is taken')).toBeTruthy();
    expect((within(form).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Dup');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New category' })).toBeNull());
  });
});
