import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Competency } from '../../pages/Competency';
import { resetViewport, setViewport } from '../../test/render';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';

configure({ asyncUtilTimeout: 20000 });

const LAB = ['FEATURE_TRAINING', 'FEATURE_LAB_COMPETENCY'];
const TRAINING = ['FEATURE_TRAINING'];
const ALL = ['competency.self', 'competency.read', 'competency.manage', 'competency.assess', 'competency.authorize', 'training.manage'];
const COURSE = { id: 'k1', code: 'SAFE', name: 'Chemical safety', kind: 'safety', description: 'Yearly', validity_months: 12, status: 'active', records: 4 };
const COURSES = [COURSE, { ...COURSE, id: 'k2', code: 'OLD', name: 'Old induction', kind: 'retired_kind', description: null, validity_months: null, status: 'inactive', records: 0 }, { ...COURSE, id: 'k3', code: 'HPLC', name: 'HPLC basics', kind: 'method', description: null, validity_months: 24 }];
const METHOD = { id: 'm1', code: 'M-1', name: 'Assay', standard_ref: 'ISO 17025', discipline: 'Chemical', matrix: 'Water', review_months: 12, status: 'active', requirements: [{ id: 'k1', code: 'SAFE', name: 'Chemical safety' }] };
const METHODS = [METHOD, { ...METHOD, id: 'm2', code: 'M-2', name: 'Retired', standard_ref: null, discipline: null, matrix: null, status: 'inactive', requirements: [] }];
const RECORD = { id: 't1', employee_id: 'e2', employee_code: 'E2', employee_name: 'Ravi Kumar', course_code: 'SAFE', course_name: 'Chemical safety', completed_on: '2026-01-01', expires_on: '2027-01-01', validity: 'expiring', status: 'active', trainer: 'Meera', provider: null };
const ASSESSMENT = { id: 's1', employee_id: 'e2', employee_name: 'Ravi Kumar', employee_code: 'E2', method_code: 'M-1', method_name: 'Assay', activity: 'perform', approach: 'replicate', assessed_on: '2026-02-01', result: 'competent', evidence: 'RSD 0.4%', assessor_name: 'Meera', used: false };
const AUTH_ROW = { id: 'a1', employee_id: 'e2', employee_code: 'E2', employee_name: 'Ravi Kumar', method_code: 'M-1', method_name: 'Assay', activity: 'perform', status: 'authorized', review_due: '2027-01-01', missing_training: 0 };
const AUTH = { id: 'a1', employee_id: 'e2', employee_name: 'Ravi Kumar', method_code: 'M-1', method_name: 'Assay', activity: 'perform', status: 'authorized', review_due: '2027-01-01', requested_by: 'u9', check: { authorized: true, reasons: [], reviewDue: '2027-01-01' }, assessment: { approach: 'replicate', assessed_on: '2026-02-01', result: 'competent', evidence: 'RSD 0.4%', assessor_name: 'Meera' }, events: [{ action: 'authorized', reason: 'Good', at: '2026-02-02T05:00:00Z', actor_name: 'Quality' }, { action: 'review_overdue', reason: null, at: '2026-03-02T05:00:00Z', actor_name: null }] };
const cell = (status: string, inForce: boolean, reviewDue: string | null = null) => ({ status, inForce, reviewDue });
const MATRIX = { methods: [{ id: 'm1', code: 'M-1', name: 'Assay', discipline: 'Chemical', matrix: 'Water' }, { id: 'm2', code: 'M-2', name: 'Titration', discipline: null, matrix: null }], rows: [{ employeeId: 'e2', employeeCode: 'E2', name: 'Ravi Kumar', cells: { m1: { perform: cell('authorized', true, '2027-01-01'), review: cell('pending', false), sampling: cell('authorized', false), authorize_report: cell('suspended', false) } } }] };
const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 25, total: items.length });

const api = (over: { record?: object; assessment?: object; auth?: object; row?: object } = {}): Handler => (url, init) => {
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/competency/courses')) return { items: COURSES };
  if (url.includes('/competency/methods')) return { items: METHODS };
  if (url.includes('/competency/matrix')) return MATRIX;
  if (url.includes('/competency/authorizations/a1')) return { ...AUTH, ...over.auth };
  if (url.includes('/competency/authorizations')) return paged([{ ...AUTH_ROW, ...over.row }]);
  if (url.includes('/competency/assessments')) return paged([{ ...ASSESSMENT, ...over.assessment }]);
  if (url.includes('/competency/training-records')) return paged([{ ...RECORD, ...over.record }]);
  if (url.includes('/competency/me')) return { authorizations: [], training: [] };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e2', first_name: 'Ravi', last_name: 'Kumar', employee_code: 'E2' }] };
  return { items: [] };
};
const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name });
const fill = (el: HTMLElement, value: string) => { fireEvent.change(el, { target: { value } }); };
const lastBody = (f: Mock, part: string) => bodyOf(writes(f, part).at(-1)!);
const pickEmployee = async (dlg: HTMLElement) => {
  await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
  await userEvent.click(await within(dlg).findByRole('option', { name: /Ravi Kumar/ }));
};

afterEach(() => { vi.restoreAllMocks(); resetViewport(); });

describe('page access', () => {
  it('nobody with no access sees an explanation', async () => {
    mockPageApi([], TRAINING, api());
    showPage(<Competency />);
    expect(await screen.findByText('Nothing here for you')).toBeTruthy();
  });
  it('lab names the tabs differently and offers all of them', async () => {
    mockPageApi(ALL, LAB, api());
    showPage(<Competency />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['My competence', 'Competence matrix', 'Authorizations', 'Assessments', 'Training records', 'Courses & methods']);
  });
});

describe('my competence', () => {
  it('lists authorizations and training with expiry in words', async () => {
    mockPageApi(['competency.self'], LAB, (url) => (url.includes('/competency/me') ? {
      authorizations: [{ id: 'a1', method_code: 'M-1', method_name: 'Assay', standard_ref: 'ISO 17025', activity: 'perform', status: 'authorized', valid_from: '2026-01-01', review_due: '2027-01-01' }, { id: 'a2', method_code: 'M-2', method_name: 'Titration', standard_ref: null, activity: 'made_up', status: 'pending', valid_from: null, review_due: null }],
      training: [{ id: 't1', course_code: 'SAFE', course_name: 'Chemical safety', completed_on: '2026-01-01', expires_on: null, result: 'passed', validity: 'valid' }, { id: 't2', course_code: 'FIRE', course_name: 'Fire', completed_on: '2020-01-01', expires_on: '2021-01-01', result: 'passed', validity: 'unknown_state' }],
    } : { items: [] }));
    showPage(<Competency />);
    expect(await screen.findByRole('table', { name: 'My technical authorizations' })).toBeTruthy();
    expect(screen.getByText('ISO 17025')).toBeTruthy();
    expect(screen.getByText('Perform test')).toBeTruthy();
    expect(screen.getByText('made_up')).toBeTruthy();
    expect(screen.getByText('No expiry')).toBeTruthy();
    expect(screen.getByText('01/01/2021')).toBeTruthy();
  });
  it('with nothing recorded, says so', async () => {
    mockPageApi(['competency.self'], LAB, api());
    showPage(<Competency />);
    expect(await screen.findByText('No authorizations yet')).toBeTruthy();
    expect(screen.getByText('No training recorded')).toBeTruthy();
  });
});

describe('matrix', () => {
  it('on a wide screen shows letter marks with the state in hidden text', async () => {
    mockPageApi(ALL, LAB, api());
    showPage(<Competency />, '/competency?tab=matrix');
    expect(await screen.findByRole('table', { name: 'Competence matrix' })).toBeTruthy();
    expect(screen.getByText(/Perform test: in force, review 01\/01\/2027/)).toBeTruthy();
    expect(screen.getByText('Review results: pending')).toBeTruthy();
    expect(screen.getByText('Sampling: not in force')).toBeTruthy();
    expect(screen.getByText('Authorize reports: suspended')).toBeTruthy();
    expect(screen.getByText('P ✓')).toBeTruthy();
    expect(screen.getByText('R …')).toBeTruthy();
    expect(screen.getByText('A !')).toBeTruthy();
    expect(screen.getByText(/S sampling, P perform/)).toBeTruthy();
  });
  it('on a phone lists only the methods the person holds, in words', async () => {
    setViewport(390);
    mockPageApi(ALL, LAB, api());
    showPage(<Competency />, '/competency?tab=matrix');
    expect(await screen.findByText(/Perform test: in force/)).toBeTruthy();
    expect(screen.getByText(/Green is in force/)).toBeTruthy();
    expect(screen.queryByText('Titration')).toBeNull();
    expect(screen.queryByText('P ✓')).toBeNull();
  });
  it('filters by discipline on the server and clears', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, '/competency?tab=matrix');
    await screen.findByRole('table', { name: 'Competence matrix' });
    await userEvent.selectOptions(await screen.findByLabelText('Discipline'), await screen.findByRole('option', { name: 'Chemical' }));
    await waitFor(() => expect(reads(f, '/competency/matrix?discipline=Chemical')).not.toHaveLength(0));
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByLabelText<HTMLSelectElement>('Discipline').value).toBe('');
  });
  it.each([
    [{ methods: [], rows: [] }, 'No active methods', 'Add methods under Courses & methods.'],
    [{ methods: MATRIX.methods, rows: [] }, 'No authorizations yet', null],
  ])('explains an empty matrix', async (data, title, description) => {
    mockPageApi(ALL, LAB, (url, init) => (url.includes('/matrix') ? data : api()(url, init)));
    showPage(<Competency />, '/competency?tab=matrix');
    expect(await screen.findByText(title)).toBeTruthy();
    if (description) expect(screen.getByText(description)).toBeTruthy();
  });
});

describe('authorizations', () => {
  const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Ravi Kumar' })); return dialog('Technical authorization'); };
  const ROUTE = '/competency?tab=authorizations';
  it('defaults to in force on the server, sends no status for All, and shows lapsed training', async () => {
    const f = mockPageApi(ALL, LAB, api({ row: { missing_training: 2 } }));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('2 lapsed')).toBeTruthy();
    expect(reads(f, '/authorizations?status=in_force')).not.toHaveLength(0);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'all');
    await waitFor(() => expect(f.mock.calls.some(([u]) => /\/authorizations\?page=1&pageSize=25$/.test(String(u)))).toBe(true));
  });
  it('an empty result suggests another filter', async () => {
    mockPageApi(ALL, LAB, (url, init) => (url.includes('/authorizations') ? paged([]) : api()(url, init)));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('Nothing to show')).toBeTruthy();
  });
  it('detail shows the check, assessment and history', async () => {
    mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByText('In force today, review due 01/01/2027.')).toBeTruthy();
    expect(within(dlg).getByText(/Replicate \/ CRM analysis, 01\/02\/2026, by Meera/)).toBeTruthy();
    expect(within(dlg).getByText('RSD 0.4%')).toBeTruthy();
    expect(within(dlg).getByText(/authorized · Quality: Good/)).toBeTruthy();
    expect(within(dlg).getByText(/review_overdue · Scheduled review/)).toBeTruthy();
  });
  it('not in force gives the reasons; no assessment and no history are handled', async () => {
    mockPageApi(ALL, LAB, api({ auth: { check: { authorized: false, reasons: ['Training lapsed', 'Review overdue'], reviewDue: null }, assessment: null, events: [] } }));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByText('Not in force: Training lapsed; Review overdue.')).toBeTruthy();
    expect(within(dlg).getByText('Nothing recorded yet.')).toBeTruthy();
    expect(within(dlg).queryByRole('heading', { name: 'Assessment' })).toBeNull();
  });
  it.each([
    ['authorized', 'Suspend', 'Suspend authorization', 'suspend'],
    ['suspended', 'Reinstate', 'Reinstate authorization', 'reinstate'],
    ['suspended', 'Withdraw', 'Withdraw authorization', 'withdraw'],
  ])('%s: %s requires a reason and posts it', async (status, button, title, action) => {
    const f = mockPageApi(ALL, LAB, api({ auth: { status } }));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    await userEvent.click(await within(dlg).findByRole('button', { name: button }));
    const confirm = await dialog(title);
    const ok = within(confirm).getByRole<HTMLButtonElement>('button', { name: button });
    expect(ok.disabled).toBe(true);
    await userEvent.type(within(confirm).getByLabelText(/Comment/), 'Audit finding');
    await userEvent.click(ok);
    await waitFor(() => expect(writes(f, `/authorizations/a1/${action}`)).toHaveLength(1));
    expect(lastBody(f, `/authorizations/a1/${action}`)).toEqual({ reason: 'Audit finding' });
    expect(await screen.findByText('Saved; the employee has been notified')).toBeTruthy();
  });
  it('a refused transition stays open with the reason', async () => {
    mockPageApi(ALL, LAB, (url, init) => (url.endsWith('/suspend') ? problem(409, 'Already suspended') : api()(url, init)));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Suspend' }));
    const confirm = await dialog('Suspend authorization');
    await userEvent.type(within(confirm).getByLabelText(/Comment/), 'Audit finding');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }));
    expect((await within(confirm).findByRole('alert')).textContent).toContain('Already suspended');
  });
  it('a person cannot decide their own authorization', async () => {
    mockPageApi(ALL, LAB, api({ auth: { employee_id: 'e1' } }));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    await within(dlg).findByText('RSD 0.4%');
    expect(within(dlg).queryByRole('button', { name: 'Suspend' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
  it('the requester can cancel a pending request', async () => {
    const f = mockPageApi(ALL, LAB, api({ auth: { status: 'pending', requested_by: 'u1', check: null } }));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Cancel request' }));
    const confirm = await dialog('Cancel authorization request');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(writes(f, '/authorizations/a1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Request cancelled')).toBeTruthy();
  });
  it('someone else cannot cancel a pending request', async () => {
    mockPageApi(ALL, LAB, api({ auth: { status: 'pending', requested_by: 'u9' } }));
    showPage(<Competency />, ROUTE);
    const dlg = await open();
    await within(dlg).findByText('RSD 0.4%');
    expect(within(dlg).queryByRole('button', { name: 'Cancel request' })).toBeNull();
  });
});

describe('assessments', () => {
  const ROUTE = '/competency?tab=assessments';
  it('requests authorization for an unused competent result', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('Competent')).toBeTruthy();
    expect(screen.getByText('Replicate / CRM analysis').getAttribute('title')).toBe('RSD 0.4%');
    await userEvent.click(screen.getByRole('button', { name: 'Request authorization' }));
    await waitFor(() => expect(writes(f, '/competency/authorizations')).toHaveLength(1));
    expect(lastBody(f, '/competency/authorizations')).toEqual({ assessmentId: 's1' });
    expect(await screen.findByText('Sent to quality for authorization')).toBeTruthy();
  });
  it.each([
    ['a used assessment', { used: true }],
    ['a person\'s own assessment', { employee_id: 'e1' }],
    ['a not-yet-competent result', { result: 'not_yet_competent' }],
  ])('%s cannot be requested', async (_what, assessment) => {
    mockPageApi(ALL, LAB, api({ assessment }));
    showPage(<Competency />, ROUTE);
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByRole('button', { name: 'Request authorization' })).toBeNull();
  });
  it('a reader cannot record and methods are not fetched', async () => {
    const f = mockPageApi(['competency.read'], LAB, api());
    showPage(<Competency />, ROUTE);
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByRole('button', { name: 'Record assessment' })).toBeNull();
    expect(reads(f, '/competency/methods')).toHaveLength(0);
  });
  it('recording needs an employee, offers active methods only and posts every field', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record assessment' }).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Record assessment' }));
    const dlg = await dialog('Record competency assessment');
    expect(within(dlg).queryByRole('option', { name: /Retired/ })).toBeNull();
    await userEvent.selectOptions(within(dlg).getByLabelText(/Activity/), 'review');
    await userEvent.selectOptions(within(dlg).getByLabelText(/How competence/), 'witnessed');
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Method/), 'm1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Result/), 'not_yet_competent');
    fill(within(dlg).getByLabelText(/^Date/), '2026-03-01');
    await userEvent.type(within(dlg).getByLabelText(/Evidence/), 'Witnessed run 12');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(writes(f, '/competency/assessments')).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Record competency assessment' })).toBeTruthy();
    await pickEmployee(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/assessments')).toHaveLength(1));
    expect(lastBody(f, '/competency/assessments')).toEqual({ methodId: 'm1', activity: 'review', approach: 'witnessed', assessedOn: '2026-03-01', result: 'not_yet_competent', evidence: 'Witnessed run 12', employeeId: 'e2' });
    expect(await screen.findByText('Assessment recorded')).toBeTruthy();
  });
  it('no active methods disables recording', async () => {
    mockPageApi(ALL, LAB, (url, init) => (url.includes('/methods') ? { items: [] } : api()(url, init)));
    showPage(<Competency />, ROUTE);
    await screen.findByText('Ravi Kumar');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record assessment' }).disabled).toBe(true);
  });
  it('an empty list says so', async () => {
    mockPageApi(ALL, LAB, (url, init) => (url.includes('/assessments') ? paged([]) : api()(url, init)));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('No assessments recorded')).toBeTruthy();
  });
});

describe('training records', () => {
  const ROUTE = '/competency?tab=training';
  it('filters expiring on the server and explains an empty result', async () => {
    const f = mockPageApi(ALL, TRAINING, (url, init) => (url.includes('expiringWithinDays') ? paged([]) : api()(url, init)));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('Expiring')).toBeTruthy();
    expect(screen.getByText('Meera')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: /Expired or expiring/ }));
    expect(await screen.findByText('Nothing expired or expiring soon')).toBeTruthy();
    expect(reads(f, 'expiringWithinDays=30')).not.toHaveLength(0);
  });
  it('falls back to the provider, then a dash, and hides Revoke on a person\'s own or revoked record', async () => {
    mockPageApi(ALL, TRAINING, (url, init) => (url.includes('/training-records') ? paged([{ ...RECORD, trainer: null, provider: 'NSC' }, { ...RECORD, id: 't2', trainer: null, employee_id: 'e1' }, { ...RECORD, id: 't3', trainer: null, status: 'revoked' }]) : api()(url, init)));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('NSC')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
  });
  it('a reader sees no courses fetched and no Record training', async () => {
    const f = mockPageApi(['competency.read'], TRAINING, api());
    showPage(<Competency />, ROUTE);
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByRole('button', { name: 'Record training' })).toBeNull();
    expect(reads(f, '/competency/courses')).toHaveLength(0);
  });
  it('revoking posts the reason', async () => {
    const f = mockPageApi(ALL, TRAINING, api());
    showPage(<Competency />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    const dlg = await dialog('Revoke training record');
    expect(within(dlg).getByText(/Revoke SAFE for Ravi Kumar/)).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/Comment/), 'Wrong person');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Revoke record' }));
    await waitFor(() => expect(writes(f, '/training-records/t1/revoke')).toHaveLength(1));
    expect(lastBody(f, '/training-records/t1/revoke')).toEqual({ reason: 'Wrong person' });
    expect(await screen.findByText('Record revoked')).toBeTruthy();
  });
  it('recording needs an employee, converts hours and announces the expiry', async () => {
    const f = mockPageApi(ALL, TRAINING, (url, init) => (init.method === 'POST' && url.endsWith('/training-records') ? { expiresOn: '2027-03-01' } : api()(url, init)));
    showPage(<Competency />, ROUTE);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record training' }).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Record training' }));
    const dlg = await dialog('Record training');
    expect(within(dlg).queryByRole('option', { name: /OLD/ })).toBeNull();
    await userEvent.selectOptions(within(dlg).getByLabelText(/Course/), 'k3');
    fill(within(dlg).getByLabelText(/Completed on/), '2026-03-01');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Result/), 'completed');
    fill(within(dlg).getByLabelText(/Hours/), '2.5');
    await userEvent.type(within(dlg).getByLabelText(/Trainer/), 'Meera');
    await userEvent.type(within(dlg).getByLabelText(/Provider/), 'NSC');
    await userEvent.type(within(dlg).getByLabelText(/Notes/), 'Batch 4');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(writes(f, '/competency/training-records')).toHaveLength(0);
    await pickEmployee(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/training-records')).toHaveLength(1));
    expect(lastBody(f, '/competency/training-records')).toEqual({ courseId: 'k3', completedOn: '2026-03-01', result: 'completed', trainer: 'Meera', provider: 'NSC', hours: 2.5, notes: 'Batch 4', employeeId: 'e2' });
    expect(await screen.findByText('Recorded; valid until 01/03/2027')).toBeTruthy();
  });
  it('a record with no expiry and no hours; a refusal first stays open', async () => {
    let refuse = true;
    const f = mockPageApi(ALL, TRAINING, (url, init) => {
      if (init.method === 'POST' && url.endsWith('/training-records')) { if (refuse) { refuse = false; return problem(409, 'Already recorded'); } return { expiresOn: null }; }
      return api()(url, init);
    });
    showPage(<Competency />, ROUTE);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record training' }).disabled).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Record training' }));
    const dlg = await dialog('Record training');
    await pickEmployee(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already recorded');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recorded')).toBeTruthy();
    expect(lastBody(f, '/competency/training-records')).toMatchObject({ hours: null });
  });
});

describe('courses and methods', () => {
  const ROUTE = '/competency?tab=setup';
  it('shows each course and method, with fallbacks', async () => {
    mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    const courses = await screen.findByRole('table', { name: 'Training courses' });
    expect(within(courses).getByText('12 months')).toBeTruthy();
    expect(within(courses).getByText('No expiry')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Safety' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Other' })).toBeTruthy();
    const methods = await screen.findByRole('table', { name: 'Laboratory methods' });
    expect(within(methods).getByText('ISO 17025')).toBeTruthy();
    expect(within(methods).getByText('Chemical · Water')).toBeTruthy();
    expect(within(methods).getByText('SAFE')).toBeTruthy();
    expect(within(methods).getByText('Inactive')).toBeTruthy();
  });
  it('without lab, no methods are asked for or shown, and the empty text does not mention the lab', async () => {
    const f = mockPageApi(ALL, TRAINING, (url, init) => (url.includes('/courses') ? { items: [] } : api()(url, init)));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText('For example induction, safety or code of conduct.')).toBeTruthy();
    expect(screen.queryByText('Laboratory methods')).toBeNull();
    expect(reads(f, '/competency/methods')).toHaveLength(0);
  });
  it('with lab, empty lists suggest lab examples and a method', async () => {
    mockPageApi(ALL, LAB, (url) => (url.includes('/courses') || url.includes('/methods') ? { items: [] } : { items: [] }));
    showPage(<Competency />, ROUTE);
    expect(await screen.findByText(/For example lab induction/)).toBeTruthy();
    expect(await screen.findByText('No methods yet')).toBeTruthy();
  });
  it('someone without the manage permissions has no New or Edit', async () => {
    mockPageApi(['competency.manage'], LAB, api());
    showPage(<Competency />, ROUTE);
    await screen.findByRole('table', { name: 'Training courses' });
    await screen.findByRole('table', { name: 'Laboratory methods' });
    expect(screen.queryByRole('button', { name: 'New course' })).toBeNull();
    expect(screen.getByRole('button', { name: 'New method' })).toBeTruthy();
  });
  it('creates a course: code upper-cased, blank validity is null', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New course' }));
    const dlg = await dialog('New training course');
    await userEvent.type(within(dlg).getByLabelText(/Code/), 'gmp-1');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'GMP');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Type/), 'instrument');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Status/), 'inactive');
    await userEvent.type(within(dlg).getByLabelText(/Description/), 'Basics');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/courses')).toHaveLength(1));
    expect(lastBody(f, '/competency/courses')).toEqual({ code: 'GMP-1', name: 'GMP', kind: 'instrument', description: 'Basics', validityMonths: null, status: 'inactive' });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
  it('edits a course with PUT, keeps a retired kind and converts validity', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    await screen.findByRole('table', { name: 'Training courses' });
    await userEvent.click(within(screen.getByRole('table', { name: 'Training courses' })).getAllByRole('button', { name: 'Edit' })[1]!);
    const dlg = await dialog('Edit OLD');
    expect(within(dlg).getByLabelText<HTMLSelectElement>(/Type/).value).toBe('retired_kind');
    expect(within(dlg).getByRole('option', { name: 'Other', selected: true })).toBeTruthy();
    fill(within(dlg).getByLabelText(/Valid for/), '6');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/courses/k2')).toHaveLength(1));
    expect((writes(f, '/competency/courses/k2')[0]![1] as RequestInit).method).toBe('PUT');
    expect(lastBody(f, '/competency/courses/k2')).toEqual({ code: 'OLD', name: 'Old induction', kind: 'retired_kind', description: '', validityMonths: 6, status: 'inactive' });
  });
  it('a refused course stays open with the server\'s field error', async () => {
    mockPageApi(ALL, LAB, (url, init) => (init.method === 'POST' ? problem(422, 'Invalid', { errors: [{ path: 'code', message: 'Code already exists' }] }) : api()(url, init)));
    showPage(<Competency />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New course' }));
    const dlg = await dialog('New training course');
    await userEvent.type(within(dlg).getByLabelText(/Code/), 'SAFE');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Safety');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Code already exists')).toBeTruthy();
    expect(within(dlg).getByLabelText<HTMLInputElement>(/^Name/).value).toBe('Safety');
  });
  it('creates a method with required training from active courses only', async () => {
    const f = mockPageApi(ALL, LAB, api());
    showPage(<Competency />, ROUTE);
    await screen.findByRole('table', { name: 'Training courses' });
    await userEvent.click(await screen.findByRole('button', { name: 'New method' }));
    const dlg = await dialog('New laboratory method');
    await userEvent.type(within(dlg).getByLabelText(/Code/), 'is-3025/1');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'pH');
    await userEvent.type(within(dlg).getByLabelText(/Standard reference/), 'IS 3025');
    await userEvent.type(within(dlg).getByLabelText(/Discipline/), 'Chemical');
    await userEvent.type(within(dlg).getByLabelText(/Matrix/), 'Water');
    fill(within(dlg).getByLabelText(/Review authorizations/), '24');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Status/), 'inactive');
    expect(within(dlg).queryByRole('checkbox', { name: /OLD/ })).toBeNull();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /SAFE/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /HPLC/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /SAFE/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/methods')).toHaveLength(1));
    expect(lastBody(f, '/competency/methods')).toEqual({ code: 'IS-3025/1', name: 'pH', standardRef: 'IS 3025', discipline: 'Chemical', matrix: 'Water', reviewMonths: 24, status: 'inactive', requiredCourseIds: ['k3'] });
  });
  it('edits a method with PUT, keeping a required course even if it is inactive now', async () => {
    const f = mockPageApi(ALL, LAB, (url, init) => (url.includes('/methods') && (init.method ?? 'GET') === 'GET' ? { items: [{ ...METHOD, requirements: [{ id: 'k2', code: 'OLD', name: 'Old induction' }] }] } : api()(url, init)));
    showPage(<Competency />, ROUTE);
    await screen.findByRole('table', { name: 'Training courses' });
    await userEvent.click(within(await screen.findByRole('table', { name: 'Laboratory methods' })).getByRole('button', { name: 'Edit' }));
    const dlg = await dialog('Edit M-1');
    expect(within(dlg).getByRole<HTMLInputElement>('checkbox', { name: /OLD/ }).checked).toBe(true);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/competency/methods/m1')).toHaveLength(1));
    expect((writes(f, '/competency/methods/m1')[0]![1] as RequestInit).method).toBe('PUT');
    expect(lastBody(f, '/competency/methods/m1')).toMatchObject({ code: 'M-1', standardRef: 'ISO 17025', reviewMonths: 12, requiredCourseIds: ['k2'] });
  });
});
