import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmployeeProfile } from '../../pages/Employees';
import { mockPageApi, renderPage, writes } from '../../test/page';

const EMP = { id: 'e2', view: 'full', version: 3, employee_code: 'E2', first_name: 'Asha', last_name: 'Rao', work_email: null, phone: null, date_of_birth: null, legal_entity_id: 'l1', legal_entity_name: 'Co', branch_id: 'b1', branch_name: 'HQ', department_id: null, department_name: null, designation: null, grade: null, employment_type: 'permanent', status: 'active', reporting_manager_id: null, reporting_manager_name: null, date_of_joining: '2020-01-15', probation_end_date: null, confirmation_date: null, contract_end_date: null, exit_date: null };
const ORG = { legalEntities: [{ id: 'l1', name: 'Co' }], branches: [{ id: 'b1', name: 'HQ', legal_entity_id: 'l1' }], departments: [] };
const handler = (url: string, init: RequestInit) => {
  if (url.endsWith('/org')) return ORG;
  if (url.endsWith('/employees/e2') && (init.method ?? 'GET') === 'GET') return EMP;
  if (url.endsWith('/bank-account/pending')) return { pending: { id: 'c1', accountHolder: 'Asha Rao', accountNumberMasked: 'XXXXXX4321', ifsc: 'SBIN0001234', bankName: null, requestedAt: '2026-11-01T04:00:00Z', requestedBy: 'Kavita Menon' } };
  if (url.endsWith('/bank-account') && init.method === 'PUT') return new Response(JSON.stringify({ ok: true, pending: true, id: 'c1', approvalRequestId: 'a1' }), { status: 202, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/bank-account')) return { accountHolder: 'Asha R', accountNumberMasked: 'XXXXXX1111', ifsc: 'HDFC0001111', bankName: null };
  return { items: [] };
};
const show = () => renderPage(<Routes><Route path="/employees/:id" element={<EmployeeProfile />} /></Routes>, '/employees/e2');

afterEach(() => vi.restoreAllMocks());

describe('bank details need approval', () => {
  it('saving says it was sent for approval, never that it is updated, and shows the pending change', async () => {
    mockPageApi(['employees.read', 'employees.bank.read', 'employees.bank.manage', 'employees.manage'], handler);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Update' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Account holder/ }), 'Asha Rao');
    await userEvent.type(screen.getByRole('textbox', { name: /Account number/ }), '1234567894321');
    await userEvent.type(screen.getByRole('textbox', { name: /IFSC/ }), 'sbin0001234');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(await screen.findByText('Bank change sent for approval')).toBeTruthy();
    expect(screen.queryByText('Bank details updated')).toBeNull();
    expect(await screen.findByText('A change is waiting for approval')).toBeTruthy();
    expect(screen.getByText('XXXXXX4321')).toBeTruthy();
  });
  it('someone cannot propose a change to their own account', async () => {
    mockPageApi(['employees.read', 'employees.bank.read', 'employees.bank.manage'], handler, {}, 'e2');
    show();
    await screen.findByText('Bank details');
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });
});

describe('marking an employee as exited', () => {
  it('asks for the exit date and sends it beside the changes', async () => {
    const f = mockPageApi(['employees.read', 'employees.manage'], handler);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /^Edit/ }));
    expect(screen.queryByLabelText(/Exit date/)).toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'exited');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect((screen.getByLabelText(/Exit date/) as HTMLInputElement).getAttribute('aria-invalid')).toBe('true'));
    expect(writes(f, '/employees/e2')).toHaveLength(0);
    await userEvent.type(screen.getByLabelText(/Exit date/), '2026-11-30');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/employees/e2')).toHaveLength(1));
    const body = JSON.parse(String((writes(f, '/employees/e2')[0]![1] as RequestInit).body)) as { exitDate: string; changes: { status: string } };
    expect(body.exitDate).toBe('2026-11-30');
    expect(body.changes.status).toBe('exited');
  });
});
