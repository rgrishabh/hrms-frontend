import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../test/page';
import { EmployeeProfile, Employees, parseCsv } from './Employees';

// The default one-second wait is too short when the machine is busy.

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ROW = { id: 'e2', employee_code: 'E2', first_name: 'Asha', last_name: 'Rao', work_email: 'asha@x.test', designation: 'Analyst', department_name: 'Finance', branch_name: 'HQ', date_of_joining: '2020-01-15', status: 'active' };
const ORG = {
  legalEntities: [{ id: 'l1', name: 'Acme' }, { id: 'l2', name: 'Acme Two' }],
  branches: [{ id: 'b1', name: 'HQ', legal_entity_id: 'l1' }, { id: 'b2', name: 'Pune', legal_entity_id: 'l2' }],
  departments: [{ id: 'd1', name: 'Finance' }],
};
const list = (items: unknown[], view = 'full', total = items.length) => ({ items, view, page: 1, pageSize: 25, total });
const api = (rows: unknown, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (url.endsWith('/org')) return ORG;
  return rows;
};
const Opened = () => { const { id } = useParams(); return <p>Record {id}</p>; };
const showList = () => renderPage(<Routes><Route path="/employees" element={<Employees />} /><Route path="/employees/:id" element={<Opened />} /></Routes>, '/employees');

describe('employee list', () => {
  it('an HR reader sees the master with status, branch and joining date', async () => {
    mockPageApi(['employees.read'], api(list([ROW, { ...ROW, id: 'e3', first_name: 'Bo', last_name: null, designation: null, department_name: null, branch_name: undefined, date_of_joining: undefined, status: undefined }])));
    showList();
    const table = within(await screen.findByRole('table', { name: 'Employees' }));
    expect(screen.getByText('Employee master')).toBeTruthy();
    expect(table.getByRole('link', { name: 'Asha Rao' }).getAttribute('href')).toBe('/employees/e2');
    expect(table.getByRole('link', { name: 'Bo' })).toBeTruthy();
    expect(table.getByRole('columnheader', { name: 'Branch' })).toBeTruthy();
    expect(table.getByText('Analyst')).toBeTruthy();
    expect(table.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Add employee' })).toBeNull();
  });
  it('a directory reader sees no status, branch or joining date, and no filters for them', async () => {
    mockPageApi([], api(list([{ id: 'e2', employee_code: 'E2', first_name: 'Asha', last_name: 'Rao', work_email: 'a@x.test', designation: null, department_name: 'Finance' }], 'directory')));
    showList();
    const table = within(await screen.findByRole('table', { name: 'Employees' }));
    expect(screen.getByText('Directory of active colleagues')).toBeTruthy();
    expect(table.queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(table.queryByRole('columnheader', { name: 'Branch' })).toBeNull();
    expect(table.queryByRole('columnheader', { name: 'Joined' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Department' })).toBeTruthy();
  });
  it('filters and search go to the server; an empty result says what to try', async () => {
    const f = mockPageApi(['employees.read'], api(null, (url) => {
      if (url.endsWith('/org')) return undefined;
      return url.includes('search=zzz') || url.includes('status=exited') ? list([]) : list([ROW]);
    }));
    showList();
    await screen.findByRole('table', { name: 'Employees' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), 'b1');
    await waitFor(() => expect(reads(f, 'branchId=b1').length).toBeGreaterThan(0));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Department' }), 'd1');
    await waitFor(() => expect(reads(f, 'departmentId=d1').length).toBeGreaterThan(0));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'exited');
    expect(await screen.findByText('Try a different search or clear the filters.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await screen.findByRole('table', { name: 'Employees' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), ' zzz ');
    expect(await screen.findByText('No employees found')).toBeTruthy();
    expect(reads(f, 'search=zzz').length).toBeGreaterThan(0);
  });
  it('with no employees at all there is no advice about filters', async () => {
    mockPageApi(['employees.read'], api(list([])));
    showList();
    expect(await screen.findByText('No employees found')).toBeTruthy();
    expect(screen.queryByText(/Try a different search/)).toBeNull();
  });
});

describe('adding an employee', () => {
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Add employee' }));
    return screen.findByRole('dialog', { name: 'Add employee' });
  };
  const fill = async (dlg: HTMLElement) => {
    const w = within(dlg);
    await userEvent.type(w.getByLabelText(/Employee code/), 'E9');
    await userEvent.type(w.getByLabelText(/First name/), 'Rohan');
    await userEvent.selectOptions(w.getByLabelText(/^Branch/), 'b1');
    await userEvent.type(w.getByLabelText(/Date of joining/), '2026-11-02');
  };
  it('branches follow the legal entity, and changing it clears the branch', async () => {
    mockPageApi(['employees.read', 'employees.manage'], api(list([])));
    showList();
    const dlg = await open();
    const branch = within(dlg).getByLabelText(/^Branch/) as HTMLSelectElement;
    expect([...branch.options].map((o) => o.text)).toEqual(['Select…', 'HQ']);
    await userEvent.selectOptions(branch, 'b1');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Legal entity/), 'l2');
    expect(branch.value).toBe('');
    expect([...branch.options].map((o) => o.text)).toEqual(['Select…', 'Pune']);
  });
  it('sends every field, null for what is empty, and opens the new record', async () => {
    const f = mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => {
      if (init.method === 'POST') return { id: 'e9' };
      if (url.includes('status=active')) return { items: [{ id: 'm1', first_name: 'Kavita', last_name: 'Menon', employee_code: 'M1' }] };
      return undefined;
    }));
    showList();
    const dlg = await open();
    const w = within(dlg);
    await fill(dlg);
    await userEvent.type(w.getByLabelText(/Last name/), 'Iyer');
    await userEvent.type(w.getByLabelText(/Work email/), 'r@x.test');
    await userEvent.type(w.getByLabelText(/^Phone/), '98200');
    await userEvent.type(w.getByLabelText(/Date of birth/), '1990-01-02');
    await userEvent.selectOptions(w.getByLabelText(/^Department/), 'd1');
    await userEvent.type(w.getByLabelText(/^Designation/), 'Lead');
    await userEvent.type(w.getByLabelText(/^Grade/), 'G2');
    await userEvent.selectOptions(w.getByLabelText(/Employment type/), 'contract');
    await userEvent.selectOptions(w.getByLabelText(/^Status/), 'pre_joining');
    await userEvent.type(w.getByLabelText(/Probation end/), '2027-01-01');
    await userEvent.type(w.getByLabelText(/Confirmation date/), '2027-02-01');
    await userEvent.type(w.getByLabelText(/Contract end/), '2027-03-01');
    await userEvent.click(w.getByRole('combobox', { name: /Reporting manager/ }));
    await userEvent.click(await w.findByRole('option', { name: /Kavita Menon/ }));
    await userEvent.click(w.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/api/v1/employees')).toHaveLength(1));
    expect(bodyOf(writes(f, '/api/v1/employees')[0]!)).toEqual({ confirmDuplicate: false, employee: { employeeCode: 'E9', firstName: 'Rohan', lastName: 'Iyer', workEmail: 'r@x.test', phone: '98200', dateOfBirth: '1990-01-02', legalEntityId: 'l1', branchId: 'b1', departmentId: 'd1', designation: 'Lead', grade: 'G2', employmentType: 'contract', status: 'pre_joining', reportingManagerId: 'm1', dateOfJoining: '2026-11-02', probationEndDate: '2027-01-01', confirmationDate: '2027-02-01', contractEndDate: '2027-03-01' } });
    expect(await screen.findByText('Record e9')).toBeTruthy();
    expect(screen.getByText('Employee created')).toBeTruthy();
  });
  it('a possible duplicate names who it matches, and creating anyway says so', async () => {
    const f = mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => {
      if (init.method !== 'POST') return undefined;
      return bodyOf([url, init])['confirmDuplicate'] ? { id: 'e9' } : problem(409, 'Possible duplicate', { confirmable: true, duplicates: [{ id: 'e2', reason: 'Same email', name: 'Asha Rao', employee_code: 'E2' }] });
    }));
    showList();
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Possible duplicate')).toBeTruthy();
    expect(within(dlg).getByRole('link', { name: 'Asha Rao (E2)' }).getAttribute('href')).toBe('/employees/e2');
    await userEvent.click(within(dlg).getByRole('button', { name: /create anyway/ }));
    await waitFor(() => expect(writes(f, '/api/v1/employees')).toHaveLength(2));
    expect(bodyOf(writes(f, '/api/v1/employees')[1]!)['confirmDuplicate']).toBe(true);
    expect(await screen.findByText('Record e9')).toBeTruthy();
  });
  it('field errors land on their fields, and other refusals appear as the reason', async () => {
    let answer: Response = problem(422, 'Invalid', { errors: [{ field: 'employee.workEmail', message: 'Email is in use' }] });
    mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => (init.method === 'POST' ? answer : undefined)));
    showList();
    const dlg = await open();
    await fill(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Email is in use')).toBeTruthy();
    expect(within(dlg).getByText('Please correct the highlighted fields')).toBeTruthy();
    answer = problem(403, 'You cannot add people to that branch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('You cannot add people to that branch')).toBeTruthy();
    expect(within(dlg).queryByText('Email is in use')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('once lists exist, designation and grade come from active entries only', async () => {
    mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url) => (url.endsWith('/org') ? { ...ORG, designations: [{ id: 'p1', name: 'Lead', status: 'active' }, { id: 'p2', name: 'Retired title', status: 'inactive' }], grades: [{ id: 'g1', name: 'G1', status: 'active' }] } : undefined)));
    showList();
    const dlg = await open();
    const des = within(dlg).getByLabelText(/^Designation/) as HTMLSelectElement;
    expect([...des.options].map((o) => o.text)).toEqual(['None', 'Lead']);
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Grade/), 'G1');
    expect((within(dlg).getByLabelText(/^Grade/) as HTMLSelectElement).value).toBe('G1');
  });
});

describe('bulk import', () => {
  const csv = (text: string) => Object.assign(new File([text], 'people.csv', { type: 'text/csv' }), { text: () => Promise.resolve(text) });
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Bulk import' }));
    return screen.findByRole('dialog', { name: 'Bulk import employees' });
  };
  it('reads the CSV, validates first, shows the report, and blocks import on errors', async () => {
    const f = mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => (init.method === 'POST' ? { committed: false, summary: { total: 2, valid: 1, errors: 1, warnings: 1 }, report: [{ row: 2, employeeCode: 'E9', errors: ['Branch not found'], warnings: ['No manager'] }] } : undefined)));
    showList();
    const dlg = await open();
    const w = within(dlg);
    expect((w.getByRole('button', { name: 'Validate' }) as HTMLButtonElement).disabled).toBe(true);
    expect(w.getByRole('link', { name: 'Download template' }).getAttribute('download')).toBe('employee-import-template.csv');
    await userEvent.upload(w.getByLabelText('CSV file'), csv('employeeCode,firstName\nE9,Rohan\nE10,"Bo, Jr"\n'));
    expect(await w.findByText('2 row(s) read.')).toBeTruthy();
    await userEvent.click(w.getByRole('button', { name: 'Validate' }));
    expect(await w.findByText('1 row(s) have errors. Fix the file and validate again.')).toBeTruthy();
    expect(bodyOf(writes(f, '/employees/import')[0]!)).toEqual({ dryRun: true, rows: [{ employeeCode: 'E9', firstName: 'Rohan' }, { employeeCode: 'E10', firstName: 'Bo, Jr' }] });
    expect(w.getByText('Row 2')).toBeTruthy();
    expect(w.getByText('Branch not found')).toBeTruthy();
    expect(w.getByText('No manager')).toBeTruthy();
    expect((w.getByRole('button', { name: /^Import 1 employees/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('a report row whose code was left blank shows a dash', async () => {
    mockPageApi(['employees.read', 'employees.manage'], api(list([]), (_url, init) => (init.method === 'POST' ? { committed: false, summary: { total: 1, valid: 0, errors: 1, warnings: 0 }, report: [{ row: 1, errors: ['employeeCode: Required'], warnings: [] }] } : undefined)));
    showList();
    const w = within(await open());
    await userEvent.upload(w.getByLabelText('CSV file'), csv('firstName\nRohan\n'));
    await w.findByText('1 row(s) read.');
    await userEvent.click(w.getByRole('button', { name: 'Validate' }));
    const row = (await w.findByText('Row 1')).closest('tr')!;
    expect(within(row).getByText('—')).toBeTruthy();
  });
  it('a clean file can be imported, then the dialog closes with a count', async () => {
    const f = mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => {
      if (init.method !== 'POST') return undefined;
      return bodyOf([url, init])['dryRun'] ? { committed: false, summary: { total: 1, valid: 1, errors: 0, warnings: 1 }, report: [] } : { committed: true, summary: { total: 1, valid: 1, errors: 0, warnings: 0 }, report: [] };
    }));
    showList();
    const dlg = await open();
    const w = within(dlg);
    await userEvent.upload(w.getByLabelText('CSV file'), csv('employeeCode\nE9\n'));
    await w.findByText('1 row(s) read.');
    await userEvent.click(w.getByRole('button', { name: 'Validate' }));
    expect(await w.findByText('All 1 rows are valid (1 with warnings).')).toBeTruthy();
    await userEvent.click(w.getByRole('button', { name: /^Import 1 employees/ }));
    await waitFor(() => expect(writes(f, '/employees/import')).toHaveLength(2));
    expect(bodyOf(writes(f, '/employees/import')[1]!)['dryRun']).toBe(false);
    expect(await screen.findByText('Imported 1 employees')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a file with no rows says so; a refusal shows why; removing the file resets it', async () => {
    mockPageApi(['employees.read', 'employees.manage'], api(list([]), (url, init) => (init.method === 'POST' ? problem(413, 'File too large') : undefined)));
    showList();
    const dlg = await open();
    const w = within(dlg);
    await userEvent.upload(w.getByLabelText('CSV file'), csv('employeeCode\n'));
    expect(await w.findByText('The file has no data rows')).toBeTruthy();
    await userEvent.click(w.getByRole('button', { name: 'Remove people.csv' }));
    await waitFor(() => expect(w.queryByText('The file has no data rows')).toBeNull());
    await userEvent.upload(w.getByLabelText('CSV file'), csv('employeeCode\nE9\n'));
    await w.findByText('1 row(s) read.');
    await userEvent.click(w.getByRole('button', { name: 'Validate' }));
    expect((await w.findByRole('alert')).textContent).toContain('File too large');
    await userEvent.click(w.getAllByRole('button', { name: 'Close' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, CRLF, blank lines and short rows', () => {
    expect(parseCsv('a, b ,c\r\n"1,1","say ""hi""",x\r\n\r\n , ,\n2\n3,4,5')).toEqual([{ a: '1,1', b: 'say "hi"', c: 'x' }, { a: '2', b: '', c: '' }, { a: '3', b: '4', c: '5' }]);
  });
  it('gives nothing for an empty file or a header alone', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\n')).toEqual([]);
  });
});

describe('employee record', () => {
  const EMP = { ...ROW, view: 'full', version: 3, phone: '98200', date_of_birth: '1990-01-02', legal_entity_id: 'l1', legal_entity_name: 'Acme', branch_id: 'b1', department_id: 'd1', grade: 'G2', employment_type: 'on_contract', reporting_manager_id: 'm1', reporting_manager_name: 'Kavita Menon', probation_end_date: null, confirmation_date: null, contract_end_date: null, exit_date: null };
  const BANK = { accountHolder: null, accountNumberMasked: 'XXXXXX4321', ifsc: null, bankName: null, masked: true, maskedFields: ['accountHolder', 'ifsc', 'bankName', 'accountNumber'] };
  const FULL_BANK = { accountHolder: 'Asha Rao', accountNumberMasked: 'XXXXXX4321', accountNumber: '1234567894321', ifsc: 'SBIN0001234', bankName: 'SBI', masked: false, maskedFields: [] };
  const record = (emp: unknown = EMP, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if (url.endsWith('/org')) return ORG;
    if (url.endsWith('/employees/e2')) return emp;
    return { items: [] };
  };
  const show = (route = '/employees/e2') => renderPage(<Routes><Route path="/employees/:id" element={<EmployeeProfile />} /></Routes>, route);
  beforeEach(() => { vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })); });

  it('a full view shows the record, with withheld fields explained and a link to the manager', async () => {
    mockPageApi(['employees.read'], record({ ...EMP, phone: null, date_of_birth: null, masked: true, maskedFields: ['phone', 'date_of_birth'] }));
    show();
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy();
    expect(screen.getByText('On contract')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kavita Menon' }).getAttribute('href')).toBe('/employees/m1');
    expect(screen.getAllByText(/^Hidden\./)).toHaveLength(2);
    expect(screen.queryByText('98200')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Change history' })).toBeTruthy();
  });
  it('a team view shows manager and joining date but nothing private, and no extra tabs', async () => {
    mockPageApi([], record({ ...EMP, view: 'team', phone: undefined, grade: undefined, designation: null, status: undefined }), {}, 'e1');
    show();
    expect(await screen.findByText('No designation')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kavita Menon' })).toBeTruthy();
    expect(screen.queryByText('Legal entity')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Personal details' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Change history' })).toBeNull();
  });
  it('a directory view without a manager or branch is just the basics', async () => {
    mockPageApi([], record({ ...EMP, view: 'directory', branch_name: undefined, reporting_manager_id: null }), {}, 'e1');
    show();
    await screen.findByRole('heading', { name: 'Asha Rao' });
    expect(screen.queryByText('Branch')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Letters and records')).toBeNull();
  });
  const DIRECTORY = { id: 'e2', employee_code: 'E2', first_name: 'Asha', last_name: null, work_email: null, designation: null, department_id: null, department_name: null };
  const printsNothingMissing = () => expect(document.body.textContent).not.toMatch(/undefined|null|NaN|Invalid/);
  it('the limited directory answer shows only what it holds, with dashes for the empty', async () => {
    mockPageApi([], record({ ...DIRECTORY, view: 'directory' }), {}, 'e1');
    show();
    await screen.findByRole('heading', { name: 'Asha' });
    expect(screen.getByText('No designation')).toBeTruthy();
    expect(screen.getByText('Work email').parentElement!.textContent).toBe('Work email—');
    expect(screen.getByText('Department').parentElement!.textContent).toBe('Department—');
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Reporting manager')).toBeNull();
    printsNothingMissing();
  });
  it('the limited team answer shows the manager and joining date, or dashes without them', async () => {
    mockPageApi([], record({ ...DIRECTORY, view: 'team', status: 'active', branch_id: 'b1', branch_name: 'HQ', reporting_manager_id: null, reporting_manager_name: null, date_of_joining: '2020-01-15' }), {}, 'e1');
    show();
    await screen.findByRole('heading', { name: 'Asha' });
    expect(screen.getByText('Reporting manager').parentElement!.textContent).toBe('Reporting manager—');
    expect(screen.getByText('Date of joining').parentElement!.textContent).toBe('Date of joining15/01/2020');
    expect(screen.queryByText('Employment type')).toBeNull();
    printsNothingMissing();
  });
  it('a full answer holding only what the schema requires still opens, with dashes', async () => {
    mockPageApi(['employees.read'], record({ ...DIRECTORY, view: 'full' }), {}, 'e1');
    show();
    await screen.findByRole('heading', { name: 'Asha' });
    expect(screen.getByText('Employment type').parentElement!.textContent).toBe('Employment type—');
    expect(screen.getByText('Phone').parentElement!.textContent).toBe('Phone—');
    printsNothingMissing();
  });
  it('tabs depend on features and permissions, and each loads for this person', async () => {
    const f = mockPageApi(['employees.read', 'attendance.read', 'documents.read'], ['FEATURE_ATTENDANCE', 'FEATURE_DOCUMENTS'], record(EMP, (url) => {
      if (url.endsWith('/profile')) return { missing: [], sections: { contacts: [], addresses: [], nominees: [], education: [], experience: [] }, edit: {}, pending: [] };
      if (url.includes('/attendance')) return { days: [], events: [] };
      return undefined;
    }), 'e1');
    show();
    await userEvent.click(await screen.findByRole('tab', { name: 'Personal details' }));
    await waitFor(() => expect(reads(f, '/api/v1/employees/e2/profile').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('tab', { name: 'Attendance' }));
    await waitFor(() => expect(f.mock.calls.some((c) => /attendance/.test(String(c[0])) && String(c[0]).includes('e2'))).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    await waitFor(() => expect(f.mock.calls.some((c) => /documents/.test(String(c[0])) && String(c[0]).includes('e2'))).toBe(true));
  });
  it('change history shows old and new values, bank changes and the system', async () => {
    mockPageApi(['employees.read'], record(EMP, (url) => (url.endsWith('/history') ? { items: [
      { id: 'h1', created_at: '2026-10-01T04:30:00Z', actor_name: 'Kavita', action: 'employee.updated_details', change_metadata: { changes: { grade: { from: 'G1', to: null }, phone: { from: null, to: '98' } } } },
      { id: 'h2', created_at: '2026-10-02T04:30:00Z', actor_name: null, action: 'employee.bank_changed', change_metadata: { changeId: 'c1', fields: ['ifsc'] } },
      { id: 'h3', created_at: '2026-10-03T04:30:00Z', actor_name: 'Bo', action: 'employee.viewed', change_metadata: {} },
    ] } : undefined)));
    show('/employees/e2?tab=history');
    const table = within(await screen.findByRole('table', { name: 'Change history' }));
    expect(table.getByText('updated details')).toBeTruthy();
    expect(table.getByText('Kavita')).toBeTruthy();
    expect(table.getAllByText('System')).toHaveLength(1);
    expect(table.getByText('grade').parentElement!.textContent).toBe('grade: G1 → —');
    expect(table.getByText('phone').parentElement!.textContent).toBe('phone: — → 98');
    expect(table.getByText('bank changed')).toBeTruthy();
  });
  it('change details this reader may not see say hidden, never empty, and no legacy redaction is printed', async () => {
    mockPageApi(['employees.read'], record(EMP, (url) => (url.endsWith('/history') ? { items: [
      { id: 'h1', created_at: '2026-10-01T04:30:00Z', actor_name: 'Kavita', action: 'leave.approved', change_metadata: null },
      { id: 'h2', created_at: '2026-10-02T04:30:00Z', actor_name: 'Kavita', action: 'employee.bank_changed', change_metadata: { newLast4: '[REDACTED]' } },
    ] } : undefined)));
    show('/employees/e2?tab=history');
    const table = within(await screen.findByRole('table', { name: 'Change history' }));
    expect(table.getByText(/^Hidden\./)).toBeTruthy();
    expect(table.queryByText(/Account ending/)).toBeNull();
    expect(screen.getByRole('table', { name: 'Change history' }).textContent).not.toMatch(/null|undefined/);
  });
  it('no history says so', async () => {
    mockPageApi(['employees.read'], record());
    show('/employees/e2?tab=history');
    expect(await screen.findByText('No changes recorded')).toBeTruthy();
  });
  it('a failed record load shows the reason', async () => {
    mockPageApi(['employees.read'], () => problem(404, 'No such employee'));
    show();
    expect((await screen.findByRole('alert')).textContent).toContain('No such employee');
  });

  describe('bank details', () => {
    const bank = (url: string) => {
      if (url.endsWith('/bank-account?reveal=1')) return FULL_BANK;
      if (url.endsWith('/bank-account')) return BANK;
      if (url.endsWith('/bank-account/pending?reveal=1')) return { pending: { id: 'c1', accountHolder: 'New Holder', accountNumberMasked: 'XXXXXX9999', ifsc: 'HDFC0001111', requestedAt: '2026-11-01T04:00:00Z', requestedBy: 'Kavita' } };
      if (url.endsWith('/bank-account/pending')) return { pending: { id: 'c1', accountHolder: null, accountNumberMasked: 'XXXXXX9999', ifsc: null, requestedAt: '2026-11-01T04:00:00Z', requestedBy: 'Kavita' } };
      return undefined;
    };
    it('stays hidden until shown, and showing asks both answers with reveal=1', async () => {
      const f = mockPageApi(['employees.read', 'employees.bank.read'], record(EMP, bank));
      show();
      const card = within((await screen.findByText('Bank details')).closest('section') ?? document.body);
      expect(await card.findByText('XXXXXX4321')).toBeTruthy();
      expect(card.getByText('Showing is recorded in the audit log.')).toBeTruthy();
      expect(screen.queryByText('SBIN0001234')).toBeNull();
      expect(screen.queryByText('1234567894321')).toBeNull();
      expect(await card.findByText('A change is waiting for approval')).toBeTruthy();
      expect(card.getAllByText('Hidden').length).toBeGreaterThanOrEqual(3);
      expect(reads(f, 'reveal=1')).toHaveLength(0);
      await userEvent.click(card.getByRole('button', { name: 'Show details' }));
      expect(await card.findByText('SBIN0001234')).toBeTruthy();
      expect(card.getByText('1234567894321')).toBeTruthy();
      expect(await card.findByText('New Holder')).toBeTruthy();
      expect(reads(f, '/bank-account?reveal=1').length).toBeGreaterThan(0);
      expect(reads(f, '/bank-account/pending?reveal=1').length).toBeGreaterThan(0);
      await userEvent.click(card.getByRole('button', { name: 'Hide details' }));
      await waitFor(() => expect(screen.queryByText('SBIN0001234')).toBeNull());
    });
    it('no account on file says so', async () => {
      mockPageApi(['employees.read', 'employees.bank.read'], record(EMP, (url) => (url.includes('/bank-account/pending') ? { pending: null } : url.includes('/bank-account') ? new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }) : undefined)));
      show();
      expect(await screen.findByText('No bank account on file.')).toBeTruthy();
    });
    it('an approver without read rights is not asked for the account itself', async () => {
      const f = mockPageApi(['employees.read', 'employees.bank.approve'], record(EMP, bank), {}, 'e1');
      show();
      expect(await screen.findByText('A change is waiting for approval')).toBeTruthy();
      expect(reads(f, '/bank-account/pending').length).toBeGreaterThan(0);
      expect(f.mock.calls.filter((c) => String(c[0]).endsWith('/bank-account'))).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull();
    });
    it('the update form strips the number, uppercases IFSC, and a refusal stays open', async () => {
      const f = mockPageApi(['employees.read', 'employees.bank.read', 'employees.bank.manage'], record(EMP, (url, init) => (init.method === 'PUT' ? problem(422, 'IFSC is not valid') : bank(url))));
      show();
      await userEvent.click(await screen.findByRole('button', { name: 'Update' }));
      const dlg = within(await screen.findByRole('dialog', { name: 'Update bank details' }));
      await userEvent.type(dlg.getByLabelText(/Account holder/), 'Asha');
      await userEvent.type(dlg.getByLabelText(/Account number/), '1234 5678-90');
      await userEvent.type(dlg.getByLabelText(/IFSC/), 'sbin0001234');
      await userEvent.type(dlg.getByLabelText(/Bank name/), 'SBI');
      await userEvent.click(dlg.getByRole('button', { name: 'Send for approval' }));
      expect((await dlg.findByRole('alert')).textContent).toContain('IFSC is not valid');
      expect(bodyOf(writes(f, '/bank-account')[0]!)).toEqual({ accountHolder: 'Asha', accountNumber: '1234567890', ifsc: 'SBIN0001234', bankName: 'SBI' });
      expect((dlg.getByLabelText(/Account number/) as HTMLInputElement).value).toBe('1234567890');
      await userEvent.click(dlg.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  describe('letters', () => {
    const saved = () => {
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(this: HTMLAnchorElement) { names.push(this.download); });
      return names;
    };
    const pdf = (url: string) => (/\.pdf|\/export/.test(url) ? new Response('x', { status: 200, headers: { 'content-type': 'application/pdf' } }) : undefined);
    it('an appointment letter leaves salary out unless asked, and asking is sent', async () => {
      const names = saved();
      const f = mockPageApi(['employees.read', 'employees.manage'], ['FEATURE_ONBOARDING', 'FEATURE_OFFBOARDING'], record(EMP, pdf), 'e1');
      show();
      await userEvent.click(await screen.findByRole('button', { name: 'Appointment letter' }));
      await waitFor(() => expect(reads(f, '/lifecycle/employees/e2/letters/appointment.pdf')).toHaveLength(1));
      expect(reads(f, 'includePay')).toHaveLength(0);
      await userEvent.click(screen.getByRole('checkbox', { name: /Include salary/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Appointment letter' }));
      await waitFor(() => expect(reads(f, 'appointment.pdf?includePay=true')).toHaveLength(1));
      await userEvent.click(screen.getByRole('button', { name: 'Experience letter' }));
      await userEvent.click(screen.getByRole('button', { name: 'Relieving letter' }));
      await waitFor(() => expect(names).toEqual(['appointment.pdf', 'appointment.pdf', 'experience.pdf', 'relieving.pdf']));
      expect(screen.queryByRole('button', { name: 'Export my data' })).toBeNull();
    });
    it('on my own record I can export my data and, when allowed, get my exit letters', async () => {
      const names = saved();
      const f = mockPageApi(['lifecycle.self'], ['FEATURE_OFFBOARDING'], record(EMP, pdf), 'e2');
      show();
      await userEvent.click(await screen.findByRole('button', { name: 'Export my data' }));
      await waitFor(() => expect(names).toEqual(['my-data.json']));
      expect(reads(f, '/tenant/data-rights/employees/e2/export')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Experience letter' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Appointment letter' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Personal details' })).toBeTruthy();
    });
    it('someone else without letter rights sees no letters', async () => {
      mockPageApi(['employees.read'], ['FEATURE_OFFBOARDING'], record(), 'e1');
      show();
      await screen.findByRole('heading', { name: 'Asha Rao' });
      expect(screen.queryByText('Letters and records')).toBeNull();
    });
  });

  describe('editing', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
      return screen.findByRole('dialog', { name: 'Edit employee' });
    };
    it('sends only what changed, with the version', async () => {
      const f = mockPageApi(['employees.read', 'employees.manage'], record());
      show();
      const dlg = await open();
      const last = within(dlg).getByLabelText(/Last name/);
      await userEvent.clear(last);
      await userEvent.type(last, 'Rao-Iyer');
      await userEvent.clear(within(dlg).getByLabelText(/^Phone/));
      await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(writes(f, '/employees/e2')).toHaveLength(1));
      expect(bodyOf(writes(f, '/employees/e2')[0]!)).toEqual({ changes: { lastName: 'Rao-Iyer', phone: null }, expectedVersion: 3 });
      expect(await screen.findByText('Employee updated')).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
    it('the current manager is shown, and the search leaves this person out', async () => {
      mockPageApi(['employees.read', 'employees.manage'], record(EMP, (url) => (url.includes('status=active') ? { items: [{ id: 'e2', first_name: 'Asha', last_name: 'Rao', employee_code: 'E2' }, { id: 'm2', first_name: 'Other', last_name: 'Boss', employee_code: 'M2' }] } : undefined)));
      show();
      const dlg = await open();
      const w = within(dlg);
      expect(w.getByText('Kavita Menon')).toBeTruthy();
      await userEvent.click(w.getByRole('button', { name: /Clear|Remove|Change/ }));
      await userEvent.click(w.getByRole('combobox', { name: /Reporting manager/ }));
      expect(await w.findByRole('option', { name: /Other Boss/ })).toBeTruthy();
      expect(w.queryByRole('option', { name: /Asha Rao/ })).toBeNull();
    });
    it('a retired title stays selectable on a record that already has it', async () => {
      mockPageApi(['employees.read', 'employees.manage'], record({ ...EMP, designation: 'Old title' }, (url) => (url.endsWith('/org') ? { ...ORG, designations: [{ id: 'p1', name: 'Lead', status: 'active' }, { id: 'p2', name: 'Old title', status: 'inactive' }] } : undefined)));
      show();
      const dlg = await open();
      const des = within(dlg).getByLabelText(/^Designation/) as HTMLSelectElement;
      expect(des.value).toBe('Old title');
      expect([...des.options].map((o) => o.value)).toEqual(['', 'Lead', 'Old title']);
    });
    it('someone already exited needs no new exit date', async () => {
      mockPageApi(['employees.read', 'employees.manage'], record({ ...EMP, status: 'exited' }));
      show();
      const dlg = await open();
      expect(within(dlg).queryByLabelText(/Exit date/)).toBeNull();
    });
  });
});
