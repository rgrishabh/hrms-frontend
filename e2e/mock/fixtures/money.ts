import { LONG, page, type Fixture, type Screen } from './types';

export const screens: Screen[] = [
  { name: 'expenses-mine', path: '/expenses?tab=mine', persona: 'admin' },
  { name: 'expenses-team', path: '/expenses?tab=team', persona: 'manager' },
  { name: 'expenses-finance', path: '/expenses?tab=finance', persona: 'admin' },
  { name: 'expenses-categories', path: '/expenses?tab=categories', persona: 'admin' },
  { name: 'expenses-rates', path: '/expenses?tab=rates', persona: 'admin' },
  { name: 'travel-mine', path: '/travel?tab=mine', persona: 'admin' },
  { name: 'travel-team', path: '/travel?tab=team', persona: 'manager' },
  { name: 'travel-all', path: '/travel?tab=all', persona: 'admin' },
  { name: 'assets-mine', path: '/assets?tab=mine', persona: 'admin' },
  { name: 'assets-register', path: '/assets?tab=register', persona: 'admin' },
];

const today = new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const at = (d: string) => `${d}T10:15:00+05:30`;

const CLAIMS = [
  { id: 'cl1', title: LONG.title, status: 'draft', employee_id: 'e1', employee_name: LONG.name, items: 3, total: LONG.amount, flagged: 1, created_at: at(plusDays(-3)), submitted_at: null, approved_at: null, paid_at: null },
  { id: 'cl2', title: 'Client visit to Pune', status: 'submitted', employee_id: 'e1', employee_name: 'Asha Rao', items: 2, total: 4350.5, flagged: 0, created_at: at(plusDays(-9)), submitted_at: at(plusDays(-8)), approved_at: null, paid_at: null },
  { id: 'cl3', title: 'Training travel', status: 'paid', employee_id: 'e2', employee_name: 'Rohan Iyer', items: 1, total: 800, flagged: 0, created_at: at(plusDays(-30)), submitted_at: at(plusDays(-29)), approved_at: at(plusDays(-28)), paid_at: at(plusDays(-20)) },
  { id: 'cl4', title: 'Conference fees', status: 'returned', employee_id: 'e1', employee_name: 'Asha Rao', items: 1, total: 12000, flagged: 0, created_at: at(plusDays(-14)), submitted_at: at(plusDays(-13)), approved_at: null, paid_at: null },
];

const CLAIM_ITEMS = [
  { id: 'it1', expense_date: plusDays(-3), category_name: LONG.title, description: LONG.text, amount: LONG.amount, has_receipt: true, merchant: LONG.org, invoice_number: LONG.code, gstin: '27AAACE1234F1Z5', duplicate_of: 'it9', calc: null, quantity: null, rate: null, tier: null, vehicle: null },
  { id: 'it2', expense_date: plusDays(-4), category_name: 'Daily allowance (per diem)', description: 'Mumbai, client audit', amount: 1800, has_receipt: false, calc: 'per_diem', quantity: 1.5, rate: 1200, tier: 'METRO', vehicle: null },
  { id: 'it3', expense_date: plusDays(-4), category_name: 'Mileage', description: 'Office to client site and back', amount: 525, has_receipt: false, calc: 'mileage', quantity: 50, rate: 10.5, tier: null, vehicle: 'car' },
];

const claimDetail = (id: string) => {
  const c = CLAIMS.find((x) => x.id === id) ?? CLAIMS[0]!;
  return {
    ...c, purpose: LONG.text, project: LONG.code, payment_reference: c.status === 'paid' ? LONG.token : null, travel_request_id: id === 'cl1' ? 'tr3' : null, advance_adjusted: id === 'cl1' ? 1500 : 0,
    editable: ['draft', 'returned'].includes(c.status) && c.employee_id === 'e1', items: id === 'cl1' ? CLAIM_ITEMS : CLAIM_ITEMS.slice(1),
  };
};

const CATEGORIES = [
  { id: 'cat1', code: 'MEALS', name: 'Meals', description: null, requires_receipt: true, max_amount: 2500, gst_applicable: true, status: 'active', calc: null },
  { id: 'cat2', code: 'INTERNATIONAL-CONFERENCE-REGISTRATION', name: LONG.title, description: LONG.text, requires_receipt: false, max_amount: LONG.amount, gst_applicable: false, status: 'active', calc: null },
  { id: 'cat3', code: 'PERDIEM', name: 'Daily allowance (per diem)', description: null, requires_receipt: false, max_amount: null, gst_applicable: false, status: 'active', calc: 'per_diem' },
  { id: 'cat4', code: 'KM', name: 'Mileage', description: null, requires_receipt: false, max_amount: null, gst_applicable: false, status: 'active', calc: 'mileage' },
  { id: 'cat5', code: 'OLD', name: 'Retired category', description: null, requires_receipt: true, max_amount: null, gst_applicable: false, status: 'inactive', calc: null },
];

const RATES = {
  canManage: true,
  tiers: ['METRO', 'OTHER', 'INTL'],
  items: [
    { id: 'r1', kind: 'per_diem', tier: 'METRO', grade: null, vehicle: null, rate: 1200, effective_from: plusDays(-200), state: 'current', note: LONG.text, created_by_name: LONG.name },
    { id: 'r2', kind: 'per_diem', tier: 'OTHER', grade: 'L5', vehicle: null, rate: 800, effective_from: plusDays(-200), state: 'current', note: null, created_by_name: 'Vikram Sethi' },
    { id: 'r3', kind: 'per_diem', tier: 'INTL', grade: null, vehicle: null, rate: LONG.amount, effective_from: plusDays(40), state: 'scheduled', note: 'Revised policy', created_by_name: 'Vikram Sethi' },
    { id: 'r4', kind: 'mileage', tier: null, grade: null, vehicle: 'car', rate: 10.5, effective_from: plusDays(-300), state: 'current', note: null, created_by_name: 'Vikram Sethi' },
    { id: 'r5', kind: 'mileage', tier: null, grade: null, vehicle: 'two_wheeler', rate: 5, effective_from: plusDays(20), state: 'scheduled', note: LONG.text, created_by_name: LONG.name },
    { id: 'r6', kind: 'mileage', tier: null, grade: null, vehicle: 'car', rate: 9, effective_from: plusDays(-900), state: 'superseded', note: null, created_by_name: 'Vikram Sethi' },
  ],
};

const PAYABLES = [
  { id: 'pay1', employee_name: LONG.name, employee_code: LONG.code, title: LONG.title, payable: LONG.amount, total: LONG.amount + 1500, advance_adjusted: 1500, approved_at: at(plusDays(-12)), age_days: 12 },
  { id: 'pay2', employee_name: 'Rohan Iyer', employee_code: 'EMP-1005', title: 'Client visit to Pune', payable: 4350.5, total: 4350.5, advance_adjusted: 0, approved_at: at(plusDays(-2)), age_days: 2 },
  { id: 'pay3', employee_name: 'Asha Rao', employee_code: 'EMP-1001', title: 'Training travel', payable: 800, total: 800, advance_adjusted: 0, approved_at: at(plusDays(-45)), age_days: 45 },
];

const BATCHES = [
  { id: 'bat1', status: 'prepared', total: LONG.amount, claim_count: 12, created_at: at(plusDays(-1)), prepared_by: 'u2', prepared_by_name: LONG.name, approved_by_name: null, paid_by_name: null, payment_reference: null },
  { id: 'bat2', status: 'prepared', total: 5150.5, claim_count: 2, created_at: at(today), prepared_by: 'u1', prepared_by_name: 'Ishaan Verma', approved_by_name: null, paid_by_name: null, payment_reference: null },
  { id: 'bat3', status: 'approved', total: 9200, claim_count: 3, created_at: at(plusDays(-6)), prepared_by: 'u2', prepared_by_name: 'Vikram Sethi', approved_by_name: 'Ishaan Verma', paid_by_name: null, payment_reference: null },
  { id: 'bat4', status: 'paid', total: 31000, claim_count: 7, created_at: at(plusDays(-40)), prepared_by: 'u2', prepared_by_name: LONG.name, approved_by_name: LONG.name, paid_by_name: LONG.name, payment_reference: LONG.token },
];

const AGEING = {
  pipeline: [{ status: 'submitted', amount: LONG.amount, claims: 14 }, { status: 'approved', amount: 56500.75, claims: 9 }],
  approvedUnpaidByAge: [{ bucket: '0-7', amount: 12000, claims: 3 }, { bucket: '8-30', amount: 40000.75, claims: 5 }, { bucket: '31+', amount: 4500, claims: 1 }],
};

const trip = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id, employee_id: 'e2', name: 'Rohan Iyer', employee_code: 'EMP-1005', department: 'Operations', start_date: plusDays(10), end_date: plusDays(12), origin: 'Pune', destination: 'Mumbai', purpose: 'Client audit', project: null,
  travel_mode: 'rail', trip_type: 'domestic', estimate_total: 5000, advance_requested: 0, advance_paid_at: null, advance_reference: null, status, ...over,
});

const TRIPS = [
  trip('tr1', 'approved', { employee_id: 'e1', name: LONG.name, employee_code: LONG.code, department: LONG.title, origin: LONG.branch, destination: LONG.org, purpose: LONG.text, project: LONG.code, travel_mode: 'road', trip_type: 'international', estimate_total: LONG.amount, advance_requested: LONG.amount, advance_paid_at: at(plusDays(-1)), advance_reference: LONG.token }),
  trip('tr2', 'pending', { employee_id: 'e1', advance_requested: 3000 }),
  trip('tr3', 'approved', { start_date: plusDays(-3), end_date: plusDays(-1), advance_requested: 3000 }),
  trip('tr4', 'returned', { employee_id: 'e1', purpose: 'Returned for correction: dates changed' }),
  trip('tr5', 'completed', { start_date: plusDays(-20), end_date: plusDays(-18), advance_requested: 1500, advance_paid_at: at(plusDays(-22)), advance_reference: 'NEFT-001' }),
];

const tripDetail = (id: string) => ({
  ...(TRIPS.find((t) => t.id === id) ?? TRIPS[0]!), on_duty_note: LONG.text, field_duty_id: 'fd1', estimate_travel: 1800, estimate_stay: 2400, estimate_local: 0, estimate_meals: 800, estimate_other: 0,
  settlement: { advancePaid: LONG.amount, claimed: 12000.5, advanceAdjusted: 3000, reimbursable: 9000.5, recovered: 500, outstanding: 1500, claims: [{ id: 'cl1', title: LONG.title, total: LONG.amount, status: 'submitted' }, { id: 'cl2', title: 'Hotel', total: 900, status: 'paid' }] },
});

const asset = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id, tag: `IT-${id}`, name: 'Laptop 14 inch', category: 'it', serial_number: 'SN-4432', status, purchase_date: plusDays(-400), calibration_due: null, notes: null, branch_id: 'b1', branch_name: 'Mumbai HQ', holder_id: null, holder_name: null, issued_at: null, due_back: null, acknowledged_at: null, ...over,
});

const ASSETS = [
  asset('001', 'assigned', { tag: LONG.code, name: LONG.title, serial_number: LONG.token, branch_name: LONG.branch, holder_id: 'e2', holder_name: LONG.name, issued_at: plusDays(-40), due_back: plusDays(40) }),
  asset('002', 'available', { category: 'tool', name: 'Torque wrench set', calibration_due: plusDays(-3) }),
  asset('003', 'available', { category: 'vehicle', name: 'Delivery van', calibration_due: plusDays(20) }),
  asset('004', 'in_repair', { category: 'furniture', name: 'Standing desk', calibration_due: plusDays(200) }),
  asset('005', 'assigned', { holder_id: 'e3', holder_name: 'Arjun Rao', issued_at: plusDays(-5), acknowledged_at: at(plusDays(-5)) }),
];

const MY_ASSETS = [
  { id: 'as1', tag: LONG.code, name: LONG.title, category: 'it', serial_number: LONG.token, issued_at: plusDays(-10), due_back: plusDays(30), condition_out: LONG.text, acknowledged_at: null },
  { id: 'as2', tag: 'IT-110', name: 'Laptop 14 inch', category: 'it', serial_number: 'SN-1100', issued_at: plusDays(-300), due_back: null, condition_out: 'Good', acknowledged_at: at(plusDays(-299)) },
  { id: 'as3', tag: 'PPE-77', name: 'Safety shoes', category: 'ppe', serial_number: null, issued_at: plusDays(-90), due_back: null, condition_out: null, acknowledged_at: at(plusDays(-89)) },
];

const ASSET_HISTORY = [
  { id: 'h1', employee_name: LONG.name, employee_code: LONG.code, issued_at: plusDays(-40), condition_out: LONG.text, due_back: null, returned_at: null, condition_in: null, outcome: null, acknowledged_at: null, issued_by_name: LONG.name, received_by_name: null },
  { id: 'h2', employee_name: 'Asha Rao', employee_code: 'EMP-1001', issued_at: plusDays(-200), condition_out: 'Good', due_back: null, returned_at: plusDays(-100), condition_in: 'Scratched lid', outcome: 'damaged', acknowledged_at: at(plusDays(-199)), issued_by_name: 'Ishaan Verma', received_by_name: 'Ishaan Verma' },
];

const paged = <T>(url: URL, items: readonly T[]) => ({ ...page(items), page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 25), today });

export const respond: Fixture = (url, _persona, method) => {
  const p = url.pathname.replace('/api/v1', '');
  if (method !== 'GET') return undefined;
  if (p === '/expenses/claims') return paged(url, CLAIMS);
  if (p.startsWith('/expenses/claims/')) return claimDetail(p.split('/')[3]!);
  if (p === '/expenses/categories') return { items: CATEGORIES };
  if (p === '/expenses/allowance-rates') return RATES;
  if (p === '/expenses/allowance-quote') return { rate: url.searchParams.get('kind') === 'mileage' ? 10.5 : 1200, quantity: 3, amount: '3600.00' };
  if (p === '/expenses/payables') return { items: PAYABLES };
  if (p === '/expenses/batches') return { items: BATCHES };
  if (p === '/expenses/reports/ageing') return AGEING;
  if (p === '/travel/requests') return paged(url, url.searchParams.get('scope') === 'mine' ? TRIPS.filter((t) => t.employee_id === 'e1') : TRIPS);
  if (p.startsWith('/travel/requests/')) return tripDetail(p.split('/')[3]!);
  if (p === '/assets') return paged(url, ASSETS);
  if (p === '/assets/mine') return { items: MY_ASSETS };
  if (/^\/assets\/[^/]+\/history$/.test(p)) return { items: ASSET_HISTORY };
  return undefined;
};
