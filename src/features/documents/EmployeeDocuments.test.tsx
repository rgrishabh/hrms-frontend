import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { EmployeeDocuments } from './EmployeeDocuments';

afterEach(() => vi.restoreAllMocks());

const category = (over: object = {}) => ({ id: 'k1', code: 'CERT', name: 'Certificates', scope: 'employee', status: 'active', restricted: false, requires_expiry: false, employee_visible: true, employee_upload: true, ...over });
const doc = (over: object = {}) => ({ id: 'd1', title: 'Degree', file_name: 'degree.pdf', size_bytes: 2048, category_name: 'Certificates', restricted: false, employee_name: 'Asha Rao', expires_on: null, created_at: '2026-10-01T05:00:00Z', uploaded_by_name: 'Asha Rao', status: 'active', ...over });
type Extra = (url: string, init: RequestInit) => unknown;
const api = (perms: readonly string[], cats: object[], docs: object[], extra: Extra = () => undefined) => mockPageApi(perms, (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (init.method !== 'GET') return { ok: true };
  if (url.endsWith('/documents/categories')) return { items: cats };
  return { items: docs };
});
const file = new File(['%PDF'], 'degree.pdf', { type: 'application/pdf' });

describe('documents on a profile', () => {
  it('asks for this person only, and shows their documents', async () => {
    const f = api([], [], [doc()]);
    renderPage(<EmployeeDocuments employeeId="e9" />);
    expect(await screen.findByText('Degree')).toBeTruthy();
    expect(reads(f, '/api/v1/documents?employeeId=e9&pageSize=100')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
  it('a person uploads to their own record only where the category allows it', async () => {
    const f = api([], [category(), category({ id: 'k2', name: 'HR notes', employee_upload: false }), category({ id: 'k3', name: 'Handbooks', scope: 'company' }), category({ id: 'k4', name: 'Old', status: 'inactive' })], []);
    renderPage(<EmployeeDocuments employeeId="e1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }));
    const form = await screen.findByRole('dialog', { name: 'Upload document' });
    expect(within(form).getAllByRole('option').map((o) => o.textContent)).toEqual(['Certificates']);
    await userEvent.type(within(form).getByLabelText(/Title/), 'Degree');
    await userEvent.upload(within(form).getByLabelText(/^File/), file);
    await userEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(writes(f, '/api/v1/documents')).toHaveLength(1));
    const sent = (writes(f, '/api/v1/documents')[0]![1] as RequestInit).body as FormData;
    expect(sent.get('employeeId')).toBe('e1');
    expect(sent.get('categoryId')).toBe('k1');
    expect(await screen.findByText('Document uploaded')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).toBeNull());
  });
  it("looking at someone else's record offers no upload without documents.manage", async () => {
    api([], [category()], []);
    renderPage(<EmployeeDocuments employeeId="e9" />);
    await screen.findByText('No documents');
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  });
  it('a manager uploads to anyone, also where employees may not', async () => {
    api(['documents.manage'], [category({ employee_upload: false })], []);
    renderPage(<EmployeeDocuments employeeId="e9" />);
    expect(await screen.findByRole('button', { name: 'Upload' })).toBeTruthy();
  });
  it('a manager archives after asking, and a refusal stays open with the reason', async () => {
    let refuse = true;
    const f = api(['documents.manage'], [], [doc(), doc({ id: 'd2', title: 'Old degree', status: 'archived' })], (url, init) => {
      if (url.endsWith('/archive') && init.method === 'POST') return refuse ? problem(409, 'Held for an audit') : { ok: true };
      return undefined;
    });
    renderPage(<EmployeeDocuments employeeId="e9" />);
    await screen.findByText('Old degree');
    expect(within(screen.getByText('Old degree').closest('tr')!).queryByRole('button', { name: 'Archive' })).toBeNull();
    await userEvent.click(within(screen.getByText('Degree').closest('tr')!).getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', { name: 'Archive document' });
    expect(within(confirm).getByText('Archive “Degree”?')).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await within(confirm).findByText('Held for an audit')).toBeTruthy();
    refuse = false;
    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Archived')).toBeTruthy();
    expect(writes(f, '/api/v1/documents/d1/archive')).toHaveLength(2);
    expect(bodyOf(writes(f, '/api/v1/documents/d1/archive')[1]!)).toEqual({});
  });
  it('documents someone may not see say so, rather than reading as none', async () => {
    api([], [], [], (url) => (url.includes('employeeId=e9') ? problem(403, 'Forbidden') : undefined));
    renderPage(<EmployeeDocuments employeeId="e9" />);
    expect(await screen.findByText('You do not have access to this')).toBeTruthy();
  });
});
