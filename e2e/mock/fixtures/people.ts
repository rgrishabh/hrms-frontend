import { LONG, page, type Fixture, type Screen } from './types';

export const screens: Screen[] = [
  { name: 'recruitment-requisitions', path: '/recruitment?tab=requisitions', persona: 'admin' },
  { name: 'recruitment-candidates', path: '/recruitment?tab=candidates', persona: 'admin' },
  { name: 'recruitment-interviews', path: '/recruitment?tab=interviews', persona: 'admin' },
  { name: 'recruitment-application', path: '/recruitment?tab=requisitions&application=app1', persona: 'admin' },
  { name: 'lifecycle-tasks', path: '/lifecycle?tab=tasks', persona: 'admin' },
  { name: 'lifecycle-onboarding', path: '/lifecycle?tab=onboarding', persona: 'admin' },
  { name: 'lifecycle-probation', path: '/lifecycle?tab=probation', persona: 'admin' },
  { name: 'lifecycle-separations', path: '/lifecycle?tab=separations', persona: 'admin' },
  { name: 'lifecycle-templates', path: '/lifecycle?tab=templates', persona: 'admin' },
  { name: 'performance-mine', path: '/performance?tab=mine', persona: 'admin' },
  { name: 'performance-team', path: '/performance?tab=team', persona: 'manager' },
  { name: 'performance-all', path: '/performance?tab=all', persona: 'admin' },
  { name: 'performance-cycles', path: '/performance?tab=cycles', persona: 'admin' },
];

const [FIRST, LAST] = ['Venkata Subrahmanya Lakshminarayana', 'Krishnamurthy-Ramachandran'];

const REQS = [
  { id: 'r1', code: 'REQ-0001', title: LONG.title, designation: 'Principal Coordinator, Regional Compliance', employment_type: 'permanent', branch_name: LONG.branch, department_name: 'Quality Assurance and Regulatory Affairs', hiring_manager_name: LONG.name, filled: 1, positions: 3, status: 'approved', pipeline: { applied: 12, screening: 4, interview: 2, offer: 1 } },
  { id: 'r2', code: 'REQ-0002', title: 'Senior Analyst', designation: 'Senior Analyst', employment_type: 'contract', branch_name: 'Mumbai HQ', department_name: null, hiring_manager_name: 'Meera Nair', filled: 0, positions: 1, status: 'draft', pipeline: {} },
  { id: 'r3', code: 'REQ-0003', title: 'Field Sampler', designation: null, employment_type: 'trainee', branch_name: 'Pune Lab', department_name: 'Operations', hiring_manager_name: null, filled: 0, positions: 2, status: 'on_hold', pipeline: { applied: 3 } },
];
const CANDIDATES = [
  { id: 'c1', first_name: FIRST, last_name: LAST, email: LONG.email, phone: '+91 98200 11111', current_designation: LONG.title, current_company: LONG.org, experience_months: 132, source: 'referral', applications: 2, retain_until: '2028-03-31', employee_id: null },
  { id: 'c2', first_name: 'Kavya', last_name: 'Deshmukh', email: 'kavya@mail.example', phone: null, current_designation: 'Chemist', current_company: 'Acme', experience_months: 40, source: 'job_portal', applications: 1, retain_until: '2028-01-15', employee_id: 'e9' },
  { id: 'c3', first_name: 'Rahul', last_name: null, email: null, phone: '+91 90000 22222', current_designation: null, current_company: null, experience_months: null, source: 'walk_in', applications: 0, retain_until: null, employee_id: null },
];
const INTERVIEWS = [
  { id: 'i1', application_id: 'app1', round: 1, kind: 'technical', scheduled_at: '2026-10-05T10:30:00+05:30', duration_min: 45, location: 'https://meet.example.test/very-long-room-name-for-the-panel-interview-round-one-with-tokens', status: 'scheduled', submitted_at: null, first_name: FIRST, last_name: LAST, requisition_title: LONG.title, requisition_code: 'REQ-0001' },
  { id: 'i2', application_id: 'app1', round: 2, kind: 'panel', scheduled_at: '2027-02-05T15:00:00+05:30', duration_min: 60, location: null, status: 'scheduled', submitted_at: null, first_name: 'Kavya', last_name: 'Deshmukh', requisition_title: 'Senior Analyst', requisition_code: 'REQ-0002' },
  { id: 'i3', application_id: 'app1', round: 1, kind: 'phone', scheduled_at: '2026-09-02T09:00:00+05:30', duration_min: 30, location: 'Room 4', status: 'completed', submitted_at: '2026-09-02T10:00:00+05:30', first_name: 'Rahul', last_name: null, requisition_title: 'Field Sampler', requisition_code: 'REQ-0003' },
];
const REQ_DETAIL = {
  ...REQS[0], version: 2, legal_entity_id: 'l1', legal_entity_name: LONG.org, branch_id: 'b1', department_id: 'd1', justification: LONG.text, budget_ctc_max: LONG.amount, hiring_manager_id: 'e2', target_date: '2027-01-31', created_by: 'u1', created_by_name: LONG.name,
  applications: [
    { id: 'app1', first_name: FIRST, last_name: LAST, current_company: LONG.org, experience_months: 132, source: 'referral', avg_rating: 4.5, stage: 'offer' },
    { id: 'app2', first_name: 'Kavya', last_name: 'Deshmukh', current_company: 'Acme', experience_months: 40, source: 'job_portal', avg_rating: null, stage: 'interview' },
    { id: 'app3', first_name: 'Rahul', last_name: null, current_company: null, experience_months: null, source: 'walk_in', avg_rating: 2, stage: 'rejected' },
  ],
};
const OFFER = { id: 'o1', designation: LONG.title, employment_type: 'permanent', annual_ctc: LONG.amount, joining_date: '2027-02-01', probation_months: 6, status: 'draft', above_budget: true, notes: LONG.text, employee_id: null, branch_name: 'Mumbai HQ' };
const APPLICATION = {
  id: 'app1', stage: 'offer', version: 4, access: 'full', requisition: { id: 'r1', code: 'REQ-0001', title: LONG.title, status: 'approved' },
  candidate: { id: 'c1', first_name: FIRST, last_name: LAST, current_designation: LONG.title, current_company: LONG.org, experience_months: 132, qualification: 'M.Sc. Analytical Chemistry, University of Mumbai', has_resume: true },
  events: [{ at: '2026-09-02T10:00:00+05:30', from_stage: 'applied', to_stage: 'screening', actor_name: LONG.name, note: LONG.text }, { at: '2026-09-10T10:00:00+05:30', from_stage: 'screening', to_stage: 'interview', actor_name: null, note: null }],
  interviews: [
    { id: 'i1', round: 1, kind: 'technical', status: 'scheduled', scheduled_at: '2026-10-05T10:30:00+05:30', location: 'https://meet.example.test/very-long-room-name-for-the-panel-interview-round-one-with-tokens', panel: [
      { user_id: 'u1', name: 'Ishaan Verma', submitted_at: null, rating: null, recommendation: null, notes: null },
      { user_id: 'u7', name: LONG.name, submitted_at: '2026-10-05T12:00:00+05:30', rating: 4, recommendation: 'yes', notes: LONG.text },
      { user_id: 'u8', name: 'Meera Nair', submitted_at: '2026-10-05T12:30:00+05:30', hidden: true, rating: null, recommendation: null, notes: null },
    ] },
  ],
  offers: [OFFER], allowedMoves: ['rejected', 'withdrawn'],
};
const CANDIDATE_DETAIL = { ...CANDIDATES[0], location: LONG.branch, notice_days: 90, qualification: 'M.Sc. Chemistry', referred_by_name: LONG.name, expected_ctc: LONG.amount, consent_at: '2026-09-01T09:00:00+05:30', consent_note: LONG.text, has_resume: true, status: 'active', applications: [{ id: 'app1', requisition_code: 'REQ-0001', title: LONG.title, stage: 'offer', updated_at: '2026-10-06T09:00:00+05:30' }] };

const TASKS = [
  { id: 't1', title: LONG.title, description: LONG.text, owner: 'it', due_date: '2026-10-01', checklist_id: 'cl1', kind: 'onboarding', employee_name: LONG.name },
  { id: 't2', title: 'Issue laptop', description: null, owner: 'hr', due_date: '2026-11-05', checklist_id: 'cl1', kind: 'onboarding', employee_name: 'Asha Rao' },
  { id: 't3', title: 'Recover access card', description: null, owner: 'admin', due_date: '2027-01-15', checklist_id: 'cl2', kind: 'offboarding', employee_name: 'Rohan Iyer' },
];
const CHECKLISTS = [
  { id: 'cl1', kind: 'onboarding', status: 'open', anchor_date: '2026-11-01', employee_name: LONG.name, employee_code: LONG.code, done: 2, tasks: 9, overdue: 3 },
  { id: 'cl3', kind: 'onboarding', status: 'open', anchor_date: '2026-11-15', employee_name: 'Asha Rao', employee_code: 'EMP-1001', done: 0, tasks: 9, overdue: 0 },
  { id: 'cl4', kind: 'onboarding', status: 'completed', anchor_date: '2026-06-01', employee_name: 'Rohan Iyer', employee_code: 'EMP-1005', done: 9, tasks: 9, overdue: 0 },
];
const CHECKLIST_DETAIL = {
  id: 'cl1', kind: 'onboarding', status: 'open', anchor_date: '2026-11-01', separation_id: null, employee: { id: 'e1', name: LONG.name, status: 'pre_joining' },
  tasks: [
    { id: 't1', title: LONG.title, owner: 'it', due_date: '2026-10-01', status: 'pending', note: null, done_by_name: null, done_at: null, canAct: true },
    { id: 't2', title: 'Issue laptop', owner: 'hr', due_date: '2026-10-02', status: 'done', note: LONG.text, done_by_name: LONG.name, done_at: '2026-10-02T10:00:00+05:30', canAct: true },
    { id: 't4', title: 'Bank details', owner: 'finance', due_date: '2026-10-03', status: 'skipped', note: 'Not needed', done_by_name: 'Kavita Menon', done_at: '2026-10-02T10:00:00+05:30', canAct: true },
  ],
};
const PROBATION = [
  { id: 'p1', employee_id: 'e2', employee_name: LONG.name, employee_code: LONG.code, designation: LONG.title, date_of_joining: '2026-03-01', probation_end: '2026-11-30', recommendation: null, extend_months: null, comments: null, status: 'open' },
  { id: 'p2', employee_id: 'e3', employee_name: 'Arjun Rao', employee_code: 'EMP-1003', designation: 'Quality Manager', date_of_joining: '2026-02-01', probation_end: '2026-08-01', recommendation: 'extend', extend_months: 3, comments: LONG.text, status: 'pending' },
  { id: 'p3', employee_id: 'e4', employee_name: 'Kavita Menon', employee_code: 'EMP-1004', designation: null, date_of_joining: '2026-01-01', probation_end: '2026-07-01', recommendation: 'confirm', extend_months: null, comments: 'Solid first six months.', status: 'approved' },
];
const SEPARATIONS = [
  { id: 's1', kind: 'contract_end', status: 'approved', employee_name: LONG.name, employee_code: LONG.code, notice_date: '2026-10-01', requested_lwd: '2026-12-31', approved_lwd: '2027-01-15', shortfall_days: 12, waive_shortfall: true, fnf_status: 'in_progress' },
  { id: 's2', kind: 'resignation', status: 'pending', employee_name: 'Rohan Iyer', employee_code: 'EMP-1005', notice_date: '2026-10-10', requested_lwd: '2026-11-30', approved_lwd: null, shortfall_days: 0, waive_shortfall: false, fnf_status: 'not_started' },
  { id: 's3', kind: 'absconding', status: 'completed', employee_name: 'Tara Bose', employee_code: 'EMP-1010', notice_date: '2026-05-10', requested_lwd: '2026-05-30', approved_lwd: '2026-05-30', shortfall_days: 45, waive_shortfall: false, fnf_status: 'settled' },
];
const SEPARATION = (id: string) => ({
  ...SEPARATIONS.find((s) => s.id === id)!, initiated_by: id === 's2' ? 'u1' : 'u7', initiated_by_name: LONG.name, employee: { id: 'e5', name: LONG.name, status: 'on_notice' }, reason: LONG.text, notice_days_required: 90, fnf_note: LONG.text,
  checklist: { id: 'cl2', status: 'open', tasks: [{ status: 'done' }, { status: 'pending' }] }, leaveBalances: [{ code: 'CL', balance: 8 }, { code: 'EL', balance: 14.5 }],
  exit_interview: { reasonForLeaving: LONG.text, whatWentWell: 'The team', _recorded_by: 'u9' },
});
const TEMPLATES = [
  { id: 'tp1', kind: 'onboarding', name: LONG.title, is_default: true, status: 'active', tasks: [{ title: LONG.title, description: null, owner: 'hr', offsetDays: -7 }, { title: 'Issue laptop', description: 'Standard build', owner: 'it', offsetDays: 0 }] },
  { id: 'tp2', kind: 'offboarding', name: 'Standard exit', is_default: true, status: 'active', tasks: [{ title: 'Recover access card', description: null, owner: 'admin', offsetDays: 0 }] },
  { id: 'tp3', kind: 'onboarding', name: 'Contract staff', is_default: false, status: 'inactive', tasks: [{ title: 'Induction', description: null, owner: 'hr', offsetDays: 1 }] },
];

const CYCLES = [
  { id: 'cy1', name: 'FY 2026-27 annual performance appraisal for all confirmed staff, all branches', status: 'active', self_review: true, period_start: '2026-04-01', period_end: '2027-03-31', reviews: 214, finalized: 96 },
  { id: 'cy2', name: 'FY 2025-26', status: 'closed', self_review: true, period_start: '2025-04-01', period_end: '2026-03-31', reviews: 201, finalized: 201 },
  { id: 'cy3', name: 'FY 2027-28', status: 'draft', self_review: false, period_start: '2027-04-01', period_end: '2028-03-31', reviews: 0, finalized: 0 },
];
const REVIEWS = [
  { id: 'rv1', employee_id: 'e2', employee_code: LONG.code, employee_name: LONG.name, designation: LONG.title, status: 'self_submitted', reviewer_name: 'Meera Nair', self_rating: 4, manager_rating: null, final_rating: null },
  { id: 'rv2', employee_id: 'e3', employee_code: 'EMP-1003', employee_name: 'Arjun Rao', designation: 'Quality Manager', status: 'manager_submitted', reviewer_name: null, self_rating: 3, manager_rating: 4, final_rating: null },
  { id: 'rv3', employee_id: 'e4', employee_code: 'EMP-1004', employee_name: 'Kavita Menon', designation: null, status: 'finalized', reviewer_name: LONG.name, self_rating: 5, manager_rating: 4, final_rating: 4 },
];
const GOALS = [
  { id: 'g1', title: LONG.title, measure: LONG.text, weight: 40, status: 'agreed', progress: 65 },
  { id: 'g2', title: 'Close audit findings on time', measure: null, weight: 35, status: 'agreed', progress: 100 },
  { id: 'g3', title: 'Second method authorization', measure: 'Authorization register', weight: 25, status: 'proposed', progress: 0 },
];
const REVIEW = (id: string, persona: string) => ({
  id, cycle_id: 'cy1', employee_id: 'e2', reviewer_id: 'e7', employee_name: LONG.name, cycle_name: CYCLES[0]!.name, period_start: '2026-04-01', period_end: '2027-03-31', version: 3, status: id === 'mine' ? 'not_started' : 'self_submitted', role: id === 'mine' ? 'employee' : persona === 'manager' ? 'manager' : 'hr',
  self_rating: id === 'mine' ? null : 4, self_comments: id === 'mine' ? null : LONG.text, manager_rating: null, manager_comments: null, final_rating: null, final_comments: null, goal_ratings: {}, goals: GOALS.filter((g) => g.status === 'agreed'),
});

export const respond: Fixture = (url, persona, method) => {
  if (method !== 'GET') return undefined;
  const p = url.pathname.replace('/api/v1', '');
  if (p === '/recruitment/requisitions') return page(REQS);
  if (p.startsWith('/recruitment/requisitions/')) return REQ_DETAIL;
  if (p === '/recruitment/candidates') return page(CANDIDATES);
  if (p.startsWith('/recruitment/candidates/')) return CANDIDATE_DETAIL;
  if (p === '/recruitment/interviews/mine') return { items: INTERVIEWS };
  if (p.startsWith('/recruitment/applications/')) return APPLICATION;
  if (p === '/recruitment/panel-users') return { items: [{ id: 'u7', display_name: LONG.name, designation: LONG.title }, { id: 'u8', display_name: 'Meera Nair', designation: 'Manager' }] };
  if (p === '/lifecycle/tasks/mine') return { date: '2026-11-05', items: TASKS };
  if (p === '/lifecycle/checklists') return page(CHECKLISTS);
  if (p.startsWith('/lifecycle/checklists/')) return CHECKLIST_DETAIL;
  if (p === '/lifecycle/probation') return { items: PROBATION };
  if (p === '/lifecycle/separations') return page(SEPARATIONS);
  if (p.startsWith('/lifecycle/separations/')) return SEPARATION(p.split('/').pop()!);
  if (p === '/lifecycle/templates') return { items: TEMPLATES };
  if (p === '/performance/cycles') return { items: CYCLES };
  if (p === '/performance/reviews') {
    const scope = url.searchParams.get('scope');
    return { items: scope === 'mine' ? [{ ...REVIEWS[0], id: 'mine' }] : REVIEWS };
  }
  if (p.startsWith('/performance/reviews/')) return REVIEW(p.split('/').pop()!, persona);
  if (/^\/performance\/cycles\/[^/]+\/goals\//.test(p)) return { items: GOALS, totalWeight: 100 };
  return undefined;
};
