import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../auth';
import { ToastProvider } from '../../components/Toast';
import { newTestClient } from '../../test/render';
import { AttendanceAdmin } from '../../pages/AttendanceAdmin';
import { FieldDuty } from '../../pages/FieldDuty';
import { Overtime } from '../../pages/Overtime';
import { TeamAttendance } from '../../pages/TeamAttendance';

const flags = ['FEATURE_ATTENDANCE', 'FEATURE_SHIFTS', 'FEATURE_HOLIDAYS', 'FEATURE_ATTENDANCE_BIOMETRIC', 'FEATURE_ATTENDANCE_GEOFENCE', 'FEATURE_OVERTIME', 'FEATURE_FIELD_DUTY'];
const CONFIG = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: Object.fromEntries(flags.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const problem = (status: number, title: string) => new Response(JSON.stringify({ type: 'about:blank', title, status }), { status, headers: { 'content-type': 'application/problem+json' } });

type Handler = (url: string, init: RequestInit) => unknown;
function mockApi(perms: string[], handler: Handler) {
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions: perms, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return ok(CONFIG);
    if (url.endsWith('/auth/me')) return ok(me);
    const out = await handler(url, init ?? {});
    return out instanceof Response ? out : ok(out ?? {});
  });
}
function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }
const show = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}><MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>,
);
const paged = <T,>(items: T[], total = items.length, pageSize = 25) => ({ items, page: 1, pageSize, total });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SHIFT = { id: 's1', code: 'GEN', name: 'General', start_time: '09:30:00', end_time: '18:00:00', break_minutes: 30, grace_minutes: 10, early_exit_grace_minutes: 10, half_day_min_minutes: 240, full_day_min_minutes: 450, overtime_after_minutes: null, overnight: false, status: 'active' };

describe('roster pattern form', () => {
  it('clearing the cycle length keeps the days already chosen', async () => {
    mockApi(['attendance.configure'], (url) => {
      if (url.includes('/roster-patterns')) return { items: [] };
      if (url.includes('/attendance/shifts')) return { items: [SHIFT] };
      if (url.includes('/attendance/roster')) return { from: '2026-11-02', to: '2026-11-15', dates: [], shifts: [SHIFT], items: [], canEdit: true };
      return { items: [], branches: [] };
    });
    show(<AttendanceAdmin />, '/attendance/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Rosters' }));
    await userEvent.click(await screen.findByRole('button', { name: 'New pattern' }));
    const dlg = await screen.findByRole('dialog', { name: 'New roster pattern' });
    expect(within(dlg).getByLabelText('Day 7')).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText('Day 7'), 's1');
    const length = within(dlg).getByLabelText(/Days in the cycle/);
    await userEvent.clear(length);
    expect(within(dlg).getByLabelText('Day 7')).toBeTruthy();
    await userEvent.type(length, '7');
    expect((within(dlg).getByLabelText('Day 7') as HTMLSelectElement).value).toBe('s1');
  });
});

describe('team attendance', () => {
  const row = { employee_id: 'e9', employee_code: 'E9', name: 'Bela Roy', branch_name: 'HQ', status: 'present', first_in: null, last_out: null, worked_minutes: 480, late_minutes: 0, exceptions: [], locked: false, shift_code: 'GEN' };
  const api = () => mockApi(['attendance.read'], (url) => (url.includes('/attendance/daily') ? { ...paged([row]), summary: [] } : { branches: [], legalEntities: [], departments: [] }));
  it('the status filter lists attendance statuses only', async () => {
    api();
    show(<TeamAttendance />);
    await screen.findByText('Bela Roy');
    const options = within(screen.getByLabelText(/Status/)).getAllByRole('option').map((o) => o.textContent);
    for (const other of ['Lost', 'Issued', 'Finalized', 'In repair', 'Available', 'Not started']) expect(options).not.toContain(other);
    expect(options).toContain('Missing punch');
  });
  it('a row opens from the keyboard through a real link', async () => {
    api();
    show(<TeamAttendance />);
    const link = await screen.findByRole('link', { name: 'Bela Roy' });
    expect(link.getAttribute('href')).toBe('/employees/e9?tab=attendance');
  });
});

describe('attendance setup, devices', () => {
  const device = { id: 'd1', name: 'Gate', serial_number: 'S', api_key_prefix: 'k', branch_name: 'HQ', status: 'active', last_sync_at: null, last_clock_drift_seconds: null, last_error: null, unmapped_events: 0 };
  it('a failed unmapped or mapping load reads as a failure, not as nothing to do', async () => {
    mockApi(['attendance.devices.manage'], (url) => {
      if (url.endsWith('/attendance/devices')) return { items: [device] };
      if (url.includes('/device-events/unmapped') || url.includes('/device-mappings')) return problem(500, 'Queue failed');
      if (url.includes('/installation')) return { modules: [] };
      return { items: [], branches: [] };
    });
    show(<AttendanceAdmin />, '/attendance/admin?tab=devices');
    await userEvent.click(await screen.findByRole('tab', { name: 'Biometric devices' }));
    await screen.findByText('Gate');
    await waitFor(() => expect(screen.getAllByText('Queue failed').length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('Queue is empty.')).toBeNull();
    expect(screen.queryByText('No mappings yet.')).toBeNull();
  });
  it('a failed key rotation stays open and shows why', async () => {
    mockApi(['attendance.devices.manage'], (url) => {
      if (url.includes('rotate-key')) return problem(500, 'Rotation failed');
      if (url.endsWith('/attendance/devices')) return { items: [device] };
      if (url.includes('/installation')) return { modules: [] };
      return { items: [], branches: [] };
    });
    show(<AttendanceAdmin />, '/attendance/admin?tab=devices');
    await userEvent.click(await screen.findByRole('tab', { name: 'Biometric devices' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rotate key' }));
    const dlg = await screen.findByRole('dialog', { name: 'Rotate device key' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Rotate key' }));
    expect(await within(dlg).findByText('Rotation failed')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Rotate device key' })).toBeTruthy();
  });
});

describe('overtime and field duty lists', () => {
  const claim = { id: 'c1', work_date: '2026-10-01', minutes: 90, recorded_minutes: 90, payout: 'pay', status: 'pending', reason: 'Close', name: 'Bela Roy', employee_code: 'E9', payroll_period: null, payroll_status: null, comp_off_days: 0, cancel_reason: null };
  const duty = { id: 'f1', employee_id: 'e1', start_date: '2026-10-01', end_date: '2026-10-01', day_part: 'full', purpose: 'client_visit', place: 'Pune', client_name: null, reference: null, reason: 'Visit', status: 'pending', outcome: null, outcome_note: null, cancel_reason: null, recorded_by_other: false, name: 'Bela Roy', employee_code: 'E9', department: null };
  it('my overtime claims page through everything, instead of stopping at 50', async () => {
    mockApi(['overtime.self'], (url) => (url.includes('/eligible') ? { items: [], windowDays: 30, minMinutes: 30, payout: { pay: true, payBlocker: null, compOff: null } } : paged([claim], 60, 25)));
    show(<Overtime />);
    await screen.findByRole('table', { name: 'My overtime claims' });
    expect(await screen.findByRole('button', { name: 'Next' })).toBeTruthy();
  });
  it('my field duty pages through everything, instead of stopping at 50', async () => {
    mockApi(['field_duty.self'], () => ({ ...paged([duty], 60, 25), today: '2026-11-05' }));
    show(<FieldDuty />);
    await screen.findByRole('table', { name: 'My field duty' });
    expect(await screen.findByRole('button', { name: 'Next' })).toBeTruthy();
  });
  it('changing tab drops the other tab\'s filters and page', async () => {
    const f = mockApi(['overtime.team.read', 'overtime.read'], () => ({ ...paged([claim], 60, 25), minutesByStatus: {} }));
    show(<Overtime />);
    await screen.findByRole('table', { name: 'Overtime claims' });
    await userEvent.selectOptions(screen.getByLabelText(/Status/), 'approved');
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('scope=team') && String(u).includes('status=approved'))).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'All claims' }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('scope=all'))).toBe(true));
    expect(f.mock.calls.filter(([u]) => String(u).includes('scope=all')).every(([u]) => !String(u).includes('status='))).toBe(true);
  });
  it('a failed withdraw stays open and shows why', async () => {
    mockApi(['field_duty.self'], (url, init) => (init.method === 'POST' ? problem(409, 'Already decided') : { ...paged([duty]), today: '2026-11-05' }));
    show(<FieldDuty />);
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw field duty request' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    expect(await within(dlg).findByText('Already decided')).toBeTruthy();
  });
});
