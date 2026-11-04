import { LONG, page, type Fixture, type Screen } from './types';

export const screens: Screen[] = [
  { name: 'roster', path: '/attendance/roster', persona: 'admin' },
  { name: 'roster-employee', path: '/attendance/roster?view=employee', persona: 'employee' },
  { name: 'team-attendance', path: '/attendance/team', persona: 'admin' },
  { name: 'attendance-setup-shifts', path: '/attendance/admin?tab=shifts', persona: 'admin' },
  { name: 'attendance-setup-rosters', path: '/attendance/admin?tab=rosters', persona: 'admin' },
  { name: 'attendance-setup-holidays', path: '/attendance/admin?tab=holidays', persona: 'admin' },
  { name: 'attendance-setup-devices', path: '/attendance/admin?tab=devices', persona: 'admin' },
  { name: 'attendance-setup-geofences', path: '/attendance/admin?tab=geofences', persona: 'admin' },
  { name: 'attendance-setup-locks', path: '/attendance/admin?tab=locks', persona: 'admin' },
  { name: 'overtime-mine', path: '/overtime?tab=mine', persona: 'admin' },
  { name: 'overtime-all', path: '/overtime?tab=all', persona: 'admin' },
  { name: 'field-duty-mine', path: '/field-duty?tab=mine', persona: 'admin' },
  { name: 'field-duty-all', path: '/field-duty?tab=all', persona: 'admin' },
];

const today = new Date().toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const iso = (d: string, t: string) => `${d}T${t}:00+05:30`;
const monday = (() => { const wd = new Date(`${today}T00:00:00Z`).getUTCDay(); return plus(today, -((wd + 6) % 7)); })();

const SHIFTS = [
  { id: 's1', code: 'GEN', name: 'General', start_time: '09:30:00', end_time: '18:00:00', break_minutes: 30, grace_minutes: 10, early_exit_grace_minutes: 10, half_day_min_minutes: 240, full_day_min_minutes: 450, overtime_after_minutes: 540, overnight: false, status: 'active' },
  { id: 's2', code: 'NIGHT-ROTATION-LONG', name: LONG.title, start_time: '22:00:00', end_time: '06:30:00', break_minutes: 45, grace_minutes: 15, early_exit_grace_minutes: 15, half_day_min_minutes: 240, full_day_min_minutes: 450, overtime_after_minutes: null, overnight: true, status: 'active' },
  { id: 's3', code: 'MORN', name: 'Morning', start_time: '06:00:00', end_time: '14:00:00', break_minutes: 30, grace_minutes: 5, early_exit_grace_minutes: 5, half_day_min_minutes: 240, full_day_min_minutes: 420, overtime_after_minutes: null, overnight: false, status: 'inactive' },
];

const dates = Array.from({ length: 14 }, (_, i) => plus(monday, i));
const cell = (date: string, i: number, seed: number) => {
  const n = (i + seed) % 7;
  if (n === 5) return { date, shiftId: null, off: true, holiday: null, source: 'roster', pattern: 'ROT-3S', reason: null };
  if (n === 6) return { date, shiftId: null, off: true, holiday: 'Regional Foundation Day Celebration', source: null, pattern: null, reason: null };
  if (n === 2) return { date, shiftId: 's2', off: false, holiday: null, source: 'override', pattern: null, reason: 'Swap with a colleague' };
  return { date, shiftId: 's1', off: false, holiday: null, source: 'assignment', pattern: null, reason: null };
};
const ROSTER_ROWS = [
  { id: 'e1', code: 'EMP-1001', name: 'Asha Rao', department: 'Quality Control' },
  { id: 'e9', code: LONG.code, name: LONG.name, department: 'Quality Assurance and Regulatory Affairs' },
  { id: 'e5', code: 'EMP-1005', name: 'Rohan Iyer', department: null },
].map((r, s) => ({ ...r, days: dates.map((d, i) => cell(d, i, s)) }));

const DAILY = [
  { employee_id: 'e9', employee_code: LONG.code, name: LONG.name, branch_name: LONG.branch, status: 'missing_punch', first_in: iso(today, '09:42'), last_out: null, worked_minutes: 0, late_minutes: 12, early_exit_minutes: 0, overtime_minutes: 0, exceptions: ['duty_on_leave', 'missing_out_punch', 'late_arrival', 'consecutive_in_punches'], locked: true, shift_code: 'NIGHT-ROTATION-LONG' },
  { employee_id: 'e1', employee_code: 'EMP-1001', name: 'Asha Rao', branch_name: 'Mumbai HQ', status: 'present', first_in: iso(today, '09:28'), last_out: iso(today, '18:05'), worked_minutes: 487, late_minutes: 0, early_exit_minutes: 0, overtime_minutes: 0, exceptions: [], locked: false, shift_code: 'GEN' },
  { employee_id: 'e5', employee_code: 'EMP-1005', name: 'Rohan Iyer', branch_name: 'Pune Site', status: 'not_calculated', first_in: null, last_out: null, worked_minutes: null, late_minutes: null, early_exit_minutes: null, overtime_minutes: null, exceptions: null, locked: null, shift_code: null },
];

const CLAIMS = [
  { id: 'ot1', employee_id: 'e9', name: LONG.name, employee_code: LONG.code, work_date: plus(today, -9), minutes: 215, recorded_minutes: 240, payout: 'comp_off', status: 'pending', reason: LONG.text, payroll_period: null, payroll_status: null, comp_off_days: 0.5, cancel_reason: null },
  { id: 'ot2', employee_id: 'e1', name: 'Asha Rao', employee_code: 'EMP-1001', work_date: plus(today, -12), minutes: 90, recorded_minutes: 90, payout: 'pay', status: 'approved', reason: 'Quarter close', payroll_period: null, payroll_status: 'draft', comp_off_days: null, cancel_reason: null },
  { id: 'ot3', employee_id: 'e5', name: 'Rohan Iyer', employee_code: 'EMP-1005', work_date: plus(today, -20), minutes: 480, recorded_minutes: 480, payout: 'comp_off', status: 'approved', reason: 'Weekend shutdown cover', payroll_period: null, payroll_status: null, comp_off_days: 1, cancel_reason: null },
  { id: 'ot4', employee_id: 'e5', name: 'Rohan Iyer', employee_code: 'EMP-1005', work_date: plus(today, -25), minutes: 60, recorded_minutes: 60, payout: 'pay', status: 'cancelled', reason: 'Entered by mistake', payroll_period: null, payroll_status: null, comp_off_days: null, cancel_reason: LONG.text },
];

const DUTIES = [
  { id: 'fd1', employee_id: 'e9', name: LONG.name, employee_code: LONG.code, department: 'Quality Assurance and Regulatory Affairs', start_date: plus(today, 5), end_date: plus(today, 8), day_part: 'full', purpose: 'client_visit', place: LONG.branch, client_name: LONG.org, reference: LONG.token, reason: LONG.text, status: 'approved', outcome: null, outcome_note: null, cancel_reason: null, recorded_by_other: true },
  { id: 'fd2', employee_id: 'e1', name: 'Asha Rao', employee_code: 'EMP-1001', department: 'Quality Control', start_date: plus(today, -3), end_date: plus(today, -3), day_part: 'first_half', purpose: 'site_audit', place: 'Pune', client_name: null, reference: null, reason: 'Vendor audit', status: 'approved', outcome: 'partly_completed', outcome_note: LONG.text, cancel_reason: null, recorded_by_other: false },
  { id: 'fd3', employee_id: 'e1', name: 'Asha Rao', employee_code: 'EMP-1001', department: 'Quality Control', start_date: plus(today, 2), end_date: plus(today, 2), day_part: 'full', purpose: 'training', place: 'Thane', client_name: 'Acme', reference: 'WO-7', reason: 'Course', status: 'pending', outcome: null, outcome_note: null, cancel_reason: null, recorded_by_other: false },
  { id: 'fd4', employee_id: 'e5', name: 'Rohan Iyer', employee_code: 'EMP-1005', department: null, start_date: plus(today, -9), end_date: plus(today, -9), day_part: 'full', purpose: 'field_sampling', place: 'Nashik', client_name: null, reference: null, reason: 'Client request', status: 'approved', outcome: null, outcome_note: null, cancel_reason: null, recorded_by_other: false },
  { id: 'fd5', employee_id: 'e5', name: 'Rohan Iyer', employee_code: 'EMP-1005', department: null, start_date: plus(today, -15), end_date: plus(today, -14), day_part: 'full', purpose: 'other', place: 'Goa', client_name: null, reference: null, reason: 'Client request', status: 'cancelled', outcome: null, outcome_note: null, cancel_reason: LONG.text, recorded_by_other: false },
];

export const respond: Fixture = (url, persona, method) => {
  const p = url.pathname.replace('/api/v1', '');
  if (method !== 'GET' && (p.startsWith('/attendance/') || p.startsWith('/overtime') || p.startsWith('/field-duty'))) {
    if (p.endsWith('/rotate-key') || p === '/attendance/devices') return { apiKey: `hrms_${LONG.token}` };
    if (p === '/attendance/recalculate') return { daysCalculated: 3, lockedDaysSkipped: 1 };
    return { ok: true };
  }
  if (p === '/attendance/roster') {
    const items = persona === 'employee' ? ROSTER_ROWS.slice(0, 1) : ROSTER_ROWS;
    return { from: dates[0], to: dates[13], dates, shifts: SHIFTS.slice(0, 2), items, canEdit: persona === 'admin' || persona === 'hr' };
  }
  if (p === '/attendance/roster-patterns') {
    return { items: [
      { id: 'p1', code: 'INST-2S', name: 'Two-shift rotation', days: ['s1', 's1', 's2', 's2', null, null, 's1', 's1', 's2', 's2', null, null, null, null], status: 'active', employees: 12, used: true },
      { id: 'p2', code: 'ROTATION-LONG-CODE-1', name: LONG.title, days: ['s1', null], status: 'active', employees: 0, used: false },
      { id: 'p3', code: 'OLD', name: 'Retired pattern', days: ['s1'], status: 'inactive', employees: 0, used: true },
    ] };
  }
  if (p === '/attendance/shifts') return { items: SHIFTS };
  if (p === '/attendance/daily') return { ...page(DAILY, 50), summary: [{ status: 'present', count: 187 }, { status: 'missing_punch', count: 4 }, { status: 'not_calculated', count: 23 }] };
  if (p === '/attendance/holidays') {
    const y = url.searchParams.get('year') ?? today.slice(0, 4);
    return { items: [
      { id: 'h1', holiday_date: `${y}-01-26`, name: 'Republic Day', branch_id: null, branch_name: null, optional: false },
      { id: 'h2', holiday_date: `${y}-08-15`, name: 'Regional Foundation Day and Independence Week Celebration Holiday', branch_id: 'b2', branch_name: LONG.branch, optional: true },
      { id: 'h3', holiday_date: `${y}-11-08`, name: 'Diwali', branch_id: null, branch_name: null, optional: false },
    ] };
  }
  if (p === '/attendance/devices') {
    return { items: [
      { id: 'd1', name: 'Main gate', serial_number: LONG.token, api_key_prefix: 'hrms_AB12', branch_name: LONG.branch, status: 'active', last_sync_at: iso(today, '09:02'), last_clock_drift_seconds: 3, last_error: 'Clock drift above the allowed limit; check the network time setting on the device', unmapped_events: 14 },
      { id: 'd2', name: 'Annexe Building Service Entrance Turnstile Number Two', serial_number: 'SN-2', api_key_prefix: 'hrms_CD34', branch_name: 'Mumbai HQ', status: 'disabled', last_sync_at: null, last_clock_drift_seconds: null, last_error: null, unmapped_events: 0 },
      { id: 'd3', name: 'Stores', serial_number: 'SN-3', api_key_prefix: 'hrms_EF56', branch_name: 'Pune Site', status: 'active', last_sync_at: iso(today, '08:40'), last_clock_drift_seconds: 0, last_error: null, unmapped_events: 0 },
    ] };
  }
  if (p === '/attendance/device-events/unmapped') {
    return { items: [
      { id: 'u1', device_user_id: LONG.token, event_time: iso(today, '09:01'), device_name: 'Annexe Building Service Entrance Turnstile Number Two' },
      { id: 'u2', device_user_id: '1042', event_time: iso(today, '09:05'), device_name: 'Main gate' },
      { id: 'u3', device_user_id: '1043', event_time: iso(today, '09:09'), device_name: 'Main gate' },
    ] };
  }
  if (p === '/attendance/device-mappings') {
    return { items: [
      { device_user_id: LONG.token, name: LONG.name, employee_code: LONG.code },
      { device_user_id: '77', name: 'Asha Rao', employee_code: 'EMP-1001' },
      { device_user_id: '78', name: 'Rohan Iyer', employee_code: 'EMP-1005' },
    ] };
  }
  if (p === '/attendance/geofences') {
    return { items: [{ branch_id: 'b1', branch_name: 'Mumbai HQ', latitude: '19.076090', longitude: '72.877426', radius_m: 250, updated_at: iso(today, '10:00') }] };
  }
  if (p === '/attendance/locks') {
    return { items: [
      { id: 'lk1', period_start: '2026-09-01', period_end: '2026-09-30', locked_by: LONG.name, locked_at: iso('2026-10-02', '11:00') },
      { id: 'lk2', period_start: '2026-08-01', period_end: '2026-08-31', locked_by: 'Vikram Sethi', locked_at: iso('2026-09-02', '11:00') },
      { id: 'lk3', period_start: '2026-07-01', period_end: '2026-07-31', locked_by: 'Vikram Sethi', locked_at: iso('2026-08-03', '11:00') },
    ] };
  }
  if (p === '/overtime/eligible') {
    return { windowDays: 30, minMinutes: 30, payout: { pay: false, payBlocker: 'Overtime pay is not set up (rate, payroll component)', compOff: { code: 'CO', name: 'Compensatory Off', dayMinutes: 480 } },
      items: [
        { work_date: plus(today, -2), overtime_minutes: 245, first_in: iso(plus(today, -2), '09:30'), last_out: iso(plus(today, -2), '22:15'), worked_minutes: 765, shift_code: 'NIGHT-ROTATION-LONG' },
        { work_date: plus(today, -3), overtime_minutes: 95, first_in: iso(plus(today, -3), '09:30'), last_out: iso(plus(today, -3), '19:45'), worked_minutes: 615, shift_code: 'GEN' },
        { work_date: plus(today, -6), overtime_minutes: 45, first_in: null, last_out: null, worked_minutes: 495, shift_code: null },
      ] };
  }
  if (p === '/overtime/claims') {
    const rows = url.searchParams.get('scope') === 'mine' ? CLAIMS.slice(0, 4) : CLAIMS;
    return { ...page(rows), minutesByStatus: { approved: 570, pending: 215 } };
  }
  if (p === '/field-duty/requests') return { ...page(DUTIES), today };
  return undefined;
};
