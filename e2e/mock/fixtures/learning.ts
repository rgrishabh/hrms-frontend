import { LONG, page, type Fixture, type Screen } from './types';

/** Tabs that exist with training alone. The lab-gated tabs need FEATURE_LAB_COMPETENCY and are checked in learning.mock.ts. */
export const screens: Screen[] = [
  { name: 'competency-mine', path: '/competency', persona: 'employee' },
  { name: 'competency-training', path: '/competency?tab=training', persona: 'admin' },
  { name: 'competency-courses', path: '/competency?tab=setup', persona: 'admin' },
  { name: 'cases-mine', path: '/cases', persona: 'employee' },
  { name: 'cases-grievances', path: '/cases?tab=grievances', persona: 'admin' },
  { name: 'cases-posh', path: '/cases?tab=posh', persona: 'admin' },
  { name: 'cases-committee', path: '/cases?tab=committee', persona: 'admin' },
];

const PAST = '2026-02-14';
const SOON = '2026-11-20';
const FUTURE = '2028-03-31';
const at = (d: string) => `${d}T09:30:00+05:30`;

const COURSES = [
  { id: 'cr1', code: 'SAFETY-INDUCTION-AND-HAZARD-AWARENESS-2026', name: LONG.title, kind: 'safety', description: LONG.text, validity_months: 24, status: 'active', records: 1240 },
  { id: 'cr2', code: 'INDUCT', name: 'New joiner induction', kind: 'induction', description: null, validity_months: null, status: 'active', records: 214 },
  { id: 'cr3', code: 'OLD-QA', name: 'Quality awareness, 2019 edition', kind: 'quality', description: null, validity_months: 12, status: 'inactive', records: 3 },
];
const METHODS = [
  { id: 'm1', code: 'IS-3025-PART-11-PH-ELECTROMETRIC-2026', name: LONG.title, standard_ref: 'IS 3025 (Part 11): 2022, Reaffirmed, with Amendment No. 2', discipline: 'Chemical', matrix: 'Water and wastewater', review_months: 12, status: 'active', requirements: [COURSES[0]!, COURSES[1]!].map((c) => ({ id: c.id, code: c.code, name: c.name })) },
  { id: 'm2', code: 'ASTM-D1293', name: 'pH of water', standard_ref: 'ASTM D1293', discipline: 'Chemical', matrix: 'Water', review_months: 24, status: 'active', requirements: [] },
  { id: 'm3', code: 'MB-TPC', name: 'Total plate count', standard_ref: null, discipline: 'Biological', matrix: null, review_months: 12, status: 'inactive', requirements: [] },
];
const inForce = { status: 'authorized', reviewDue: FUTURE, inForce: true };
const MATRIX = {
  methods: [METHODS[0], METHODS[1], { id: 'm4', code: 'GC-MS-PESTICIDES', name: 'Pesticide residues', discipline: 'Chemical', matrix: 'Food' }, { id: 'm5', code: 'ICP-OES-METALS', name: 'Metals', discipline: 'Chemical', matrix: 'Water' }, { id: 'm6', code: 'KF-MOISTURE', name: 'Moisture', discipline: 'Chemical', matrix: 'Food' }],
  rows: [
    { employeeId: 'e2', employeeCode: LONG.code, name: LONG.name, cells: { m1: { perform: inForce, review: { status: 'pending', reviewDue: null, inForce: false }, authorize_report: { status: 'suspended', reviewDue: SOON, inForce: false } }, m2: { sampling: inForce }, m4: { perform: { status: 'authorized', reviewDue: PAST, inForce: false } } } },
    { employeeId: 'e3', employeeCode: 'EMP-1003', name: 'Arjun Rao', cells: { m2: { perform: inForce } } },
    { employeeId: 'e4', employeeCode: 'EMP-1004', name: 'Kavita Menon', cells: { m5: { review: inForce }, m6: { sampling: { status: 'pending', reviewDue: null, inForce: false } } } },
  ],
};
const auth = (id: string, status: string, over: object = {}) => ({ id, employee_id: 'e2', employee_code: LONG.code, employee_name: LONG.name, method_id: 'm1', method_code: METHODS[0]!.code, method_name: LONG.title, standard_ref: METHODS[0]!.standard_ref, activity: 'authorize_report', status, valid_from: PAST, review_due: SOON, missing_training: 0, requested_by: 'u1', ...over });
const AUTHS = [auth('a1', 'pending'), auth('a2', 'authorized', { activity: 'perform', missing_training: 2 }), auth('a3', 'suspended', { employee_name: 'Arjun Rao', employee_code: 'EMP-1003', method_code: 'ASTM-D1293', method_name: 'pH of water', activity: 'sampling' })];
const ASSESSMENTS = [
  { id: 's1', employee_id: 'e2', employee_name: LONG.name, employee_code: LONG.code, method_code: METHODS[0]!.code, method_name: LONG.title, activity: 'authorize_report', approach: 'interlab_comparison', assessed_on: PAST, result: 'competent', evidence: LONG.text, assessor_name: LONG.name, used: false },
  { id: 's2', employee_id: 'e3', employee_name: 'Arjun Rao', employee_code: 'EMP-1003', method_code: 'ASTM-D1293', method_name: 'pH of water', activity: 'perform', approach: 'replicate', assessed_on: PAST, result: 'not_yet_competent', evidence: 'RSD 4.2% against a limit of 2%', assessor_name: 'Meera Nair', used: false },
  { id: 's3', employee_id: 'e4', employee_name: 'Kavita Menon', employee_code: 'EMP-1004', method_code: 'MB-TPC', method_name: 'Total plate count', activity: 'sampling', approach: 'witnessed', assessed_on: PAST, result: 'competent', evidence: 'Witnessed run WR-114', assessor_name: 'Meera Nair', used: true },
];
const RECORDS = [
  { id: 't1', employee_id: 'e2', employee_code: LONG.code, employee_name: LONG.name, course_code: COURSES[0]!.code, course_name: LONG.title, completed_on: PAST, expires_on: SOON, result: 'passed', validity: 'expiring', status: 'active', trainer: LONG.name, provider: LONG.org },
  { id: 't2', employee_id: 'e3', employee_code: 'EMP-1003', employee_name: 'Arjun Rao', course_code: 'INDUCT', course_name: 'New joiner induction', completed_on: PAST, expires_on: null, result: 'completed', validity: 'valid', status: 'active', trainer: null, provider: LONG.org },
  { id: 't3', employee_id: 'e4', employee_code: 'EMP-1004', employee_name: 'Kavita Menon', course_code: 'OLD-QA', course_name: 'Quality awareness, 2019 edition', completed_on: '2020-02-01', expires_on: '2021-02-01', result: 'passed', validity: 'expired', status: 'active', trainer: 'Meera Nair', provider: null },
];
const MY_TRAINING = RECORDS.map(({ id, course_code, course_name, completed_on, expires_on, result, validity }) => ({ id, course_code, course_name, completed_on, expires_on, result, validity }));

const caseRow = (id: string, kind: 'posh' | 'grievance', reference: string, category: string, status: string, over: object = {}) => ({ id, kind, number: 1, reference, category, status, anonymous: false, received_at: at(PAST), inquiry_due: kind === 'posh' ? '2026-05-15' : null, report_due: null, sla_due: kind === 'grievance' ? SOON : null, closed_at: null, complainant_name: LONG.name, assignee_name: kind === 'grievance' ? LONG.name : null, ...over });
const GRIEVANCES = [caseRow('g1', 'grievance', 'GR-0001', 'discrimination', 'open'), caseRow('g2', 'grievance', 'GR-0002', 'pay', 'in_progress', { anonymous: true, complainant_name: null, sla_due: PAST }), caseRow('g3', 'grievance', 'GR-0003', 'facilities', 'closed')];
const POSH = [caseRow('p1', 'posh', 'IC-0001', 'hostile_environment', 'inquiry'), caseRow('p2', 'posh', 'IC-0002', 'online', 'report_submitted', { report_due: FUTURE }), caseRow('p3', 'posh', 'IC-0003', 'verbal', 'withdrawn')];
const COMMITTEE = {
  members: [{ user_id: 'u1', display_name: LONG.name, role: 'presiding_officer', added_at: at(PAST) }, { user_id: 'u7', display_name: 'Ananya Iyer', role: 'member', added_at: at(PAST) }, { user_id: 'u8', display_name: 'Kavita Menon', role: 'member', added_at: at(PAST) }],
  external: [{ id: 'x1', name: LONG.name, organization: LONG.org, since: PAST, until: null }],
  warnings: ['No external member from an approved NGO has been confirmed for the coming year'],
};
const caseDetail = (id: string) => {
  const row = [...GRIEVANCES, ...POSH].find((c) => c.id === id) ?? GRIEVANCES[0]!;
  const posh = row.kind === 'posh';
  return {
    id: row.id, kind: row.kind, reference: row.reference, category: row.category, status: row.status, anonymous: row.anonymous, role: id === 'g3' || id === 'p3' ? 'complainant' : 'handler', version: 4,
    complainantName: row.complainant_name, respondentName: LONG.name, respondentText: LONG.text, incidentDate: PAST, description: `${LONG.text}\n\n${LONG.token}`, lateReason: posh ? LONG.text : null, outcome: null,
    receivedAt: row.received_at, inquiryDue: row.inquiry_due, reportDue: row.report_due, slaDue: row.sla_due, closedAt: null, assigneeName: row.assignee_name, allowedMoves: posh ? ['report_submitted'] : ['in_progress', 'resolved'],
    events: [{ type: 'note', text: LONG.text, from_status: null, to_status: null, visible_to_complainant: false, at: at(PAST), actor: LONG.name }, { type: 'status', text: 'Started', from_status: 'open', to_status: 'in_progress', visible_to_complainant: true, at: at(PAST), actor: 'HR' }],
  };
};

export const respond: Fixture = (url, persona, method) => {
  const p = url.pathname.replace('/api/v1', '');
  if (!p.startsWith('/competency') && !p.startsWith('/cases')) return undefined;
  if (method !== 'GET') return /^\/(competency|cases)(\/|$)/.test(p) ? { ok: true, id: 'g1', reference: 'GR-0009', expiresOn: FUTURE } : undefined;
  if (p === '/competency/me') return { authorizations: AUTHS.slice(0, 2), training: MY_TRAINING };
  if (p === '/competency/matrix') return MATRIX;
  if (p === '/competency/methods') return { items: METHODS };
  if (p === '/competency/courses') return { items: COURSES };
  if (p === '/competency/authorizations') return page(AUTHS);
  if (/^\/competency\/authorizations\/a\d$/.test(p)) {
    const a = AUTHS.find((x) => p.endsWith(x.id)) ?? AUTHS[0]!;
    return { ...a, check: a.status === 'pending' ? null : { authorized: a.id !== 'a2', reasons: a.id === 'a2' ? [`Required training lapsed: ${COURSES[0]!.code}`] : [], reviewDue: SOON }, assessment: { approach: 'witnessed', assessed_on: PAST, result: 'competent', evidence: LONG.text, assessor_name: LONG.name }, events: [{ action: 'requested', reason: null, at: at(PAST), actor_name: LONG.name }, { action: 'suspended', reason: LONG.text, at: at(PAST), actor_name: null }] };
  }
  if (p === '/competency/assessments') return page(ASSESSMENTS);
  if (p === '/competency/training-records') return page(RECORDS);
  if (p === '/cases') {
    const kind = url.searchParams.get('kind');
    if (url.searchParams.get('scope') === 'mine') return { items: persona === 'employee' ? (kind === 'posh' ? POSH.slice(2) : GRIEVANCES.slice(0, 2)) : [] };
    return { items: kind === 'posh' ? POSH : persona === 'admin' ? GRIEVANCES : [] };
  }
  if (p === '/cases/committee') return COMMITTEE;
  if (p === '/cases/people') return { items: [{ id: 'u9', display_name: 'Rohan Iyer' }, { id: 'u10', display_name: LONG.name }] };
  if (p === '/cases/posh/annual-report') return { year: Number(url.searchParams.get('year')), received: 12, disposed: 9, pending: 3, pending_over_90: 1 };
  if (/^\/cases\/[a-z]\d$/.test(p)) return caseDetail(p.split('/').pop()!);
  return undefined;
};
