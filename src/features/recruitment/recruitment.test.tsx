import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Recruitment } from '../../pages/Recruitment';
import { mockApi, problem, showPage, writes } from './harness.test-util';

const PERMS = ['recruitment.manage', 'recruitment.read', 'recruitment.requisition', 'recruitment.compensation'];
const REQ = { id: 'r1', code: 'REQ-1', version: 1, title: 'Analyst', status: 'approved', filled: 0, positions: 1, employment_type: 'permanent', legal_entity_id: 'l1', branch_id: 'b1', department_id: 'd1', designation: 'Analyst', justification: 'Needed badly', budget_ctc_max: null, hiring_manager_id: null, target_date: null, created_by: 'u1', branch_name: 'HQ', applications: [] };
const ORG = { legalEntities: [{ id: 'l1', name: 'Co' }], branches: [{ id: 'b1', name: 'HQ', legal_entity_id: 'l1' }, { id: 'b2', name: 'Annexe', legal_entity_id: 'l1' }], departments: [{ id: 'd1', name: 'QC' }] };
const OFFER = { id: 'o1', designation: 'Chemist', employment_type: 'permanent', annual_ctc: 500000, joining_date: '2027-01-15', probation_months: 6, status: 'draft', above_budget: false, notes: 'Keep this', employee_id: null, branch_name: 'Annexe' };
const APP = { id: 'a1', stage: 'offer', version: 3, access: 'full', requisition: { id: 'r1', code: 'REQ-1', title: 'Analyst', status: 'approved' }, candidate: { id: 'c1', first_name: 'Kavya', last_name: 'D', current_designation: null, current_company: null, experience_months: 24, qualification: null, has_resume: false }, events: [], interviews: [], offers: [OFFER], allowedMoves: [] };

const base = (url: string) => {
  if (url.endsWith('/org')) return ORG;
  if (url.includes('/requisitions/r1')) return REQ;
  if (url.includes('/applications/a1')) return APP;
  if (url.includes('/requisitions')) return { items: [REQ], page: 1, pageSize: 25, total: 1 };
  return { items: [] };
};

describe('requisition confirmations', () => {
  it('a failed Hold stays open with the reason and the typed comment', async () => {
    mockApi(PERMS, (url, method) => (method === 'POST' && url.endsWith('/hold') ? problem(409, 'Open offers block this') : base(url)));
    showPage(<Recruitment />, '/recruitment?tab=requisitions');
    await userEvent.click(await screen.findByText('Analyst'));
    await userEvent.click(await screen.findByRole('button', { name: 'Hold' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hold requisition' });
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Budget freeze');
    await userEvent.click(within(dlg).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(within(dlg).getByRole('alert').textContent).toContain('Open offers block this'));
    expect(screen.getByRole('dialog', { name: 'Hold requisition' })).toBeTruthy();
    expect(within(dlg).getByLabelText<HTMLTextAreaElement>(/Comment/).value).toBe('Budget freeze');
  });
});

describe('offer edit', () => {
  it('sends the whole offer with PUT, matching the branch by name and keeping what was typed', async () => {
    const f = mockApi(PERMS, (url, method) => (method === 'PUT' ? { ok: true, aboveBudget: true } : base(url)));
    showPage(<Recruitment />, '/recruitment?tab=requisitions&application=a1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit offer' }));
    const form = await screen.findByRole('dialog', { name: 'Edit offer' });
    await waitFor(() => expect(within(form).getByLabelText<HTMLSelectElement>(/Branch/).value).toBe('b2'));
    expect(within(form).getByLabelText<HTMLInputElement>(/Designation/).value).toBe('Chemist');
    await userEvent.clear(within(form).getByLabelText(/Annual CTC/));
    await userEvent.type(within(form).getByLabelText(/Annual CTC/), '650000');
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes(f, '/offers/o1')).toHaveLength(1));
    const [, init] = writes(f, '/offers/o1')[0]!;
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ designation: 'Chemist', legalEntityId: 'l1', branchId: 'b2', departmentId: 'd1', annualCtc: 650000, notes: 'Keep this', probationMonths: 6 });
    await screen.findByText('Draft saved — above the requisition budget');
  });
  it('an offer past draft has no Edit, since the server refuses it', async () => {
    mockApi(PERMS, (url) => (url.includes('/applications/a1') ? { ...APP, offers: [{ ...OFFER, status: 'sent' }] } : base(url)));
    showPage(<Recruitment />, '/recruitment?tab=requisitions&application=a1');
    await screen.findByRole('button', { name: 'Accepted' });
    expect(screen.queryByRole('button', { name: 'Edit offer' })).toBeNull();
  });
  it('without compensation access there is no Edit, since the server refuses it', async () => {
    mockApi(['recruitment.manage'], (url) => base(url));
    showPage(<Recruitment />, '/recruitment?tab=requisitions&application=a1');
    await screen.findByRole('button', { name: 'Submit for approval' });
    expect(screen.queryByRole('button', { name: 'Edit offer' })).toBeNull();
  });
  it('a withdraw asks first and a failure stays open', async () => {
    const f = mockApi(PERMS, (url, method) => (method === 'POST' && url.endsWith('/withdraw') ? problem(409, 'Offer changed') : base(url)));
    showPage(<Recruitment />, '/recruitment?tab=requisitions&application=a1');
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    expect(writes(f, '/withdraw')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw offer' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw offer' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Offer changed');
  });
});

describe('forms', () => {
  it('a failed org load offers a retry instead of loading forever', async () => {
    mockApi(PERMS, (url) => (url.endsWith('/org') ? problem(500, 'Org down') : base(url)));
    showPage(<Recruitment />, '/recruitment?tab=requisitions');
    await userEvent.click(await screen.findByRole('button', { name: 'New requisition' }));
    const form = await screen.findByRole('dialog', { name: 'New job requisition' });
    expect((await within(form).findByRole('alert')).textContent).toContain('Org down');
    expect(within(form).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
