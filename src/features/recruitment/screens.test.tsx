import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Recruitment } from '../../pages/Recruitment';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';


const MANAGE = ['recruitment.manage', 'recruitment.read', 'recruitment.requisition', 'recruitment.compensation', 'employees.manage'];
const ORG = { legalEntities: [{ id: 'l1', name: 'Acme Labs' }, { id: 'l2', name: 'Acme Trading' }], branches: [{ id: 'b1', name: 'Pune', legal_entity_id: 'l1' }, { id: 'b2', name: 'Delhi', legal_entity_id: 'l2' }], departments: [{ id: 'd1', name: 'Quality' }] };
const ROW = { id: 'r1', code: 'REQ-1', title: 'Analyst', designation: 'Sr Analyst', employment_type: 'permanent', branch_name: 'Pune', department_name: 'Quality', hiring_manager_name: 'Meera Rao', filled: 1, positions: 3, pipeline: { applied: 2, offer: 1 }, status: 'approved' };
const REQ = { ...ROW, version: 4, legal_entity_id: 'l1', legal_entity_name: 'Acme Labs', branch_id: 'b1', department_id: 'd1', justification: 'New scope in Pune', budget_ctc_max: 900000, hiring_manager_id: 'e7', target_date: '2027-02-01', created_by: 'u1', created_by_name: 'A', applications: [{ id: 'a1', first_name: 'Kavya', last_name: 'Das', current_company: 'Zen', experience_months: 30, source: 'referral', avg_rating: 4.5, stage: 'interview' }, { id: 'a2', first_name: 'Ravi', last_name: null, current_company: null, experience_months: null, source: 'carrier_pigeon', avg_rating: null, stage: 'applied' }] };
const CAND_ROW = { id: 'c1', first_name: 'Kavya', last_name: 'Das', email: 'kavya@x.test', phone: '98765', current_designation: 'Chemist', current_company: 'Zen', experience_months: 24, source: 'agency', applications: 2, retain_until: '2028-01-01', employee_id: 'e5' };
const CAND = { ...CAND_ROW, location: 'Pune', notice_days: 30, qualification: 'M.Sc.', referred_by_name: 'Meera Rao', expected_ctc: null, masked: true, maskedFields: ['expected_ctc'], consent_at: '2026-01-01T10:00:00Z', consent_note: 'Careers page', has_resume: true, status: 'active', applications: [{ id: 'a1', requisition_code: 'REQ-1', title: 'Analyst', stage: 'offer', updated_at: '2026-03-01T10:00:00Z' }] };
const OFFER = { id: 'o1', designation: 'Chemist', employment_type: 'permanent', annual_ctc: 500000, joining_date: '2027-01-15', probation_months: 6, status: 'draft', above_budget: false, notes: null, employee_id: null, branch_name: 'Pune', legal_entity_id: 'l1', branch_id: 'b1', department_id: 'd1', contract_end_date: null };
const IV = { id: 'i1', round: 1, kind: 'technical', status: 'scheduled', scheduled_at: '2027-01-10T05:00:00Z', location: 'Room 4', panel: [{ user_id: 'u1', name: 'A', submitted_at: null, rating: null, recommendation: null, notes: null }, { user_id: 'u2', name: 'Meera Rao', submitted_at: '2027-01-10T06:00:00Z', hidden: true, rating: null, recommendation: null, notes: null }, { user_id: 'u3', name: 'Anil Shah', submitted_at: '2027-01-10T06:00:00Z', rating: 4, recommendation: 'yes', notes: 'Solid on chromatography' }] };
const APP = { id: 'a1', stage: 'interview', version: 3, access: 'full', requisition: { id: 'r1', code: 'REQ-1', title: 'Analyst', status: 'approved' }, candidate: { id: 'c1', first_name: 'Kavya', last_name: 'Das', current_designation: 'Chemist', current_company: 'Zen', experience_months: 24, qualification: 'M.Sc.', has_resume: true }, events: [{ at: '2026-03-01T10:00:00Z', from_stage: null, to_stage: 'applied', actor_name: null, note: null }, { at: '2026-03-02T10:00:00Z', from_stage: 'applied', to_stage: 'interview', actor_name: 'Meera Rao', note: 'Strong CV' }], interviews: [IV], offers: [], allowedMoves: ['offer', 'rejected'] };

const base = (over: { req?: object; cand?: object; app?: object } = {}): Handler => (url, init) => {
  const method = init.method ?? 'GET';
  if (method !== 'GET') return { ok: true, id: 'new1' };
  if (url.endsWith('/org')) return ORG;
  if (url.includes('/panel-users')) return { items: [{ id: 'u5', display_name: 'Nina Roy', designation: 'QC Lead' }, { id: 'u6', display_name: 'Omar Ali', designation: null }] };
  if (url.includes('/interviews/mine')) return { items: [] };
  if (url.includes('/requisitions/r1')) return { ...REQ, ...over.req };
  if (url.includes('/requisitions')) return { items: [ROW], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/candidates/c1')) return { ...CAND, ...over.cand };
  if (url.includes('/candidates')) return { items: [CAND_ROW], page: 1, pageSize: 25, total: 1 };
  if (url.includes('/applications/a1')) return { ...APP, ...over.app };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e7', first_name: 'Meera', last_name: 'Rao', employee_code: 'E7' }] };
  return { items: [] };
};
const REQ_ROUTE = '/recruitment?tab=requisitions';
const CAND_ROUTE = '/recruitment?tab=candidates';
const APP_ROUTE = '/recruitment?tab=requisitions&application=a1';
const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name });
const fill = (el: HTMLElement, value: string) => { fireEvent.change(el, { target: { value } }); };
const lastBody = (f: Mock, part: string) => bodyOf(writes(f, part).at(-1)!);

afterEach(() => { vi.restoreAllMocks(); });

describe('requisitions list', () => {
  it('shows the row with its pipeline and filters by status', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, REQ_ROUTE);
    expect(await screen.findByRole('button', { name: 'Analyst' })).toBeTruthy();
    expect(screen.getByText('Applied 2 · Offer 1')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('Pune · Quality')).toBeTruthy();
    expect(screen.getByText('Meera Rao')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'on_hold');
    await waitFor(() => expect(reads(f, '/recruitment/requisitions?status=on_hold')).not.toHaveLength(0));
  });
  it('explains an empty list differently once filtered', async () => {
    mockPageApi(MANAGE, [], (url) => (url.includes('/requisitions') ? { items: [], page: 1, pageSize: 25, total: 0 } : { items: [] }));
    showPage(<Recruitment />, REQ_ROUTE);
    expect(await screen.findByText('Raise one to start hiring for a position.')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'closed');
    expect(await screen.findByText('Try another status.')).toBeTruthy();
  });
  it('someone who can only read has no New requisition button', async () => {
    mockPageApi(['recruitment.read'], [], base());
    showPage(<Recruitment />, REQ_ROUTE);
    await screen.findByRole('button', { name: 'Analyst' });
    expect(screen.queryByRole('button', { name: 'New requisition' })).toBeNull();
  });
});

describe('requisition form', () => {
  it('creates a draft with converted numbers, nulls for blanks, and opens it', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (init.method === 'POST' && url.endsWith('/requisitions') ? { id: 'r1' } : base()(url, init)));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New requisition' }));
    const dlg = await dialog('New job requisition');
    await userEvent.type(within(dlg).getByLabelText(/Position title/), 'Lab Head');
    await userEvent.selectOptions(await within(dlg).findByLabelText(/Legal entity/), 'l2');
    expect(within(dlg).queryByRole('option', { name: 'Pune' })).toBeNull();
    await userEvent.selectOptions(within(dlg).getByLabelText(/Branch/), 'b2');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Department/), 'd1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Employment type/), 'contract');
    await userEvent.type(within(dlg).getByLabelText(/^Designation/), 'Head');
    fill(within(dlg).getByLabelText(/Positions/), '2');
    fill(within(dlg).getByLabelText(/Target joining by/), '2027-03-01');
    fill(within(dlg).getByLabelText(/Budget per position/), '1200000');
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Hiring manager/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Meera Rao/ }));
    await userEvent.type(within(dlg).getByLabelText(/Justification/), 'Backfill for Ravi');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/recruitment/requisitions')).toHaveLength(1));
    expect(writes(f, '/recruitment/requisitions')[0]![0]).toBe('/api/v1/recruitment/requisitions');
    expect(lastBody(f, '/requisitions')).toEqual({ title: 'Lab Head', legalEntityId: 'l2', branchId: 'b2', departmentId: 'd1', employmentType: 'contract', justification: 'Backfill for Ravi', hiringManagerId: 'e7', positions: 2, designation: 'Head', targetDate: '2027-03-01', budgetCtcMax: 1200000 });
    expect(await screen.findByText('Draft saved')).toBeTruthy();
    expect(await dialog('REQ-1 — Analyst')).toBeTruthy();
  });
  it('without compensation access the budget field is absent and is sent as null', async () => {
    const f = mockPageApi(['recruitment.requisition'], [], (url, init) => (init.method === 'POST' ? { id: 'r1' } : base()(url, init)));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New requisition' }));
    const dlg = await dialog('New job requisition');
    expect(within(dlg).queryByLabelText(/Budget per position/)).toBeNull();
    await userEvent.type(within(dlg).getByLabelText(/Position title/), 'Lab Head');
    await userEvent.selectOptions(await within(dlg).findByLabelText(/Legal entity/), 'l1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Branch/), 'b1');
    await userEvent.type(within(dlg).getByLabelText(/Justification/), 'Backfill');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/requisitions')).toHaveLength(1));
    expect(lastBody(f, '/requisitions')).toMatchObject({ budgetCtcMax: null, designation: null, targetDate: null, departmentId: null, hiringManagerId: null, positions: 1 });
  });
  it('a refused save stays open with the field error on its field', async () => {
    mockPageApi(MANAGE, [], (url, init) => (init.method === 'POST' ? problem(422, 'Invalid', { errors: [{ path: 'title', message: 'Title is taken' }] }) : base()(url, init)));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New requisition' }));
    const dlg = await dialog('New job requisition');
    await userEvent.type(within(dlg).getByLabelText(/Position title/), 'Lab Head');
    await userEvent.selectOptions(await within(dlg).findByLabelText(/Legal entity/), 'l1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Branch/), 'b1');
    await userEvent.type(within(dlg).getByLabelText(/Justification/), 'Backfill');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    expect(await within(dlg).findByText('Title is taken')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'New job requisition' })).toBeTruthy();
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Position title/).value).toBe('Lab Head');
  });
  it('editing a draft prefills it, PUTs with the expected version, and cancelling returns to the detail', async () => {
    const f = mockPageApi(MANAGE, [], base({ req: { status: 'draft' } }));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    let dlg = await dialog('Edit REQ-1');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Position title/).value).toBe('Analyst');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    dlg = await dialog('Edit REQ-1');
    await userEvent.clear(within(dlg).getByLabelText(/Position title/));
    await userEvent.type(within(dlg).getByLabelText(/Position title/), 'Principal Analyst');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/requisitions/r1')).toHaveLength(1));
    expect((writes(f, '/requisitions/r1')[0]![1] as RequestInit).method).toBe('PUT');
    expect(lastBody(f, '/requisitions/r1')).toMatchObject({ title: 'Principal Analyst', expectedVersion: 4, budgetCtcMax: 900000, hiringManagerId: 'e7', targetDate: '2027-02-01', legalEntityId: 'l1', branchId: 'b1' });
  });
});

describe('requisition detail', () => {
  it('shows the facts and lists candidates, whose name opens the application', async () => {
    mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    const dlg = await dialog('REQ-1 — Analyst');
    expect(await within(dlg).findByText('New scope in Pune')).toBeTruthy();
    expect(within(dlg).getByText('Acme Labs')).toBeTruthy();
    expect(within(dlg).getByText('1/3 filled · Permanent')).toBeTruthy();
    expect(within(dlg).getByText('Employee referral')).toBeTruthy();
    expect(within(dlg).getByText('carrier_pigeon')).toBeTruthy();
    expect(within(dlg).getByText('2.5 yrs')).toBeTruthy();
    expect(within(dlg).getByText('4.5')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Kavya Das' }));
    expect(await dialog('Kavya Das — REQ-1')).toBeTruthy();
  });
  it('keeps a masked budget hidden until revealed, and reveal asks with ?reveal=1', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.includes('/requisitions/r1')
      ? (url.includes('reveal=1') ? { ...REQ, budget_ctc_max: 900000 } : { ...REQ, budget_ctc_max: null, masked: true, maskedFields: ['budget_ctc_max'] })
      : base()(url, init)));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    const dlg = await dialog('REQ-1 — Analyst');
    expect(await within(dlg).findByText('Hidden')).toBeTruthy();
    expect(within(dlg).queryByText(/9,00,000/)).toBeNull();
    expect(reads(f, 'reveal=1')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show amount' }));
    expect(await within(dlg).findByText(/9,00,000/)).toBeTruthy();
    expect(reads(f, '/requisitions/r1?reveal=1')).toHaveLength(1);
  });
  it('submits a draft for approval', async () => {
    const f = mockPageApi(MANAGE, [], base({ req: { status: 'draft' } }));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(f, '/requisitions/r1/submit')).toHaveLength(1));
    expect(await screen.findByText('Sent for approval')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull();
  });
  it('someone else\'s draft offers no Edit without manage', async () => {
    mockPageApi(['recruitment.requisition'], [], base({ req: { status: 'draft', created_by: 'u9' } }));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await screen.findByText('New scope in Pune');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel requisition' })).toBeNull();
  });
  it.each([
    ['approved', 'Hold', 'Hold requisition', 'Put on hold', 'hold', 'Requisition on hold'],
    ['on_hold', 'Reopen', 'Reopen requisition', 'Reopen', 'reopen', 'Requisition reopened'],
    ['approved', 'Close requisition', 'Close requisition', 'Close requisition', 'close', 'Requisition closed'],
    ['pending', 'Cancel requisition', 'Cancel requisition', 'Cancel requisition', 'cancel', 'Requisition cancelled'],
  ])('%s: %s needs a reason and posts it', async (status, open, title, label, action, done) => {
    const f = mockPageApi(MANAGE, [], base({ req: { status } }));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: open }));
    const dlg = await dialog(title);
    const confirm = within(dlg).getByRole<HTMLButtonElement>('button', { name: label });
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Budget freeze');
    await userEvent.click(confirm);
    await waitFor(() => expect(writes(f, `/requisitions/r1/${action}`)).toHaveLength(1));
    expect(lastBody(f, `/requisitions/r1/${action}`)).toEqual({ reason: 'Budget freeze' });
    expect(await screen.findByText(done)).toBeTruthy();
  });
  it('a closed requisition has no way to close, hold or cancel, only to reopen', async () => {
    mockPageApi(MANAGE, [], base({ req: { status: 'closed', applications: [] } }));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await screen.findByRole('button', { name: 'Reopen' });
    expect(screen.getByText('No candidates yet.')).toBeTruthy();
    for (const name of ['Hold', 'Close requisition', 'Cancel requisition', 'Add candidate']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});

describe('adding a candidate to a requisition', () => {
  it('searches, adds an existing candidate to the pipeline and closes', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add candidate' }));
    const dlg = await dialog('Add candidate');
    await userEvent.type(within(dlg).getByLabelText('Search existing candidates'), 'kav');
    await waitFor(() => expect(reads(f, '/recruitment/candidates?search=kav')).not.toHaveLength(0));
    expect(await within(dlg).findByText(/kavya@x\.test · 2\.0 yrs/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add Kavya Das' }));
    await waitFor(() => expect(writes(f, '/recruitment/applications')).toHaveLength(1));
    expect(lastBody(f, '/recruitment/applications')).toEqual({ requisitionId: 'r1', candidateId: 'c1' });
    expect(await screen.findByText('Added to the pipeline')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add candidate' })).toBeNull());
  });
  it('a failed add keeps the picker open and says why', async () => {
    mockPageApi(MANAGE, [], (url, init) => (init.method === 'POST' ? problem(409, 'Already in the pipeline') : base()(url, init)));
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add candidate' }));
    const dlg = await dialog('Add candidate');
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Add Kavya Das' }));
    expect(await screen.findByText('Already in the pipeline')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Add candidate' })).toBeTruthy();
  });
  it('a new candidate from here is created and then added', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => {
      if (url.includes('/candidates') && init.method === 'POST') return { id: 'c9' };
      if (url.includes('/candidates')) return { items: [], page: 1, pageSize: 15, total: 0 };
      return base()(url, init);
    });
    showPage(<Recruitment />, REQ_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Analyst' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add candidate' }));
    const dlg = await dialog('Add candidate');
    expect(await within(dlg).findByText('No candidates found')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'New candidate' }));
    const form = await dialog('New candidate');
    await userEvent.type(within(form).getByLabelText(/First name/), 'Sana');
    await userEvent.click(within(form).getByRole('checkbox'));
    await userEvent.type(within(form).getByLabelText(/How consent was obtained/), 'Careers page');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/recruitment/applications')).toHaveLength(1));
    expect(lastBody(f, '/recruitment/applications')).toEqual({ requisitionId: 'r1', candidateId: 'c9' });
  });
});

describe('candidates', () => {
  it('lists contact, role and hired badge and searches on the server', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, CAND_ROUTE);
    expect(await screen.findByRole('button', { name: 'Kavya Das' })).toBeTruthy();
    expect(screen.getByText('Hired')).toBeTruthy();
    expect(screen.getByText('kavya@x.test · 98765')).toBeTruthy();
    expect(screen.getByText('Chemist, Zen')).toBeTruthy();
    expect(screen.getByText('Agency')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search candidates'), 'zen');
    await waitFor(() => expect(reads(f, '/candidates?search=zen')).not.toHaveLength(0));
  });
  it('a row with nothing known shows dashes and an unknown source as given', async () => {
    mockPageApi(MANAGE, [], (url, init) => (url.includes('/candidates') ? { items: [{ ...CAND_ROW, last_name: null, email: null, phone: null, current_designation: null, current_company: null, experience_months: null, source: 'expo', employee_id: null }], page: 1, pageSize: 25, total: 1 } : base()(url, init)));
    showPage(<Recruitment />, CAND_ROUTE);
    expect(await screen.findByRole('button', { name: 'Kavya' })).toBeTruthy();
    expect(screen.getByText('expo')).toBeTruthy();
    expect(screen.queryByText('Hired')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
  it('an empty search says to try something else', async () => {
    mockPageApi(MANAGE, [], (url) => (url.includes('/candidates') ? { items: [], page: 1, pageSize: 25, total: 0 } : { items: [] }));
    showPage(<Recruitment />, CAND_ROUTE);
    await screen.findByText('No candidates');
    await userEvent.type(screen.getByLabelText('Search candidates'), 'nobody');
    expect(await screen.findByText('Try a different search.')).toBeTruthy();
  });
  it('a reader has no New candidate and no Erase', async () => {
    mockPageApi(['recruitment.read'], [], base());
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    await screen.findByText('Careers page', { exact: false });
    expect(screen.queryByRole('button', { name: 'New candidate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erase personal data' })).toBeNull();
  });
  it('a resume is replaced from the detail with a PUT, and saving with no file is refused first', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (init.method === 'PUT' ? { ok: true, resumeName: 'new.pdf' } : base()(url, init)));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das');
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Replace resume' }));
    const upload = await dialog('Replace resume');
    expect(within(upload).getByText(/current resume is deleted/)).toBeTruthy();
    await userEvent.click(within(upload).getByRole('button', { name: 'Save' }));
    expect(await within(upload).findByText('Choose a file.')).toBeTruthy();
    expect(writes(f, '/recruitment/candidates/c1/resume')).toHaveLength(0);
    await userEvent.upload(within(upload).getByLabelText(/Resume/), new File(['%PDF-1.7'], 'new.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(upload).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/recruitment/candidates/c1/resume')).toHaveLength(1));
    const call = writes(f, '/recruitment/candidates/c1/resume')[0]!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(((call[1] as RequestInit).body as FormData).get('resume')).toBeInstanceOf(File);
    expect(await screen.findByText('Resume replaced')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Replace resume' })).toBeNull());
  });
  it('someone who can only read gets no upload button', async () => {
    mockPageApi(['recruitment.read'], [], base());
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das');
    expect(await within(dlg).findByRole('button', { name: 'Download resume' })).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: /(Add|Replace) resume/ })).toBeNull();
  });
  it('a candidate with no resume offers Add instead of Replace', async () => {
    mockPageApi(MANAGE, [], base({ cand: { has_resume: false } }));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das');
    expect(await within(dlg).findByRole('button', { name: 'Add resume' })).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Replace resume' })).toBeNull();
  });
  it('detail hides expected CTC until reveal, which asks with ?reveal=1, and lists the applications', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.includes('/candidates/c1?reveal=1') ? { ...CAND, expected_ctc: 750000, masked: false, maskedFields: [] } : base()(url, init)));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das');
    expect(await within(dlg).findByText('Hidden')).toBeTruthy();
    expect(within(dlg).getByText('kavya@x.test · 98765 · Pune')).toBeTruthy();
    expect(within(dlg).getByText('2.0 yrs · notice 30 days')).toBeTruthy();
    expect(within(dlg).getByText('Agency (Meera Rao)')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Download resume' })).toBeTruthy();
    expect(within(dlg).queryByText(/7,50,000/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show amount' }));
    expect(await within(dlg).findByText(/7,50,000/)).toBeTruthy();
    expect(reads(f, '/candidates/c1?reveal=1')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Analyst' }));
    expect(await dialog('Kavya Das — REQ-1')).toBeTruthy();
  });
  it('a sparse candidate leaves out resume, CTC and applications', async () => {
    mockPageApi(MANAGE, [], base({ cand: { email: null, phone: null, location: null, current_designation: null, current_company: null, notice_days: null, referred_by_name: null, expected_ctc: null, masked: false, maskedFields: [], has_resume: false, status: 'anonymized', applications: [], consent_note: null } }));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das');
    expect(await within(dlg).findByText(/notice — days/)).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Download resume' })).toBeNull();
    expect(within(dlg).queryByText('Expected CTC')).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Erase personal data' })).toBeNull();
    expect(within(dlg).queryByRole('table', { name: 'Applications' })).toBeNull();
  });
  it('erasing asks for a reason, posts it and closes; a refusal stays open', async () => {
    let refuse = true;
    const f = mockPageApi(MANAGE, [], (url, init) => {
      if (url.endsWith('/anonymize')) { if (refuse) { refuse = false; return problem(409, 'Candidate has a live offer'); } return { ok: true }; }
      return base()(url, init);
    });
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Kavya Das' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Erase personal data' }));
    const dlg = await dialog('Erase candidate data');
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Asked by candidate');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Erase' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Candidate has a live offer');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Erase' }));
    expect(await screen.findByText('Personal data erased')).toBeTruthy();
    expect(lastBody(f, '/candidates/c1/anonymize')).toEqual({ reason: 'Asked by candidate' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kavya Das' })).toBeNull());
  });
  it('the form refuses without consent, sends every field as multipart, and opens the new candidate', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/candidates') && init.method === 'POST' ? { id: 'c1' } : base()(url, init)));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New candidate' }));
    const dlg = await dialog('New candidate');
    const values: [RegExp, string][] = [[/First name/, 'Sana'], [/Last name/, 'Iyer'], [/^Email/, 'sana@x.test'], [/^Phone/, '91234'], [/Qualification/, 'B.Sc.'], [/Current company/, 'Zen'], [/Current designation/, 'Chemist'], [/Location/, 'Pune'], [/How consent/, 'Careers page']];
    for (const [label, value] of values) await userEvent.type(within(dlg).getByLabelText(label), value);
    fill(within(dlg).getByLabelText(/Experience/), '12');
    fill(within(dlg).getByLabelText(/Notice period/), '30');
    fill(within(dlg).getByLabelText(/Expected CTC/), '600000');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Source/), 'campus');
    await userEvent.upload(within(dlg).getByLabelText(/Resume/), new File(['cv'], 'cv.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Confirm that the candidate agreed before saving.')).toBeTruthy();
    expect(writes(f, '/recruitment/candidates')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('checkbox'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/recruitment/candidates')).toHaveLength(1));
    const sent = (writes(f, '/recruitment/candidates')[0]![1] as RequestInit).body as FormData;
    expect(Object.fromEntries([...sent.entries()].filter(([k]) => k !== 'resume'))).toEqual({ firstName: 'Sana', lastName: 'Iyer', email: 'sana@x.test', phone: '91234', source: 'campus', currentCompany: 'Zen', currentDesignation: 'Chemist', experienceMonths: '12', noticeDays: '30', expectedCtc: '600000', location: 'Pune', qualification: 'B.Sc.', consentNote: 'Careers page', consent: 'true', confirmDuplicate: 'false' });
    expect((sent.get('resume') as File).name).toBe('cv.pdf');
    expect(await screen.findByText('Candidate added')).toBeTruthy();
    expect(await dialog('Kavya Das')).toBeTruthy();
  });
  it('a duplicate warns by name, and only the explicit button resends with confirmDuplicate', async () => {
    let seen = 0;
    const f = mockPageApi(MANAGE, [], (url, init) => {
      if (url.endsWith('/candidates') && init.method === 'POST') { seen += 1; return seen === 1 ? problem(409, 'Possible duplicate', { duplicates: [{ name: 'Sana I' }, { name: 'Sana Iyer' }] }) : { id: 'c1' }; }
      return base()(url, init);
    });
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New candidate' }));
    const dlg = await dialog('New candidate');
    await userEvent.type(within(dlg).getByLabelText(/First name/), 'Sana');
    await userEvent.click(within(dlg).getByRole('checkbox'));
    await userEvent.type(within(dlg).getByLabelText(/How consent/), 'Careers page');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText(/Possible duplicate: Sana I, Sana Iyer/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: "It's a different person, save" }));
    await waitFor(() => expect(writes(f, '/recruitment/candidates')).toHaveLength(2));
    expect(((writes(f, '/recruitment/candidates')[0]![1] as RequestInit).body as FormData).get('confirmDuplicate')).toBe('false');
    expect(((writes(f, '/recruitment/candidates')[1]![1] as RequestInit).body as FormData).get('confirmDuplicate')).toBe('true');
  });
  it('another failure stays in the form with the reason', async () => {
    mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/candidates') && init.method === 'POST' ? problem(415, 'Resume type not allowed') : base()(url, init)));
    showPage(<Recruitment />, CAND_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New candidate' }));
    const dlg = await dialog('New candidate');
    await userEvent.type(within(dlg).getByLabelText(/First name/), 'Sana');
    await userEvent.click(within(dlg).getByRole('checkbox'));
    await userEvent.type(within(dlg).getByLabelText(/How consent/), 'Careers page');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Resume type not allowed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New candidate' })).toBeNull());
  });
});

describe('my interviews', () => {
  const mine = (over = {}) => ({ id: 'i1', application_id: 'a1', round: 2, kind: 'technical', scheduled_at: '2020-01-10T05:00:00Z', location: null, submitted_at: null, first_name: 'Kavya', last_name: 'Das', requisition_title: 'Analyst', requisition_code: 'REQ-1', ...over });
  it('marks each interview by state and opens the application', async () => {
    mockPageApi(['recruitment.read'], [], (url, init) => (url.includes('/interviews/mine')
      ? { items: [mine(), mine({ id: 'i2', first_name: 'Ravi', last_name: null, scheduled_at: '2999-01-01T05:00:00Z', location: 'Room 4', kind: 'expo' }), mine({ id: 'i3', first_name: 'Sana', last_name: null, submitted_at: '2020-01-11T05:00:00Z' })] }
      : base()(url, init)));
    showPage(<Recruitment />, '/recruitment?tab=interviews');
    expect(await screen.findByRole('button', { name: 'Ravi' })).toBeTruthy();
    expect(screen.getByText('Due')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Submitted')).toBeTruthy();
    expect(screen.getByText('Room 4')).toBeTruthy();
    expect(screen.getByText('2 · expo')).toBeTruthy();
    expect(screen.getAllByText('2 · Technical')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Kavya Das' }));
    const dlg = await dialog('Kavya Das — REQ-1');
    await userEvent.click(within(dlg).getAllByRole('button', { name: /Close/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kavya Das — REQ-1' })).toBeNull());
  });
  it('says so when the person sits on no panel, and they see only this tab', async () => {
    mockPageApi([], [], base());
    showPage(<Recruitment />, '/recruitment');
    expect(await screen.findByText('You are not on any interview panel')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('application', () => {
  it('shows interviews with pending, hidden and visible feedback, and the history', async () => {
    mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    const dlg = await dialog('Kavya Das — REQ-1');
    expect(await within(dlg).findByText(/Round 1 · Technical/)).toBeTruthy();
    expect(within(dlg).getByText('pending')).toBeTruthy();
    expect(within(dlg).getByText('submitted (hidden until you submit yours)')).toBeTruthy();
    expect(within(dlg).getByText(/4 of 5 · Yes/)).toBeTruthy();
    expect(within(dlg).getByText('Solid on chromatography')).toBeTruthy();
    expect(within(dlg).getByText(/Room 4/)).toBeTruthy();
    expect(within(dlg).getByText(/Interview · Meera Rao: Strong CV/)).toBeTruthy();
    expect(within(dlg).getByText(/Applied · System/)).toBeTruthy();
    expect(within(dlg).getByText('Chemist · Zen · 2.0 yrs · M.Sc.')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(within(dlg).getByText('No offer yet.')).toBeTruthy();
  });
  it('a panel member sees no offers and no management actions', async () => {
    mockPageApi(['recruitment.read'], [], base({ app: { access: 'panel', interviews: [] } }));
    showPage(<Recruitment />, APP_ROUTE);
    const dlg = await dialog('Kavya Das — REQ-1');
    expect(await within(dlg).findByText('No interviews yet.')).toBeTruthy();
    expect(within(dlg).queryByRole('region', { name: 'Offer' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Schedule interview' })).toBeNull();
  });
  it('moves on with an optional note, sending the expected version', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: '→ Offer' }));
    const dlg = await dialog('Move to Offer');
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Good panel');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(writes(f, '/applications/a1/move')).toHaveLength(1));
    expect(lastBody(f, '/applications/a1/move')).toEqual({ stage: 'offer', expectedVersion: 3, note: 'Good panel' });
    expect(await screen.findByText('Moved to Offer')).toBeTruthy();
  });
  it('a move with no note sends null', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: '→ Offer' }));
    await userEvent.click(within(await dialog('Move to Offer')).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(writes(f, '/applications/a1/move')).toHaveLength(1));
    expect(lastBody(f, '/applications/a1/move')).toMatchObject({ note: null });
  });
  it('a rejection requires a reason, which is sent as reason', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: '→ Rejected' }));
    const dlg = await dialog('Move to Rejected');
    expect(within(dlg).getByRole<HTMLButtonElement>('button', { name: 'Move' }).disabled).toBe(true);
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'No GMP experience');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(writes(f, '/applications/a1/move')).toHaveLength(1));
    expect(lastBody(f, '/applications/a1/move')).toEqual({ stage: 'rejected', expectedVersion: 3, reason: 'No GMP experience' });
  });
  it('cancels an interview after asking', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel interview' }));
    const dlg = await dialog('Cancel interview');
    expect(within(dlg).getByText(/Cancel round 1/)).toBeTruthy();
    expect(writes(f, '/interviews/i1/cancel')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel interview' }));
    await waitFor(() => expect(writes(f, '/interviews/i1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Interview cancelled')).toBeTruthy();
  });
  it('schedules with a panel: refuses an empty panel, sends the ISO time and the chosen people', async () => {
    const f = mockPageApi(MANAGE, [], base());
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Schedule interview' }));
    const dlg = await dialog('Schedule interview');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Round/).value).toBe('2');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Kind/), 'hr');
    fill(within(dlg).getByLabelText(/Date and time/), '2027-01-20T10:30');
    fill(within(dlg).getByLabelText(/Duration/), '60');
    fill(within(dlg).getByLabelText(/Round/), '3');
    await userEvent.type(within(dlg).getByLabelText(/Room or meeting link/), 'Room 7');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Schedule' }));
    expect(await within(dlg).findByText('Add at least one person to the panel.')).toBeTruthy();
    expect(writes(f, '/interviews')).toHaveLength(0);
    await userEvent.click(await within(dlg).findByRole('button', { name: '+ Nina Roy · QC Lead' }));
    await userEvent.click(within(dlg).getByRole('button', { name: '+ Omar Ali' }));
    expect(within(dlg).queryByRole('button', { name: '+ Nina Roy · QC Lead' })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove Omar Ali' }));
    await userEvent.type(within(dlg).getByPlaceholderText('Search people'), 'ni{Enter}');
    await waitFor(() => expect(reads(f, '/panel-users?search=ni')).not.toHaveLength(0));
    expect(writes(f, '/applications/a1/interviews')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(writes(f, '/applications/a1/interviews')).toHaveLength(1));
    expect(lastBody(f, '/applications/a1/interviews')).toEqual({ round: 3, kind: 'hr', scheduledAt: new Date('2027-01-20T10:30').toISOString(), durationMin: 60, location: 'Room 7', panelUserIds: ['u5'] });
    expect(await screen.findByText('Interview scheduled; the panel was notified')).toBeTruthy();
  });
  it('feedback needs a rating, and a refusal stays open with the typed notes', async () => {
    let refuse = true;
    const f = mockPageApi(MANAGE, [], (url, init) => {
      if (url.endsWith('/feedback')) { if (refuse) { refuse = false; return problem(409, 'Interview was cancelled'); } return { ok: true }; }
      return base()(url, init);
    });
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Give feedback' }));
    const dlg = await dialog('Feedback — round 1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Recommendation/), 'strong_yes');
    await userEvent.type(within(dlg).getByLabelText(/Notes/), 'Explained HPLC clearly');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect((await within(dlg).findByRole('alert')).textContent).toBe('Choose a rating.');
    expect(writes(f, '/feedback')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: '4 of 5' }));
    expect(within(dlg).getByRole('button', { name: '4 of 5' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dlg).queryByText('Choose a rating.')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Interview was cancelled');
    expect(within(dlg).getByLabelText<HTMLTextAreaElement>(/Notes/).value).toBe('Explained HPLC clearly');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/interviews/i1/feedback')).toHaveLength(2));
    expect(lastBody(f, '/interviews/i1/feedback')).toEqual({ rating: 4, recommendation: 'strong_yes', notes: 'Explained HPLC clearly' });
    expect(await screen.findByText('Feedback submitted')).toBeTruthy();
  });
  it('no feedback button once submitted or when the interview was cancelled', async () => {
    mockPageApi(MANAGE, [], base({ app: { interviews: [{ ...IV, status: 'cancelled' }] } }));
    showPage(<Recruitment />, APP_ROUTE);
    await screen.findByText(/Round 1/);
    expect(screen.queryByRole('button', { name: 'Give feedback' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel interview' })).toBeNull();
  });
});

describe('offers', () => {
  const offerApp = (o: object, app: object = {}) => base({ app: { stage: 'offer', interviews: [], allowedMoves: [], offers: [{ ...OFFER, ...o }], ...app } });
  it('drafts an offer prefilled from the requisition', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/applications/a1/offers') ? { aboveBudget: false } : base({ app: { stage: 'offer', offers: [{ ...OFFER, status: 'rejected' }], interviews: [] } })(url, init)));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Draft offer' }));
    const dlg = await dialog('Draft offer');
    await waitFor(() => expect(within(dlg).getByLabelText<HTMLInputElement>(/^Designation/).value).toBe('Sr Analyst'));
    await waitFor(() => expect(within(dlg).getByLabelText<HTMLSelectElement>(/Branch/).value).toBe('b1'));
    await userEvent.selectOptions(within(dlg).getByLabelText(/Employment type/), 'contract');
    fill(within(dlg).getByLabelText(/Annual CTC/), '700000');
    fill(within(dlg).getByLabelText(/Joining date/), '2099-05-01');
    fill(within(dlg).getByLabelText(/Probation/), '');
    fill(within(dlg).getByLabelText(/Contract end/), '2100-05-01');
    await userEvent.type(within(dlg).getByLabelText(/Notes/), 'Relocation paid');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(writes(f, '/applications/a1/offers')).toHaveLength(1));
    expect(lastBody(f, '/applications/a1/offers')).toEqual({ designation: 'Sr Analyst', legalEntityId: 'l1', branchId: 'b1', departmentId: 'd1', employmentType: 'contract', annualCtc: 700000, joiningDate: '2099-05-01', probationMonths: null, contractEndDate: '2100-05-01', notes: 'Relocation paid' });
    expect(await screen.findByText('Draft saved')).toBeTruthy();
  });
  it('a live offer blocks Draft offer', async () => {
    mockPageApi(MANAGE, [], offerApp({}));
    showPage(<Recruitment />, APP_ROUTE);
    await screen.findByRole('button', { name: 'Edit offer' });
    expect(screen.queryByRole('button', { name: 'Draft offer' })).toBeNull();
  });
  it('editing a rejected offer warns that it goes back to draft', async () => {
    mockPageApi(MANAGE, [], offerApp({ status: 'rejected' }));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit offer' }));
    const dlg = await dialog('Edit offer');
    expect(within(dlg).getByText(/Saving returns it to draft/)).toBeTruthy();
  });
  it('hides a masked CTC until revealed, and reveal asks with ?reveal=1', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.includes('/applications/a1?reveal=1')
      ? offerApp({ annual_ctc: 500000 })(url.replace('?reveal=1', ''), init)
      : offerApp({ annual_ctc: null, masked: true, maskedFields: ['annual_ctc'] })(url, init)));
    showPage(<Recruitment />, APP_ROUTE);
    const dlg = await dialog('Kavya Das — REQ-1');
    expect(await within(dlg).findByText('Hidden')).toBeTruthy();
    expect(within(dlg).queryByText(/5,00,000/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Show amounts' }));
    expect(await within(dlg).findByText(/5,00,000/)).toBeTruthy();
    expect(reads(f, '/applications/a1?reveal=1')).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Hide amounts' }));
    expect(await within(dlg).findByText('Hidden')).toBeTruthy();
  });
  it.each([
    ['draft', 'Submit for approval', 'submit', 'Sent for approval'],
    ['approved', 'Mark sent', 'sent', 'Marked as sent'],
    ['sent', 'Accepted', 'accepted', 'Accepted'],
  ])('%s: %s posts straight away', async (status, button, action, done) => {
    const f = mockPageApi(MANAGE, [], offerApp({ status }));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() => expect(writes(f, `/offers/o1/${action}`)).toHaveLength(1));
    expect(await within(screen.getByRole('status')).findByText(done)).toBeTruthy();
  });
  it('a failed one-press action says why', async () => {
    mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/offers/o1/sent') ? problem(409, 'Approval expired') : offerApp({ status: 'approved' })(url, init)));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark sent' }));
    expect(await screen.findByText('Approval expired')).toBeTruthy();
  });
  it('a decline asks first and records it', async () => {
    const f = mockPageApi(MANAGE, [], offerApp({ status: 'sent' }));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Declined' }));
    const dlg = await dialog('Candidate declined');
    expect(within(dlg).getByText(/declined the offer for Chemist/)).toBeTruthy();
    expect(writes(f, '/offers/o1/declined')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark declined' }));
    await waitFor(() => expect(writes(f, '/offers/o1/declined')).toHaveLength(1));
    expect(await screen.findByText('Declined')).toBeTruthy();
  });
  it('a withdrawal confirmed posts and toasts', async () => {
    const f = mockPageApi(MANAGE, [], offerApp({ status: 'approved' }));
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await userEvent.click(within(await dialog('Withdraw offer')).getByRole('button', { name: 'Withdraw offer' }));
    await waitFor(() => expect(writes(f, '/offers/o1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Offer withdrawn')).toBeTruthy();
  });
  it('an accepted offer hires: employee code and email are sent, and a filled requisition is announced', async () => {
    const f = mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/hire') ? { requisitionClosed: true } : offerApp({ status: 'accepted', above_budget: true, probation_months: null, notes: 'Relocation' })(url, init)));
    showPage(<Recruitment />, APP_ROUTE);
    expect(await screen.findByText('Above budget')).toBeTruthy();
    expect(screen.getByText('Relocation')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hire → create employee' }));
    const dlg = await dialog('Hire — create employee record');
    await userEvent.type(within(dlg).getByLabelText(/Employee code/), 'E100');
    await userEvent.type(within(dlg).getByLabelText(/Work email/), 'k@x.test');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create employee' }));
    await waitFor(() => expect(writes(f, '/offers/o1/hire')).toHaveLength(1));
    expect(lastBody(f, '/offers/o1/hire')).toEqual({ employeeCode: 'E100', workEmail: 'k@x.test' });
    expect(await screen.findByText('Employee created (pre-joining); the requisition is now filled and closed')).toBeTruthy();
  });
  it('a refused hire stays open with the reason, and an optional email is left out', async () => {
    let first = true;
    const f = mockPageApi(MANAGE, [], (url, init) => {
      if (url.endsWith('/hire')) { if (first) { first = false; return problem(409, 'Code already used'); } return {}; }
      return offerApp({ status: 'accepted' })(url, init);
    });
    showPage(<Recruitment />, APP_ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Hire → create employee' }));
    const dlg = await dialog('Hire — create employee record');
    await userEvent.type(within(dlg).getByLabelText(/Employee code/), 'E100');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create employee' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Code already used');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByText('Employee created (pre-joining)')).toBeTruthy();
    expect(lastBody(f, '/offers/o1/hire')).toEqual({ employeeCode: 'E100' });
  });
  it('once hired, the offer links to the employee', async () => {
    mockPageApi(MANAGE, [], offerApp({ status: 'accepted', employee_id: 'e5' }));
    showPage(<Recruitment />, APP_ROUTE);
    expect((await screen.findByRole('link', { name: 'Open employee' })).getAttribute('href')).toBe('/employees/e5');
    expect(screen.queryByRole('button', { name: 'Hire → create employee' })).toBeNull();
  });
  it('accepted without employees.manage offers no hire', async () => {
    mockPageApi(['recruitment.manage'], [], offerApp({ status: 'accepted' }));
    showPage(<Recruitment />, APP_ROUTE);
    await screen.findByText(/joins/);
    expect(screen.queryByRole('button', { name: 'Hire → create employee' })).toBeNull();
  });
});
