import type { Page, Route } from '@playwright/test';
import { respond as attendance } from './fixtures/attendance';
import { respond as learning } from './fixtures/learning';
import { respond as money } from './fixtures/money';
import { respond as payroll } from './fixtures/payroll';
import { respond as people } from './fixtures/people';
import { respond as settings } from './fixtures/settings';
import type { Fixture } from './fixtures/types';

const FIXTURES: Fixture[] = [payroll, people, settings, attendance, money, learning];

export const ALL_FEATURES: Record<string, boolean> = Object.fromEntries(['DOCUMENTS', 'ONBOARDING', 'OFFBOARDING', 'POLICIES', 'ATTENDANCE', 'ATTENDANCE_WEB', 'ATTENDANCE_MOBILE', 'ATTENDANCE_REGULARIZATION', 'SHIFTS', 'HOLIDAYS', 'LEAVE', 'OVERTIME', 'FIELD_DUTY', 'PAYROLL', 'PAYSLIPS', 'PAYROLL_STATUTORY', 'LOANS', 'ACCOUNTING_EXPORTS', 'EXPENSE_CLAIMS', 'TRAVEL', 'RECRUITMENT', 'PERFORMANCE_REVIEW', 'TRAINING', 'ASSET_MANAGEMENT', 'GRIEVANCE', 'POSH', 'REPORTS_ADVANCED', 'EMAIL_NOTIFICATIONS', 'PUSH_NOTIFICATIONS', 'SALARY_ADVANCE', 'ATTENDANCE_BIOMETRIC', 'ATTENDANCE_GEOFENCE', 'ATTENDANCE_SELFIE'].map((f) => [`FEATURE_${f}`, true]));

const SELF = ['attendance.self', 'employees.directory', 'leave.self', 'documents.self', 'expenses.self', 'competency.self', 'policies.self', 'lifecycle.self', 'payslips.self', 'cases.self', 'performance.self', 'assets.self', 'overtime.self', 'field_duty.self', 'travel.self', 'loans.self', 'profile.self'];
export const PERSONAS = {
  employee: { name: 'Asha Rao', roles: [{ key: 'employee', name: 'Employee' }], permissions: SELF },
  manager: { name: 'Meera Nair', roles: [{ key: 'reporting_manager', name: 'Reporting Manager' }], permissions: [...SELF, 'attendance.team.read', 'leave.team.read', 'expenses.team.read', 'overtime.team.read', 'field_duty.team.read', 'travel.team.read', 'loans.team.read', 'recruitment.requisition'] },
  admin: { name: 'Ishaan Verma', roles: [{ key: 'tenant_admin', name: 'Administrator' }], permissions: [...SELF, 'settings.read', 'settings.manage', 'users.manage', 'security.manage', 'org.read', 'org.manage', 'employees.read', 'employees.manage', 'employees.bank.read', 'employees.bank.manage', 'employees.bank.approve', 'attendance.read', 'attendance.configure', 'attendance.devices.manage', 'attendance.lock', 'attendance.recalculate', 'audit.read', 'leave.read', 'leave.approve', 'leave.manage', 'documents.read', 'documents.manage', 'training.manage', 'competency.read', 'competency.manage', 'competency.assess', 'competency.authorize', 'policies.read', 'policies.manage', 'policies.publish', 'recruitment.read', 'recruitment.manage', 'recruitment.approve', 'recruitment.requisition', 'lifecycle.read', 'lifecycle.manage', 'payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory', 'grievance.manage', 'posh.admin', 'performance.manage', 'assets.manage', 'overtime.read', 'overtime.manage', 'field_duty.read', 'field_duty.manage', 'travel.read', 'travel.approve', 'loans.read', 'loans.manage', 'expenses.read', 'expenses.pay', 'expenses.manage', 'accounting.export', 'accounting.configure', 'reports.read', 'approvals.delegations', 'approvals.escalations', 'recruitment.compensation'] },
  hr: { name: 'Kavita Menon', roles: [{ key: 'hr_admin', name: 'HR Administrator' }], permissions: [...SELF, 'settings.read', 'org.read', 'org.manage', 'employees.read', 'employees.manage', 'employees.bank.read', 'employees.bank.manage', 'attendance.read', 'attendance.configure', 'attendance.recalculate', 'audit.read', 'leave.read', 'leave.approve', 'leave.manage', 'documents.read', 'documents.manage', 'training.manage', 'competency.read', 'policies.read', 'policies.manage', 'policies.publish', 'recruitment.read', 'recruitment.manage', 'lifecycle.read', 'lifecycle.manage', 'payroll.read', 'grievance.manage', 'posh.admin', 'performance.manage', 'assets.manage', 'overtime.read', 'field_duty.read', 'travel.read', 'loans.read', 'approvals.delegations'] },
} as const;
export type Persona = keyof typeof PERSONAS;

const page1 = <T>(items: T[]) => ({ items, page: 1, pageSize: 25, total: items.length });
const iso = (d: string, t = '09:30') => `${d}T${t}:00+05:30`;
const today = process.env.E2E_TODAY ?? new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const dd = (n: number) => `${month}-${String(n).padStart(2, '0')}`;

const days = Array.from({ length: Math.max(1, Number(today.slice(8)) - 1) }, (_, i) => {
  const date = dd(i + 1);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const status = dow === 0 ? 'weekly_off' : i % 11 === 4 ? 'on_leave' : i % 13 === 6 ? 'missing_punch' : i % 9 === 7 ? 'half_day' : 'present';
  return { work_date: date, status, shift_code: dow === 0 ? null : 'GEN', first_in: status === 'present' ? iso(date) : null, last_out: status === 'present' ? iso(date, '18:05') : null, worked_minutes: status === 'present' ? 515 : status === 'half_day' ? 250 : 0, late_minutes: 0, early_exit_minutes: 0, overtime_minutes: 0, leave_fraction: status === 'on_leave' ? 1 : 0, leave_type_code: status === 'on_leave' ? 'CL' : null, duty_fraction: 0, exceptions: status === 'missing_punch' ? ['missing_out_punch'] : [] };
});

const EMPLOYEES = [
  ['Asha', 'Rao', 'EMP-1001', 'Senior Analyst', 'Quality Control', 'active'], ['Meera', 'Nair', 'EMP-1002', 'Laboratory Manager', 'Quality Control', 'active'], ['Arjun', 'Rao', 'EMP-1003', 'Quality Manager', 'Quality Assurance', 'active'],
  ['Kavita', 'Menon', 'EMP-1004', 'HR Administrator', 'People', 'active'], ['Rohan', 'Iyer', 'EMP-1005', 'Field Sampler', 'Operations', 'on_notice'], ['Ananya', 'Iyer', 'EMP-1006', 'Director', 'Leadership', 'active'], ['Vikram', 'Sethi', 'EMP-1007', 'Payroll Manager', 'Finance', 'active'],
  ['Venkata Subrahmanya Lakshminarayana', 'Krishnamurthy-Ramachandran', 'EMP-2026-INTERNATIONAL-000012345', 'Principal Regional Compliance and Occupational Health Coordinator', 'Quality Assurance and Regulatory Affairs', 'active'],
].map(([first, last, code, designation, department, status], i) => ({ id: `e${i + 1}`, employee_code: code, first_name: first, last_name: last, work_email: `${first!.toLowerCase()}.${last!.toLowerCase()}@example.test`, designation, department_name: department, branch_name: 'Mumbai HQ', date_of_joining: `202${i}-0${i + 1}-15`, status }));

const payslip = (period: string, gross: number, deductions: number) => ({ id: `ps-${period}`, period, kind: 'regular', gross, deductions, net: gross - deductions });

const FULL_EMPLOYEE = { ...EMPLOYEES[0], view: 'full', version: 3, phone: '+91 98200 00000', date_of_birth: '1992-04-18', legal_entity_id: 'l1', legal_entity_name: 'Example Laboratories Pvt Ltd', branch_id: 'b1', department_id: 'd1', grade: 'L4', employment_type: 'permanent', reporting_manager_id: 'e2', reporting_manager_name: 'Meera Nair', probation_end_date: '2020-07-15', confirmation_date: '2020-07-20', contract_end_date: null, exit_date: null };

/** Exact-path handlers. Anything else gets an empty page, so unmigrated pages at least load. */
function respond(url: URL, persona: Persona, method: string): unknown {
  for (const fixture of FIXTURES) {
    const answer = fixture(url, persona, method);
    if (answer !== undefined) return answer;
  }
  const p = url.pathname.replace('/api/v1', '');
  if (p === '/dashboard') {
    return {
      today, sections: persona === 'employee'
        ? [{ key: 'you', title: 'You', tiles: [{ key: 'leave_CL', label: 'Casual Leave available', value: 8, href: '/leave' }, { key: 'leave_EL', label: 'Earned Leave available', value: 14.5, href: '/leave' }, { key: 'pending', label: 'Requests in progress', value: 1 }] }]
        : [{ key: 'org', title: 'Organization', tiles: [{ key: 'headcount', label: 'Headcount', value: 214, href: '/reports?r=headcount' }, { key: 'joiners', label: 'Joined this month', value: 6 }, { key: 'exits', label: 'Exits this month', value: 2, tone: 'warn' }, { key: 'expiring', label: 'Documents expiring', value: 11, detail: 'Within 30 days', tone: 'bad', href: '/documents' }] }, { key: 'att', title: 'Attendance today', tiles: [{ key: 'present', label: 'Present', value: 187, tone: 'good' }, { key: 'absent', label: 'Absent', value: 9, tone: 'bad' }, { key: 'leave', label: 'On leave', value: 14 }] }],
      lists: persona === 'employee' ? [{ key: 'holidays', title: 'Upcoming holidays', items: [{ primary: 'Republic Day', date: '2027-01-26' }, { primary: 'Holi', date: '2027-03-22' }] }] : [{ key: 'on_leave_today', title: 'On leave today', items: [{ primary: 'Rohan Iyer', secondary: 'Operations', date: today }, { primary: 'Vikram Sethi', secondary: 'Finance', date: today }], href: '/leave?tab=team' }],
    };
  }
  if (p === '/attendance/me/today') return { linked: true, today, timezone: 'Asia/Kolkata', nextDirection: 'out', locationMode: 'off', channels: { web: true, mobile: false }, events: [{ direction: 'in', event_time: iso(today) }], daily: { status: 'present', exceptions: [], worked_minutes: 215 } };
  if (p === '/attendance/me') return { days, events: [{ id: 'ev1', direction: 'in', event_time: iso(dd(1)), source: 'web', status: 'accepted' }] };
  if (p === '/attendance/regularizations') return page1([{ id: 'r1', work_date: dd(1), requested_in: iso(dd(1), '09:15'), requested_out: null, reason: 'Forgot to punch in; was at the Thane site', status: 'pending' }, { id: 'r2', work_date: dd(2), requested_in: null, requested_out: iso(dd(2), '18:30'), reason: 'Device was offline', status: 'approved' }]);
  if (p === '/approvals/inbox') return { items: [{ id: 'a1', summary: `Casual Leave: 1.0 day(s), ${today}`, entity_type: 'leave_request', requester_name: 'Asha Rao', created_at: iso(today) }, { id: 'a2', summary: 'Travel to Pune for client audit', entity_type: 'travel_request', requester_name: 'Rohan Iyer', created_at: iso(today, '11:20'), via: 'delegation', on_behalf_of: 'Arjun Rao' }] };
  if (p === '/approvals/mine') return { items: [{ id: 'm1', summary: 'Earned Leave: 3.0 day(s)', status: 'pending', created_at: iso(today), decided_at: null }, { id: 'm2', summary: 'Attendance correction', status: 'approved', created_at: iso(dd(1)), decided_at: iso(dd(1), '15:00') }] };
  if (p === '/approvals/delegations') return url.searchParams.get('scope') === 'all' ? { items: [] } : { given: [], received: [] };
  if (p.startsWith('/approvals/a') || p.startsWith('/approvals/m')) return { summary: 'Casual Leave: 1.0 day(s)', status: 'pending', entity_type: 'leave_request', entity_id: 'x', steps: [{ step_index: 0, status: 'approved', approver_name: 'Meera Nair', approver_permission: 'x', escalated_at: null, escalated_to_name: null, acted_by_name: 'Meera Nair', acted_for_name: null, acted_via: null, acted_at: iso(today), comment: 'Fine by me' }, { step_index: 1, status: 'pending', approver_name: null, approver_permission: 'leave.approve', escalated_at: null, escalated_to_name: null, acted_by_name: null, acted_for_name: null, acted_via: null, acted_at: null, comment: null }] };
  if (p === '/leave/balances') return { leaveYear: Number(today.slice(0, 4)), period: { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` }, items: [{ id: 'cl', name: 'Casual Leave', code: 'CL', paid: true, requires_balance: true, allow_half_day: true, available: 8, used: 4, pending: 1 }, { id: 'sl', name: 'Sick Leave', code: 'SL', paid: true, requires_balance: true, allow_half_day: true, available: 6.5, used: 0.5, pending: 0 }, { id: 'el', name: 'Earned Leave', code: 'EL', paid: true, requires_balance: true, allow_half_day: false, available: 14.5, used: 3, pending: 0 }, { id: 'lwp', name: 'Leave without pay', code: 'LWP', paid: false, requires_balance: false, allow_half_day: true, available: 0, used: 0, pending: 0 }] };
  if (p === '/leave/requests') return page1([{ id: 'l1', type_name: 'Casual Leave', start_date: today, end_date: today, start_half: 'full', end_half: 'full', days: 1, reason: 'Family function', status: 'pending' }, { id: 'l2', type_name: 'Earned Leave', start_date: dd(1), end_date: dd(1), start_half: 'full', end_half: 'full', days: 3, reason: 'Vacation with family, booked months in advance', status: 'approved' }, { id: 'l3', type_name: 'Sick Leave', start_date: dd(1), end_date: dd(1), start_half: 'second_half', end_half: 'full', days: 0.5, reason: 'Fever', status: 'rejected' }]);
  if (p === '/leave/requests/preview') return { days: 1, paid: true, requiresBalance: true, available: 8, sufficient: true, perDate: [{ date: today, fraction: 1 }] };
  if (p === '/leave/ledger') return { items: [{ id: 'g1', entry_type: 'accrual', days: 12, note: null, created_at: iso(dd(1)), request_id: null, created_by_name: null }, { id: 'g2', entry_type: 'carry_forward', days: 2, note: 'Carried from last year', created_at: iso(dd(1)), request_id: null, created_by_name: null }, { id: 'g3', entry_type: 'consumption', days: -1, note: null, created_at: iso(dd(1)), request_id: 'l1', created_by_name: 'Asha Rao' }, { id: 'g4', entry_type: 'carry_out', days: -2.5, note: 'Moved to next leave year at year end', created_at: iso(dd(1)), request_id: null, created_by_name: 'Kavita Menon' }] };
  if (p === '/leave/calendar') return { items: [{ employee_id: 'e1', name: 'Asha Rao', employee_code: 'EMP-1001', type_code: 'CL', status: 'approved', start_date: today, end_date: today, start_half: 'full', end_half: 'full' }, { employee_id: 'e5', name: 'Rohan Iyer', employee_code: 'EMP-1005', type_code: 'EL', status: 'pending', start_date: today, end_date: today, start_half: 'full', end_half: 'full' }] };
  // Masked, as the real API answers without ?reveal=1. A slip by id comes whole here, standing for the revealed answer.
  if (p === '/payroll/payslips/mine') return { items: [payslip('2026-10', 92500, 14230), payslip('2026-09', 92500, 14230), payslip('2026-08', 88000, 13340)].map((x) => ({ ...x, gross: null, deductions: null, net: null, masked: true, maskedFields: ['gross', 'deductions', 'net'] })) };
  if (p.startsWith('/payroll/payslips/')) return { ...payslip('2026-10', 92500, 14230), legal_entity: 'Example Laboratories Pvt Ltd', name: 'Asha Rao', employee_code: 'EMP-1001', designation: 'Senior Analyst', department: 'Quality Control', branch: 'Mumbai HQ', date_of_joining: '2020-01-15', paid_days: 31, days_in_period: 31, lop_days: 0, uan: '100•••••4521', pan: 'ABC••••4F', account: '••••6789', ifsc: 'HDFC0001234', lines: [{ kind: 'earning', name: 'Basic', amount: 46250 }, { kind: 'earning', name: 'HRA', amount: 23125, basis: '50% of Basic' }, { kind: 'earning', name: 'Special allowance', amount: 23125 }, { kind: 'deduction', name: 'Provident fund', amount: 5550 }, { kind: 'deduction', name: 'Professional tax', amount: 200 }, { kind: 'deduction', name: 'Income tax', amount: 8480 }, { kind: 'employer', name: 'Employer PF', amount: 5550 }] };
  if (p === '/notifications/unread-count') return { unread: 3 };
  if (p === '/notifications') return { ...page1([{ id: 'n1', title: 'Casual Leave approved', body: 'Your request for 1 day was approved by Meera Nair.', link: '/leave', read_at: null, created_at: iso(today) }, { id: 'n2', title: 'Payslip for October is ready', body: null, link: '/payslips', read_at: null, created_at: iso(dd(1)) }, { id: 'n3', title: 'New sign-in from Chrome on Windows', body: 'If this was not you, change your password.', link: null, read_at: iso(dd(1)), created_at: iso(dd(1)) }]) };
  if (p === '/org') return { legalEntities: [{ id: 'l1', name: 'Example Laboratories Pvt Ltd' }], branches: [{ id: 'b1', name: 'Mumbai HQ', legal_entity_id: 'l1' }, { id: 'b2', name: 'Pune Lab', legal_entity_id: 'l1' }], departments: [{ id: 'd1', name: 'Quality Control' }, { id: 'd2', name: 'People' }, { id: 'd3', name: 'Finance' }] };
  if (p === '/employees') return { ...page1(EMPLOYEES), total: 214, view: persona === 'employee' ? 'directory' : 'full' };
  if (/^\/employees\/e\d+$/.test(p)) return FULL_EMPLOYEE;
  if (/^\/employees\/e\d+\/profile$/.test(p)) return { missing: ['Nominees'], sections: { contacts: [{ name: 'Suresh Rao', relationship: 'Father', phone: '+91 98200 11111', altPhone: null }], addresses: [{ kind: 'current', line1: '14 Hill Road', line2: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', postalCode: '400050', country: 'India' }], nominees: [], education: [{ level: 'postgraduate', qualification: 'M.Sc. Chemistry', institution: 'St. Xavier’s College', university: 'University of Mumbai', yearOfPassing: 2015, score: '8.4 CGPA' }], experience: [] }, edit: { contacts: 'direct', addresses: 'direct', nominees: 'approval', education: 'approval', experience: 'approval' }, pending: [] };
  if (/^\/employees\/e\d+\/history$/.test(p)) return { items: [] };
  if (p === '/documents/categories') return { items: [{ id: 'c1', code: 'CONTRACT', name: 'Contracts', scope: 'employee', status: 'active', restricted: false, requires_expiry: false, employee_visible: true, employee_upload: false }, { id: 'c2', code: 'MED', name: 'Medical', scope: 'employee', status: 'active', restricted: true, requires_expiry: true, employee_visible: true, employee_upload: true }] };
  if (p === '/documents') return page1([{ id: 'doc1', title: 'Employment contract', file_name: 'contract.pdf', size_bytes: 220000, category_name: 'Contracts', restricted: false, employee_name: 'Asha Rao', expires_on: null, created_at: iso(dd(1)), uploaded_by_name: 'Kavita Menon', status: 'active' }, { id: 'doc2', title: 'Fitness certificate', file_name: 'fitness.pdf', size_bytes: 80000, category_name: 'Medical', restricted: true, employee_name: 'Asha Rao', expires_on: dd(1), created_at: iso(dd(1)), uploaded_by_name: null, status: 'active' }]);
  return page1([]);
}

export interface MockOptions {
  persona?: Persona;
  features?: Record<string, boolean>;
  /** Paths that answer with an RFC 7807 500. */
  fail?: readonly string[];
  primaryColor?: string;
  signedIn?: boolean;
}

export async function mockApi(page: Page, options: MockOptions = {}) {
  const persona = options.persona ?? 'employee';
  const p = PERSONAS[persona];
  const config = { product: { name: 'Example HRMS' }, brand: { name: 'Example Laboratories', productName: 'Example HRMS', primaryColor: options.primaryColor ?? '#14532d', accentColor: '#2e8b57', supportEmail: 'support@example.test', locale: 'en-IN', timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD/MM/YYYY', financialYearStart: '04-01', country: 'IN', loginMessage: 'Use your work account.' }, features: options.features ?? ALL_FEATURES, mode: 'multi', mfa: { available: true, enforced: false, methods: ['totp'] } };
  const me = { views: [], mode: 'multi', salaryLevel: 0, user: { id: 'u1', email: `${p.name.split(' ')[0]!.toLowerCase()}@example.test`, displayName: p.name, employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: p.roles, permissions: p.permissions, csrfToken: 'token', organization: { id: 'o1', name: 'Example Laboratories' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/config/public') return route.fulfill({ json: config });
    if (path === '/auth/me') {
      return options.signedIn === false
        ? route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401 }) })
        : route.fulfill({ json: me });
    }
    if (options.fail?.some((f) => path.startsWith(f))) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Something failed on the server', status: 500 }) });
    return route.fulfill({ json: respond(url, persona, route.request().method()) });
  });
}

/** Sets the theme before any page script runs. */
export const forceTheme = (page: Page, theme: 'light' | 'dark') => page.addInitScript((t) => localStorage.setItem('hrms.theme', t), theme);
