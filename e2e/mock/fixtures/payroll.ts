import { LONG, page, type Fixture, type Screen } from './types';

export const screens: Screen[] = [
  { name: 'payroll-runs', path: '/payroll', persona: 'admin', minRows: 3 },
  { name: 'payroll-run-detail', path: '/payroll?tab=runs&run=r1', persona: 'admin', minRows: 3 },
  { name: 'payroll-salaries', path: '/payroll?tab=salaries', persona: 'admin', minRows: 0 },
  { name: 'payroll-components', path: '/payroll?tab=components', persona: 'admin', minRows: 3 },
  { name: 'payroll-statutory', path: '/payroll?tab=statutory', persona: 'admin', minRows: 3 },
  { name: 'accounting-journals', path: '/accounting', persona: 'admin', minRows: 3 },
  { name: 'accounting-ledgers', path: '/accounting?tab=ledgers', persona: 'admin', minRows: 3 },
  { name: 'loans-mine', path: '/loans', persona: 'admin', minRows: 3 },
  { name: 'loans-all', path: '/loans?tab=all', persona: 'admin', minRows: 3 },
];

const iso = '2026-10-31T10:30:00+05:30';
const totals = { employees: 214, gross: LONG.amount, net: 98765432.25, employerCost: 145678901.75 };
const RUNS = [
  { id: 'r1', period: '2026-10', kind: 'regular', status: 'computed', totals, warnings: 3, warnings_acknowledged: false, computed_at: iso, finalized_at: null, paid_at: null, payment_reference: null, legal_entity_name: LONG.org, employee_name: null, created_by_name: 'Kavita Menon' },
  { id: 'r2', period: '2026-09', kind: 'regular', status: 'finalized', totals, warnings: 1, warnings_acknowledged: true, computed_at: iso, finalized_at: iso, paid_at: null, payment_reference: null, legal_entity_name: LONG.org, employee_name: null, created_by_name: 'Vikram Sethi' },
  { id: 'r3', period: '2026-08', kind: 'fnf', status: 'draft', totals: null, warnings: 0, warnings_acknowledged: false, computed_at: null, finalized_at: null, paid_at: null, payment_reference: null, legal_entity_name: 'Example Laboratories Pvt Ltd', employee_name: LONG.name, created_by_name: 'Vikram Sethi' },
  { id: 'r4', period: '2026-07', kind: 'regular', status: 'approved', totals, warnings: 0, warnings_acknowledged: false, computed_at: iso, finalized_at: null, paid_at: null, payment_reference: null, legal_entity_name: 'Example Laboratories Pvt Ltd', employee_name: null, created_by_name: 'Vikram Sethi' },
];
const lines = [{ kind: 'earning', code: 'BASIC', name: 'Basic', amount: 46250 }, { kind: 'earning', code: 'OT', name: 'Overtime for weekend audits at the western zone sites', amount: 8125, basis: '12.5 hours' }, { kind: 'deduction', code: 'PF_EE', name: 'Provident fund', amount: 5550 }];
const ITEMS = [
  { id: 'i1', employee_id: 'e9', employee_code: LONG.code, employee_name: LONG.name, employed_days: 31, lop_days: 1.5, paid_days: 29.5, gross: 12345678.5, deductions: 2345678.25, net: 9999999.25, employer_cost: 13456789, warnings: [`No UAN recorded; ${LONG.text}`, 'Salary changed mid-month'], hold: false, lines },
  { id: 'i2', employee_id: 'e2', employee_code: 'EMP-1002', employee_name: 'Meera Nair', employed_days: 31, lop_days: 0, paid_days: 31, gross: 145000, deductions: 22000, net: 123000, employer_cost: 151000, warnings: [], hold: true, lines },
  { id: 'i3', employee_id: 'e3', employee_code: 'EMP-1003', employee_name: 'Arjun Rao', employed_days: 31, lop_days: 0, paid_days: 31, gross: 98000, deductions: 13000, net: 85000, employer_cost: 104000, warnings: [], hold: false, lines },
];
const detail = (id: string) => {
  const run = RUNS.find((r) => r.id === id) ?? RUNS[0]!;
  const draftFnf = run.kind === 'fnf';
  return {
    ...run, employee_id: draftFnf ? 'e9' : null, computed_by: 'someone-else', attendanceLocked: id !== 'r4',
    items: draftFnf ? [] : ITEMS,
    adjustments: draftFnf ? [] : [{ id: 'adj1', employee_id: 'e9', kind: 'earning', label: `Arrears for the revision effective April, ${LONG.title}`, amount: 45000, taxable: true, note: LONG.text, created_by_name: LONG.name }, { id: 'adj2', employee_id: 'e3', kind: 'lop_days', label: 'LOP correction', amount: -1, taxable: false, note: null, created_by_name: 'Vikram Sethi' }],
  };
};
const fixed = (code: string, name: string, position: number) => ({ id: code, code, name, kind: 'earning', calc: 'fixed', base_codes: [], prorate: true, taxable: true, pf_wage: true, esi_wage: true, position, status: 'active' });
const COMPONENTS = [fixed('BASIC', 'Basic', 1), fixed('SPECIAL_ALLOWANCE_001', LONG.title, 2), { ...fixed('HRA', 'House rent allowance', 3), calc: 'percent', base_codes: ['BASIC', 'SPECIAL_ALLOWANCE_001'], pf_wage: false }, { ...fixed('CANTEEN', 'Canteen recovery', 4), kind: 'deduction', status: 'inactive' }];
const RULES = [
  { id: 'sr1', kind: 'pf', scope: 'IN', effective_from: '2026-04-01', effective_to: null, params: { employeeRate: 12, employerRate: 12, epsRate: 8.33, wageCeiling: 15000, ceilingOnEmployee: true, ceilingOnEmployer: true }, source_reference: LONG.text, status: 'active', created_by: 'x', created_by_name: LONG.name, verified_by_name: 'Vikram Sethi' },
  { id: 'sr2', kind: 'tds', scope: 'new', effective_from: '2026-04-01', effective_to: '2027-03-31', params: { slabs: [{ upTo: 300000, rate: 0 }, { upTo: null, rate: 30 }], standardDeduction: 75000 }, source_reference: 'Finance Act 2026', status: 'draft', created_by: 'x', created_by_name: 'Vikram Sethi', verified_by_name: null },
  { id: 'sr3', kind: 'pt', scope: 'Maharashtra', effective_from: '2025-04-01', effective_to: null, params: { slabs: [{ upTo: 7500, amount: 0 }] }, source_reference: 'Circular 4 of 2025', status: 'retired', created_by: 'u1', created_by_name: 'Ishaan Verma', verified_by_name: 'Vikram Sethi' },
];
const SALARIES = [
  { id: 's1', effective_from: '2026-04-01', amounts: { BASIC: 46250, SPECIAL_ALLOWANCE_001: 23125, HRA: 40 }, annual_ctc: null, reason: LONG.text, status: 'active', created_by_name: LONG.name },
  { id: 's2', effective_from: '2026-11-01', amounts: { BASIC: 50000 }, annual_ctc: null, reason: 'Annual revision', status: 'pending', created_by_name: 'Vikram Sethi' },
  { id: 's3', effective_from: '2025-04-01', amounts: { BASIC: 42000 }, annual_ctc: null, reason: 'On joining', status: 'superseded', created_by_name: 'Vikram Sethi' },
];
const FNF = { lastWorkingDay: '2026-08-14', kind: 'resignation', noticeShortfallDays: 12, shortfallWaived: false, leaveYear: 2026, leaveBalances: [{ code: 'EL', name: 'Earned Leave', paid: true, balance: '14.5' }, { code: 'CL', name: LONG.title, paid: true, balance: '2' }, { code: 'LWP', name: 'Leave without pay', paid: false, balance: '0' }], salary: { BASIC: 46250, HRA: 40 }, note: 'Leave encashment, notice recovery and gratuity depend on your policies, appointment terms and applicable law; enter confirmed amounts as adjustments.', period: '2026-08', today: '2026-11-05' };

const JOURNAL = { number: `PR-2026-10-${LONG.token.slice(0, 20)}`, date: '2026-10-31', narration: LONG.text, missing: ['deduction:LWF_EE'], balanced: true, total: LONG.amount, entries: [{ key: 'earning:BASIC', label: 'Basic', ledger: 'Salaries and Wages Expense', debit: LONG.amount, credit: 0 }, { key: 'deduction:LWF_EE', label: 'Labour welfare fund (employee)', ledger: null, debit: 0, credit: 12000 }, { key: 'net_pay', label: 'Net salary payable', ledger: LONG.org, debit: 0, credit: 123444789.5 }] };
const lastExport = { at: iso, format: 'tally_xml', by: LONG.name };
const SOURCES = {
  runs: [{ id: 'r2', period: '2026-09', kind: 'regular', status: 'finalized', totals, legal_entity: LONG.org, last_export: lastExport }, { id: 'r5', period: '2026-08', kind: 'fnf', status: 'paid', totals, legal_entity: 'Example Laboratories Pvt Ltd', last_export: null }, { id: 'r6', period: '2026-07', kind: 'regular', status: 'paid', totals, legal_entity: 'Example Laboratories Pvt Ltd', last_export: { at: iso, format: 'csv', by: 'Vikram Sethi' } }],
  batches: [{ id: 'b1', status: 'approved', total: 8765432.5, claim_count: 148, created_at: iso, paid_at: null, payment_reference: null, last_export: null }, { id: 'b2', status: 'paid', total: 45000, claim_count: 3, created_at: iso, paid_at: iso, payment_reference: LONG.token, last_export: lastExport }, { id: 'b3', status: 'paid', total: 12000, claim_count: 1, created_at: iso, paid_at: iso, payment_reference: 'NEFT-443', last_export: null }],
};
const LEDGER = {
  items: [{ map_key: 'net_pay', ledger_name: 'Salary Payable' }, { map_key: 'legacy:OLD_HEAD_KEPT_FROM_MIGRATION', ledger_name: LONG.org }],
  heads: [{ key: 'earning:BASIC', label: 'Basic' }, { key: 'earning:*', label: 'Other earnings (adjustments, arrears)' }, { key: 'employer_expense:PF_EPF_ER', label: 'Provident fund (employer) — expense' }, { key: 'net_pay', label: 'Net salary payable' }, { key: 'expense:TRAVEL_AND_CONVEYANCE_LONG_CATEGORY', label: LONG.title }],
};

const loan = (id: string, over: Record<string, unknown>) => ({ id, employee_id: 'e9', kind: 'loan', amount: '250000', installments: 24, installment_amount: '10417', first_period: '2026-11', skip_periods: [], purpose: 'Family medical treatment', status: 'approved', created_at: iso, decided_at: iso, disbursed_at: null, disbursement_reference: null, closed_at: null, cancel_reason: null, recorded_by_other: false, employee_code: 'EMP-1005', name: 'Rohan Iyer', department: 'Operations', approval_request_id: null, outstanding: '250000', ...over });
const LOANS = [
  loan('l1', { name: LONG.name, employee_code: LONG.code, department: LONG.org, purpose: LONG.text, amount: LONG.amount, installment_amount: 5144032.9, skip_periods: ['2026-12', '2027-01'], recorded_by_other: true }),
  loan('l2', { status: 'disbursed', disbursed_at: iso, disbursement_reference: LONG.token, outstanding: '187500' }),
  loan('l3', { employee_id: 'e1', status: 'pending', kind: 'salary_advance', amount: '40000', installments: 2, installment_amount: '20000' }),
  loan('l4', { status: 'closed', outstanding: '0' }),
];
const LOAN_DETAIL = { ...LOANS[1], balance: { outstanding: '187500', inProgress: '10417', recovered: '52083' }, schedule: [{ period: '2026-11', amount: '10417' }, { period: '2026-12', amount: '10417' }, { period: '2027-01', amount: '10412' }], recoveries: [{ id: 'x1', source: 'payroll', period: '2026-10', amount: '10417', reference: null, created_at: iso, run_status: 'finalized', run_kind: 'regular' }, { id: 'x2', source: 'repayment', period: null, amount: '41666', reference: LONG.token, created_at: iso, run_status: null, run_kind: null }] };

export const respond: Fixture = (url, _persona, method) => {
  const p = url.pathname.replace('/api/v1', '');
  if (method !== 'GET') return undefined;
  if (p === '/payroll/runs') return { items: RUNS };
  const run = /^\/payroll\/runs\/([^/]+)$/.exec(p);
  if (run) return detail(run[1]!);
  if (p === '/payroll/components') return { items: COMPONENTS };
  if (p === '/payroll/statutory-rules') return { items: RULES };
  if (/^\/payroll\/employees\/[^/]+\/salaries$/.test(p)) return { items: SALARIES };
  if (/^\/payroll\/employees\/[^/]+\/statutory$/.test(p)) return { uan: '100200300400', pf_member_id: LONG.token, pf_excluded: false, esi_ip_number: '1234567890', pan: 'XXXXXX1234', tax_regime: 'new', pt_state: 'Maharashtra' };
  if (p.startsWith('/payroll/fnf-suggestions/')) return FNF;
  if (p === '/accounting/sources') return SOURCES;
  if (p === '/accounting/ledger-map') return LEDGER;
  if (/^\/accounting\/[^/]+\/[^/]+\/journal$/.test(p)) return JOURNAL;
  if (p === '/loans/requests') return page(url.searchParams.get('scope') === 'mine' ? LOANS.filter((l) => l.employee_id === 'e1').concat(LOANS.slice(0, 2)) : LOANS);
  if (p.startsWith('/loans/requests/')) return LOAN_DETAIL;
  return undefined;
};
