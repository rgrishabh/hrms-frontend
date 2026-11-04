import { LONG, page, type Fixture, type Screen } from './types';

export const screens: Screen[] = [
  { name: 'settings-general', path: '/settings/general', persona: 'admin' },
  { name: 'settings-attendance', path: '/settings/attendance', persona: 'admin' },
  { name: 'settings-security', path: '/settings/security', persona: 'admin' },
  { name: 'settings-installation', path: '/settings/installation', persona: 'admin' },
  { name: 'settings-organization', path: '/settings/organization', persona: 'admin' },
  { name: 'settings-users', path: '/settings/users', persona: 'admin' },
  { name: 'settings-roles', path: '/settings/roles', persona: 'admin' },
  { name: 'settings-jobs', path: '/settings/jobs', persona: 'admin' },
  { name: 'settings-audit', path: '/settings/audit', persona: 'admin' },
  { name: 'reports', path: '/reports', persona: 'admin' },
  { name: 'reports-wide', path: '/reports?r=payroll_register', persona: 'admin' },
  { name: 'reports-short', path: '/reports?r=headcount', persona: 'admin' },
  { name: 'reports-snapshot', path: '/reports?snapshot=snap1', persona: 'admin' },
  { name: 'policies-mine', path: '/policies', persona: 'employee' },
  { name: 'policies-manage', path: '/policies?tab=manage', persona: 'admin' },
];

const iso = (d: string, t = '10:30') => `${d}T${t}:00+05:30`;
const setting = (over: object) => ({ scopes: ['tenant'], options: null, feature: null, editable: true, effective: 10, source: 'default', defaultValue: 5, platformValue: null, tenantValue: null, branchValue: null, version: null, ...over });

const SETTINGS = [
  setting({ key: 'general.timezone', group: 'general', label: 'Timezone', description: 'Used for dates, attendance days and schedules across the organization and its branches.', control: 'timezone', scopes: ['tenant', 'branch'], effective: 'Asia/Kolkata', defaultValue: 'Asia/Kolkata' }),
  setting({ key: 'general.date_format', group: 'general', label: 'Date format', description: 'How dates appear on every screen and in downloaded files.', control: 'select', options: [{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }], effective: 'DD/MM/YYYY', source: 'tenant', tenantValue: 'DD/MM/YYYY', defaultValue: 'YYYY-MM-DD', version: 3 }),
  setting({ key: 'general.signature', group: 'general', label: LONG.title, description: LONG.text, control: 'text', effective: LONG.token, defaultValue: '', source: 'tenant', tenantValue: LONG.token, version: 1 }),
  setting({ key: 'attendance.weekly_off', group: 'attendance', label: 'Weekly off days', description: 'Days treated as weekly off unless a roster says otherwise.', control: 'weekdays', scopes: ['tenant', 'branch'], effective: [0, 6], defaultValue: [0], source: 'tenant', tenantValue: [0, 6], version: 2 }),
  setting({ key: 'attendance.grace', group: 'attendance', label: 'Grace minutes for late arrival', description: 'Arrivals within this many minutes after shift start are not counted late.', control: 'number', effective: 10, defaultValue: 5, source: 'tenant', tenantValue: 10, version: 4 }),
  setting({ key: 'attendance.selfie_required', group: 'attendance', label: 'Selfie required at clock-in', description: 'Clock-in on the web or mobile app needs a camera photo.', control: 'boolean', effective: true, defaultValue: true, feature: 'attendance.selfie' }),
  setting({ key: 'security.session_days', group: 'security', label: 'Keep people signed in for (days)', description: 'After this many days without activity a session ends.', control: 'number', effective: 14, defaultValue: 14, editable: false }),
  setting({ key: 'security.mfa_admins', group: 'security', label: 'Require two-factor for administrators', description: 'Administrators must set up two-factor authentication at next sign-in.', control: 'boolean', effective: false, defaultValue: false }),
];

const moduleRow = (key: string, name: string, category: string, over: object = {}) => ({ key, name, description: 'Does what its name says, for the people your roles allow.', category, core: false, dependencies: [], supported: true, enabled: true, configured: true, dependenciesMet: true, operational: 'not_applicable', usable: true, blockers: [], ...over });
const INSTALLATION = {
  product: { name: 'Example HRMS' },
  brand: { name: 'Example Laboratories', legalName: LONG.org, logoUrl: null, logoDarkUrl: null, faviconUrl: null, primaryColor: '#14532d', secondaryColor: null, accentColor: '#2e8b57', fontFamily: null, supportEmail: LONG.email, supportPhone: '+91 22 4000 0000', helpUrl: 'https://help.example-laboratories.test/hr/getting-started/frequently-asked-questions', loginMessage: LONG.text, domain: 'example.test', locale: 'en-IN', timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD/MM/YYYY', financialYearStart: '04-01', country: 'IN' },
  features: {}, mode: 'multi', mfa: { available: true, enforced: false, methods: ['totp'] }, managedBy: 'deployment',
  domains: [{ hostname: 'hr.example.test', activation_status: 'active', is_primary: true }, { hostname: 'people-operations-portal.long-subdomain.example-laboratories.test', activation_status: 'pending', is_primary: false }, { hostname: 'old.example.test', activation_status: 'disabled', is_primary: false }],
  modules: [
    moduleRow('core.documents', 'Documents', 'core_hr', { core: true }), moduleRow('leave', 'Leave', 'workforce'),
    moduleRow('overtime', 'Overtime', 'workforce', { configured: false, usable: false, blockers: ["Turn on 'Calculate overtime minutes' in the attendance policy"], dependencies: ['attendance'] }),
    moduleRow('attendance.selfie', LONG.title, 'workforce', { operational: 'degraded' }), moduleRow('payroll', 'Payroll', 'payroll_finance'),
  ],
};

const ORG = {
  legalEntities: [{ id: 'l1', name: LONG.org, gstin: '27AAAAA0000A1Z5', cin: 'U74999MH2010PTC123456', state_code: '27', status: 'active' }, { id: 'l2', name: 'Example Testing Services LLP', gstin: null, cin: null, state_code: null, status: 'inactive' }, { id: 'l3', name: 'Example Labs (Pune)', gstin: null, cin: null, state_code: '27', status: 'active' }],
  branches: [{ id: 'b1', code: 'MUM-HQ', name: 'Mumbai HQ', state: 'Maharashtra', city: 'Mumbai', status: 'active', legal_entity_id: 'l1' }, { id: 'b2', code: 'PNQ-LAB-ANNEXE-03', name: LONG.branch, state: 'Maharashtra', city: null, status: 'active', legal_entity_id: 'l1' }, { id: 'b3', code: 'THANE', name: 'Thane', state: 'Maharashtra', city: 'Thane', status: 'inactive', legal_entity_id: 'l3' }],
  departments: [{ id: 'd1', code: 'QC', name: 'Quality Control', parent_id: null, status: 'active' }, { id: 'd2', code: 'PEOPLE', name: 'People', parent_id: null, status: 'active' }, { id: 'd3', code: 'QA-REG-AFFAIRS-WEST', name: 'Quality Assurance and Regulatory Affairs, Western Region', parent_id: 'd1', status: 'active' }],
};

const USERS = [
  { id: 'u9', email: LONG.email, display_name: LONG.name, status: 'active', roles: ['employee', 'hr_admin', 'custom_supervisor'], mfa_enabled: true, locked: true, employee_code: LONG.code, employee_id: 'e9', last_login_at: iso('2026-11-02') },
  { id: 'u2', email: 'pooja.yadav@example.test', display_name: 'Pooja Yadav', status: 'active', roles: ['employee'], mfa_enabled: false, locked: false, employee_code: 'EMP-1010', employee_id: 'e10', last_login_at: null },
  { id: 'u3', email: 'ananya.iyer@example.test', display_name: 'Ananya Iyer', status: 'disabled', roles: ['tenant_admin'], mfa_enabled: true, locked: false, employee_code: null, employee_id: null, last_login_at: iso('2026-09-15') },
];

const PERMS = [
  { key: 'employees.read', label: 'View employee records', privileged: false }, { key: 'payroll.read', label: 'View payroll runs, salaries and registers', privileged: true },
  { key: 'assets.manage', label: 'Maintain the asset register; issue and receive assets', privileged: true }, { key: 'attendance.team.read', label: 'See attendance for their reporting team', privileged: false },
  { key: 'org.read', label: 'View legal entities, branches and departments', privileged: false },
];
const ROLES = {
  canManage: true, maxPermissions: null, permissions: PERMS,
  system: [{ key: 'employee', name: 'Employee', permissions: ['employees.read'], grantable: true, users: 180 }, { key: 'hr_admin', name: 'HR Administrator', permissions: ['employees.read', 'payroll.read'], grantable: true, users: 4 }, { key: 'tenant_admin', name: 'Administrator', permissions: PERMS.map((p) => p.key), grantable: true, users: 1 }],
  custom: [
    { key: 'custom_supervisor', name: 'Shift supervisor', description: 'Sees team attendance', permissions: ['attendance.team.read'], grantable: true, users: 6, mfaRequired: false, updated_at: iso('2026-10-01'), updated_by_name: 'Kavita Menon' },
    { key: 'custom_long', name: LONG.title, description: LONG.text, permissions: ['payroll.read', 'assets.manage', 'org.read'], grantable: true, users: 0, mfaRequired: true, updated_at: iso('2026-10-15'), updated_by_name: LONG.name },
    { key: 'custom_locked', name: 'Payroll reader', description: null, permissions: ['payroll.read'], grantable: false, users: 2, mfaRequired: true, updated_at: iso('2026-08-15'), updated_by_name: null },
  ],
};

const run = (id: string, over: object) => ({ id, job_key: 'x', period_key: '2026-11-01', trigger: 'schedule', status: 'succeeded', attempts: 1, started_at: iso('2026-11-01', '01:00'), finished_at: iso('2026-11-01', '01:02'), next_retry_at: null, result: { credited: 214, skipped: 3, durationMs: 1200 }, error: null, triggered_by_name: null, ...over });
const JOBS = {
  timezone: 'Asia/Kolkata', maxAttempts: 3,
  items: [
    { key: 'leave.accrual', name: 'Leave accrual', description: 'Credits monthly leave entitlements.', schedule: { kind: 'monthly', day: 1, at: '01:00' }, feature: 'leave', active: true, nextRun: '2026-12-01 01:00', canRun: true, recentRuns: [run('r1', {}), run('r2', { period_key: 'manual:abc', trigger: 'manual', triggered_by_name: LONG.name, status: 'failed', attempts: 3, result: null, error: LONG.text })] },
    { key: 'documents.expiry', name: LONG.title, description: LONG.text, schedule: { kind: 'daily', at: '06:30' }, feature: null, active: true, nextRun: '2026-11-06 06:30', canRun: true, recentRuns: [] },
    { key: 'expenses.remind', name: 'Expense reminders', description: 'Reminds approvers about waiting claims.', schedule: { kind: 'daily', at: '09:00' }, feature: 'expenses', active: false, nextRun: '2026-11-06 09:00', canRun: true, recentRuns: [] },
  ],
};

const AUDIT = [
  { id: 'au1', created_at: iso('2026-11-02'), actor_name: LONG.name, actor_type: 'user', category: 'configuration', action: 'settings.updated', setting_key: 'attendance.grace', target_type: 'tenant', change_metadata: { from: 5, to: 10 } },
  { id: 'au2', created_at: iso('2026-11-01'), actor_name: null, actor_type: 'device', category: 'data', action: 'attendance.device_event_with_a_very_long_action_name_recorded', setting_key: null, target_type: 'device', change_metadata: { note: LONG.token } },
  { id: 'au3', created_at: iso('2026-10-30'), actor_name: 'Kavita Menon', actor_type: 'user', category: 'security', action: 'user.mfa_reset', setting_key: null, target_type: 'user', change_metadata: null },
];

const MONTH = { key: 'period', label: 'Month', type: 'month', default: '2026-10' };
const GROUP = { key: 'groupBy', label: 'Group by', type: 'select', default: 'department', options: [{ value: 'department', label: 'Department' }, { value: 'branch', label: 'Branch' }] };
const REPORTS = [
  { key: 'headcount', name: 'Headcount', description: 'People on the rolls by department or branch.', category: 'People', scope: 'all', params: [GROUP, { key: 'on', label: 'On date', type: 'date', default: '2026-11-01' }] },
  { key: 'attrition', name: 'Attrition', description: 'Joiners and leavers.', category: 'People', scope: 'all', params: [MONTH] },
  { key: 'attendance_summary', name: 'Attendance summary', description: 'Days present, absent and late per person.', category: 'Attendance', scope: 'team', params: [MONTH, { key: 'minDays', label: 'At least days', type: 'int', min: 0, max: 31, default: 0 }] },
  { key: 'payroll_register', name: LONG.title, description: LONG.text, category: 'Pay and statutory compliance reports for the whole organization', scope: 'all', params: [MONTH] },
];

const WIDE_COLUMNS = [
  { key: 'employee', label: 'Employee', type: 'text' }, { key: 'employee_code', label: 'Code', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'joined', label: 'Joined', type: 'date' },
  { key: 'paid_days', label: 'Paid days', type: 'number' }, { key: 'gross', label: 'Gross', type: 'money' }, { key: 'deductions', label: 'Deductions', type: 'money' }, { key: 'net', label: 'Net pay', type: 'money' },
  { key: 'attendance_pct', label: 'Attendance %', type: 'percent' }, { key: 'days_left', label: 'Days left', type: 'int' }, { key: 'note', label: 'Note', type: 'text' },
];
const wideRow = (i: number) => ({ employee: i % 3 === 0 ? LONG.name : `Employee ${i}`, employee_code: i % 3 === 0 ? LONG.code : `EMP-${1000 + i}`, department: i % 3 === 1 ? LONG.title : 'People', joined: '2020-03-15', paid_days: 30.5, gross: i % 3 === 0 ? LONG.amount : 92500, deductions: 14230.5, net: i % 3 === 0 ? LONG.amount - 14230.5 : 78269.5, attendance_pct: 96.4, days_left: i % 2 ? -4 : 12, note: i % 3 === 2 ? LONG.token : null });
const WIDE = { key: 'payroll_register', name: LONG.title, generatedAt: iso('2026-11-02'), scope: 'all', params: { period: '2026-10' }, columns: WIDE_COLUMNS, rows: Array.from({ length: 14 }, (_, i) => wideRow(i)), totals: { paid_days: 427, gross: LONG.amount * 5 + 832500, deductions: 199227, net: LONG.amount * 5 }, notes: ['Amounts are before employer contributions.', LONG.text], truncated: false };
const HEADCOUNT = { key: 'headcount', name: 'Headcount', generatedAt: iso('2026-11-02'), scope: 'all', params: { groupBy: 'department' }, columns: [{ key: 'department', label: 'Department', type: 'text' }, { key: 'headcount', label: 'Headcount', type: 'int' }], rows: [{ department: 'Quality Control', headcount: 64 }, { department: LONG.title, headcount: 12 }, { department: 'People', headcount: 7 }], totals: { headcount: 83 }, notes: [], truncated: false };

const SAVED = [
  { id: 's1', name: 'Monthly payroll cost', report_key: 'payroll_register', reportName: LONG.title, params: { period: '2026-10' }, schedule: { frequency: 'monthly', weekday: null, dayOfMonth: 2, period: 'last_month', enabled: true, nextRunOn: '2026-12-02', recipientIds: ['u2'], lastResult: 'Sent to 2 people' } },
  { id: 's2', name: LONG.title, report_key: 'headcount', reportName: 'Headcount', params: {}, schedule: { frequency: 'weekly', weekday: 1, dayOfMonth: null, period: 'last_7_days', enabled: false, nextRunOn: '2026-11-09', recipientIds: [], lastResult: null } },
  { id: 's3', name: 'Attrition snapshot', report_key: 'attrition', reportName: 'Attrition', params: {}, schedule: null },
];
const SNAPSHOTS = [{ id: 'snap1', name: 'Monthly payroll cost', owner: LONG.name, generated_at: iso('2026-11-02'), row_count: 214 }, { id: 'snap2', name: 'Headcount', owner: 'Kavita Menon', generated_at: iso('2026-10-02'), row_count: 12 }, { id: 'snap3', name: LONG.title, owner: 'Kavita Menon', generated_at: iso('2026-09-02'), row_count: 1 }];

const MY_POLICIES = {
  date: '2026-11-05', pending: 2, overdue: 1,
  items: [
    { id: 'v1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', version_no: 3, effective_from: '2026-01-01', requires_ack: true, change_summary: 'Updated the gifts section', acknowledged_at: null, due_on: '2026-10-01' },
    { id: 'v2', code: 'SAFETY', title: LONG.title, category: 'safety', version_no: 12, effective_from: '2026-06-01', requires_ack: true, change_summary: LONG.text, acknowledged_at: null, due_on: '2026-12-01' },
    { id: 'v3', code: 'POSH', title: 'Prevention of sexual harassment', category: 'posh', version_no: 1, effective_from: '2025-04-01', requires_ack: true, change_summary: 'First version', acknowledged_at: iso('2025-04-03'), due_on: '2025-04-15' },
    { id: 'v4', code: 'HANDBOOK', title: 'Employee handbook', category: 'hr', version_no: 2, effective_from: '2025-04-01', requires_ack: false, change_summary: 'For reference', acknowledged_at: null, due_on: null },
  ],
};
const VERSION_VIEW = { id: 'v1', policyId: 'p1', code: 'COC', title: 'Code of conduct', versionNo: 3, status: 'published', body: `${LONG.text}\n\n${LONG.token}`, fileName: LONG.file, hasFile: true, contentSha256: 'abc', requiresAck: true, changeSummary: 'Updated the gifts section', effectiveFrom: '2026-01-01', publishedAt: iso('2026-01-01'), acknowledgedAt: null };
const POLICY_LIST = [
  { id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', published_version: 3, effective_from: '2026-01-01', requires_ack: true, drafts: 1, audience: 214, acknowledged: 187 },
  { id: 'p2', code: 'OCCUPATIONAL-HEALTH-AND-SAFETY-WEST', title: LONG.title, category: 'safety', owner: LONG.name, status: 'active', published_version: null, effective_from: null, requires_ack: null, drafts: 1, audience: null, acknowledged: null },
  { id: 'p3', code: 'OLD', title: 'Old travel rules', category: 'other', owner: null, status: 'retired', published_version: null, effective_from: null, requires_ack: null, drafts: 0, audience: null, acknowledged: null },
];
const version = (id: string, no: number, over: object) => ({ id, version_no: no, status: 'published', change_summary: 'Updated the gifts section', effective_from: '2026-01-01', requires_ack: true, ack_due_days: 14, file_name: null, has_body: true, audience_branch_ids: [], audience_department_ids: [], created_at: iso('2026-01-01'), published_at: iso('2026-01-02'), created_by: 'u9', created_by_name: 'Kavita Menon', published_by_name: 'Ishaan Verma', acknowledgements: 187, ...over });
const POLICY_DETAIL = { id: 'p1', code: 'COC', title: 'Code of conduct', category: 'code_of_conduct', owner: 'HR', status: 'active', created_at: iso('2025-01-01'), versions: [version('v9', 4, { status: 'draft', change_summary: LONG.text, created_by_name: LONG.name, published_by_name: null, published_at: null, acknowledgements: 0, audience_branch_ids: ['b1'] }), version('v8', 3, {}), version('v7', 2, { status: 'withdrawn' })] };
const ACKS = page([{ employee_id: 'e1', name: LONG.name, employee_code: LONG.code, branch: LONG.branch, department: LONG.title, acknowledged_at: null }, { employee_id: 'e2', name: 'Meera Nair', employee_code: 'EMP-1002', branch: 'Mumbai HQ', department: 'Quality Control', acknowledged_at: null }, { employee_id: 'e3', name: 'Rohan Iyer', employee_code: 'EMP-1005', branch: null, department: null, acknowledged_at: iso('2026-02-02') }]);

export const respond: Fixture = (url, persona, method) => {
  const p = url.pathname.replace('/api/v1', '');
  if (method !== 'GET') return /^\/(tenant|org|reports|policies)(\/|$)/.test(p) ? { ok: true } : undefined;
  if (p === '/org') return ORG;
  if (p === '/tenant/settings') return { items: SETTINGS };
  if (p === '/tenant/installation') return INSTALLATION;
  if (p === '/tenant/users') return page(USERS);
  if (p === '/tenant/roles') return ROLES;
  if (p === '/tenant/jobs') return JOBS;
  if (p === '/tenant/audit') return { ...page(AUDIT, 50) };
  if (p === '/reports') return { items: persona === 'employee' ? [] : REPORTS, today: '2026-11-05', advanced: true };
  if (p === '/reports/saved') return { items: SAVED };
  if (/^\/reports\/saved\/[^/]+\/recipients$/.test(p)) return { items: [{ id: 'u2', name: 'Pooja Yadav', email: 'pooja.yadav@example.test' }, { id: 'u9', name: LONG.name, email: LONG.email }, { id: 'u3', name: 'Sneha Patil', email: 'sneha@example.test' }] };
  if (p === '/reports/snapshots') return { items: SNAPSHOTS };
  if (p.startsWith('/reports/snapshots/')) return WIDE;
  if (p === '/reports/payroll_register') return WIDE;
  if (p === '/reports/headcount') return HEADCOUNT;
  if (p === '/policies/mine') return MY_POLICIES;
  if (p === '/policies') return { items: POLICY_LIST };
  if (/^\/policies\/versions\/[^/]+\/acknowledgements$/.test(p)) return ACKS;
  if (p.startsWith('/policies/versions/')) return VERSION_VIEW;
  if (p.startsWith('/policies/')) return POLICY_DETAIL;
  return undefined;
};
