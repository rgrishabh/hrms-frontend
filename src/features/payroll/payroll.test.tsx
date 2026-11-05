import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Payroll } from '../../pages/Payroll';
import { bodyOf, mockPageApi, problemResponse, showPage, writes } from '../../test/page';

const FLAGS = ['FEATURE_PAYROLL', 'FEATURE_PAYROLL_STATUTORY'];
const MANAGE = ['payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory'];
const item = (over = {}) => ({ id: 'i1', employee_id: 'e9', employee_code: 'E9', employee_name: 'Rohan Iyer', employed_days: 31, lop_days: 0, paid_days: 31, gross: 1000, deductions: 100, net: 900, employer_cost: 1100, warnings: [], hold: false, lines: [], ...over });
const RUN = { id: 'p1', period: '2026-01', legal_entity_name: 'Co', kind: 'regular', status: 'finalized', warnings: 0, warnings_acknowledged: false, totals: { employees: 1, gross: 1000, net: 900, employerCost: 1100 }, computed_at: null, computed_by: 'someone', items: [item()], adjustments: [], attendanceLocked: true, employee_id: null };
const api = (run: Record<string, unknown>, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/runs/p1')) return run;
  if (url.endsWith('/payroll/runs')) return { items: [run] };
  if (url.endsWith('/org')) return { legalEntities: [{ id: 'l1', name: 'Co' }], branches: [], departments: [] };
  return { items: [] };
};
const openRun = async () => { await userEvent.click(await screen.findByRole('button', { name: /2026-01/ })); await screen.findByRole('dialog', { name: /Payroll 2026-01/ }); };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('new run', () => {
  it('defaults to the month before the current one in the organization timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z')); // already 1 November in India
    mockPageApi(MANAGE, FLAGS, api(RUN));
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: 'New run' }));
    expect((await screen.findByLabelText(/^Month/) as HTMLInputElement).value).toBe('2026-10');
  });
  it('a full and final run picks a person, shows the suggestions and takes the month from them', async () => {
    const f = mockPageApi(MANAGE, FLAGS, api(RUN, (url) => {
      if (url.includes('/fnf-suggestions/e9')) return { lastWorkingDay: '2026-09-30', kind: 'resignation', noticeShortfallDays: 12, shortfallWaived: false, leaveYear: 2026, leaveBalances: [{ code: 'EL', name: 'Earned Leave', paid: true, balance: '14.5' }], salary: { BASIC: 50000 }, note: 'Enter confirmed amounts as adjustments.', period: '2026-09', today: '2026-11-01' };
      if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
      return undefined;
    }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: 'New run' }));
    const dlg = await screen.findByRole('dialog', { name: 'New payroll run' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/Kind/), 'fnf');
    expect(within(dlg).queryByLabelText(/Employee id/)).toBeNull();
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    expect(await within(dlg).findByText(/Leave year 2026/)).toBeTruthy();
    expect(within(dlg).getByText(/Earned Leave/)).toBeTruthy();
    await waitFor(() => expect((within(dlg).getByLabelText(/^Month/) as HTMLInputElement).value).toBe('2026-09'));
    await userEvent.selectOptions(within(dlg).getByLabelText(/Legal entity/), 'l1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes(f, '/payroll/runs')).toHaveLength(1));
    expect(bodyOf(writes(f, '/payroll/runs')[0]!)).toMatchObject({ kind: 'fnf', employeeId: 'e9', period: '2026-09', legalEntityId: 'l1' });
  });
  it('an employee with no approved separation is told so, and Create waits', async () => {
    mockPageApi(MANAGE, FLAGS, api(RUN, (url) => {
      if (url.includes('/fnf-suggestions/e9')) return problemResponse(404, 'No approved separation');
      if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
      return undefined;
    }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByRole('button', { name: 'New run' }));
    const dlg = await screen.findByRole('dialog', { name: 'New payroll run' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/Kind/), 'fnf');
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    expect(await within(dlg).findByText('No approved separation')).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('run actions', () => {
  it('a failed Mark paid stays open with the reason and the typed reference', async () => {
    mockPageApi(MANAGE, FLAGS, api(RUN, (url) => (url.includes('/paid') ? problemResponse(409, 'Finalize the run first') : undefined)));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await userEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record payment' });
    await userEvent.type(within(dlg).getByRole('textbox'), 'NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark paid' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Finalize the run first');
    expect((within(dlg).getByRole('textbox') as HTMLTextAreaElement).value).toBe('NEFT-1');
  });
  it('a failed warning acknowledgement stays open', async () => {
    const computed = { ...RUN, status: 'computed', warnings: 2 };
    mockPageApi(MANAGE, FLAGS, api(computed, (url) => (url.includes('/acknowledge-warnings') ? problemResponse(409, 'Run changed') : undefined)));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await userEvent.click(await screen.findByRole('button', { name: /Acknowledge 2/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Acknowledge warnings' });
    await userEvent.type(within(dlg).getByRole('textbox'), 'Reviewed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Acknowledge' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Run changed');
  });
  it('someone with read access only can still download the register', async () => {
    mockPageApi(['payroll.read'], FLAGS, api(RUN));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    expect(await screen.findByText('Register CSV')).toBeTruthy();
    expect(screen.getByText('Bank CSV')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull();
  });
  it('reopens an approved run after asking', async () => {
    const approved = { ...RUN, status: 'approved' };
    const f = mockPageApi(MANAGE, FLAGS, api(approved));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await userEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    expect(writes(f, '/reopen')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Reopen payroll run' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reopen run' }));
    await waitFor(() => expect(writes(f, '/runs/p1/reopen')).toHaveLength(1));
  });
  it('an approved regular run with attendance open offers no Finalize the server would refuse', async () => {
    mockPageApi(MANAGE, FLAGS, api({ ...RUN, status: 'approved', attendanceLocked: false }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await screen.findByRole('button', { name: 'Reopen' });
    expect(screen.queryByRole('button', { name: 'Finalize' })).toBeNull();
    expect(screen.getByText(/Lock attendance for 2026-01/)).toBeTruthy();
  });
  it('releases held pay with a reason, for an approver who did not compute the run', async () => {
    const held = { ...RUN, items: [item({ hold: true })] };
    const f = mockPageApi(MANAGE, FLAGS, api(held));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await userEvent.click(await screen.findByRole('button', { name: 'Release held pay for Rohan Iyer' }));
    const dlg = await screen.findByRole('dialog', { name: 'Release held pay' });
    await userEvent.type(within(dlg).getByRole('textbox'), 'Bank details confirmed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Release pay' }));
    await waitFor(() => expect(writes(f, '/runs/p1/items/e9/release')).toHaveLength(1));
    expect(bodyOf(writes(f, '/release')[0]!)).toEqual({ reason: 'Bank details confirmed' });
  });
  it('offers the released-pay bank file only once something has been released, and says how many', async () => {
    mockPageApi(MANAGE, FLAGS, api({ ...RUN, status: 'finalized', released_count: 0 }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await screen.findByRole('button', { name: 'Bank CSV' });
    expect(screen.queryByRole('button', { name: /Bank file for released pay/ })).toBeNull();
  });
  it('counts released pay on the bank file button', async () => {
    mockPageApi(MANAGE, FLAGS, api({ ...RUN, status: 'finalized', released_count: 2 }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    expect(await screen.findByRole('button', { name: 'Bank file for released pay (2)' })).toBeTruthy();
  });
  it('no release for the person who computed the run, or for their own pay', async () => {
    mockPageApi(MANAGE, FLAGS, api({ ...RUN, computed_by: 'u1', items: [item({ hold: true })] }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await screen.findByText('Rohan Iyer');
    expect(screen.queryByRole('button', { name: /Release held pay/ })).toBeNull();
  });
  it('holding an item can be undone from the toast', async () => {
    const f = mockPageApi(MANAGE, FLAGS, api({ ...RUN, status: 'computed' }));
    showPage(<Payroll />, '/payroll?tab=runs');
    await openRun();
    await userEvent.click(await screen.findByRole('button', { name: 'Hold pay for Rohan Iyer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/hold')).toHaveLength(2));
    expect(writes(f, '/hold').map((c) => bodyOf(c)['hold'])).toEqual([true, false]);
  });
});

describe('salaries', () => {
  it('does not ask for statutory details when that flag is off, since the route is a 404', async () => {
    const f = mockPageApi(['payroll.read', 'payroll.manage'], ['FEATURE_PAYROLL'], api(RUN, (url) => {
      if (url.includes('/payroll/employees/e9/salaries')) return { items: [] };
      if (url.includes('/payroll/employees/e9/statutory')) return problemResponse(404, 'Not found');
      if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
      return undefined;
    }));
    showPage(<Payroll />, '/payroll?tab=salaries');
    await userEvent.click(await screen.findByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Rohan Iyer/ }));
    await screen.findByText(/No salary yet/);
    expect(f.mock.calls.filter(([u]) => String(u).includes('/statutory'))).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('components', () => {
  it('base components are chosen, not typed, so a comma cannot be lost', async () => {
    const comps = [{ id: 'c1', code: 'BASIC', name: 'Basic', kind: 'earning', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: true, esi_wage: true, position: 1, status: 'active' }, { id: 'c2', code: 'DA', name: 'Dearness', kind: 'earning', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: true, esi_wage: true, position: 2, status: 'active' }];
    const f = mockPageApi(MANAGE, FLAGS, api(RUN, (url, init) => (url.includes('/components') && init.method === 'GET' ? { items: comps } : undefined)));
    showPage(<Payroll />, '/payroll?tab=components');
    await userEvent.click(await screen.findByRole('button', { name: 'New component' }));
    const dlg = await screen.findByRole('dialog', { name: 'New component' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'hra');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'House rent');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Calculation/), 'percent');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText(/Choose at least one base component/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /BASIC/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /^DA/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/components')).toHaveLength(1));
    expect(bodyOf(writes(f, '/components')[0]!)).toMatchObject({ code: 'HRA', calc: 'percent', baseCodes: ['BASIC', 'DA'] });
  });
  it('a statutory rule with bad JSON is refused at the field', async () => {
    const f = mockPageApi(MANAGE, FLAGS, api(RUN));
    showPage(<Payroll />, '/payroll?tab=statutory');
    await userEvent.click(await screen.findByRole('button', { name: 'New rule' }));
    const dlg = await screen.findByRole('dialog', { name: 'New statutory rule' });
    await userEvent.type(within(dlg).getByLabelText(/Effective from/), '2026-04-01');
    await userEvent.type(within(dlg).getByLabelText(/Parameters/), 'not json');
    await userEvent.type(within(dlg).getByLabelText(/Source reference/), 'Circular 12 of 2026');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save draft' }));
    expect((await within(dlg).findByLabelText(/Parameters/)).getAttribute('aria-invalid')).toBe('true');
    expect(writes(f, '/statutory-rules')).toHaveLength(0);
  });
});
