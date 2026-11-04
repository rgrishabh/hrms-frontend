import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../auth';
import { ToastProvider } from '../components/Toast';
import { newTestClient } from '../test/render';
import { AttendanceAdmin } from '../pages/AttendanceAdmin';
import { Lifecycle } from '../pages/Lifecycle';
import { Payroll } from '../pages/Payroll';
import { Recruitment } from '../pages/Recruitment';
import { SettingsCenter } from '../pages/Settings';
import type { ReactNode } from 'react';

const flags = ['FEATURE_SHIFTS', 'FEATURE_PAYROLL', 'FEATURE_PAYROLL_STATUTORY', 'FEATURE_RECRUITMENT', 'FEATURE_OFFBOARDING', 'FEATURE_ONBOARDING', 'FEATURE_ATTENDANCE', 'FEATURE_ATTENDANCE_BIOMETRIC'];
const CONFIG = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: Object.fromEntries(flags.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };

type Handler = (url: string, init: RequestInit) => unknown;

function mockApi(perms: string[], handler: Handler): Mock {
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions: perms, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return new Response(JSON.stringify(CONFIG), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/auth/me')) return new Response(JSON.stringify(me), { headers: { 'content-type': 'application/json' } });
    const out = await handler(url, init ?? {});
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out ?? {}), { headers: { 'content-type': 'application/json' } });
  }) as unknown as Mock;
}

const problem = (status: number, title: string) => new Response(JSON.stringify({ type: 'about:blank', title, status }), { status, headers: { 'content-type': 'application/problem+json' } });
const posts = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && (i as RequestInit | undefined)?.method !== 'GET');

function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }
const show = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}><MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>,
);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const REQ = { id: 'r1', code: 'REQ-1', version: 1, title: 'Analyst', status: 'draft', filled: 0, positions: 1, employment_type: 'permanent', legal_entity_id: 'l', branch_id: 'b', department_id: null, designation: null, justification: 'Needed badly', budget_ctc_max: null, hiring_manager_id: 'e1', target_date: null, requested_by: 'u1', branch_name: 'HQ', applications: [] };

describe('QA-002 requisition edit', () => {
  const api = () => {
    let version = 1;
    return mockApi(['recruitment.manage', 'recruitment.read', 'recruitment.requisition'], (url, init) => {
      if (url.endsWith('/org')) return { legalEntities: [{ id: 'l', name: 'Co' }], branches: [{ id: 'b', name: 'HQ', legal_entity_id: 'l' }], departments: [] };
      if (url.includes('/requisitions/r1') && init.method === 'PUT') { version = 2; return { id: 'r1' }; }
      if (url.includes('/requisitions/r1')) return { ...REQ, version };
      if (url.includes('/requisitions')) return { items: [{ ...REQ, branch_name: 'HQ' }], page: 1, pageSize: 25, total: 1 };
      return { items: [] };
    });
  };
  it('shows the form alone instead of underneath the detail, and reloads the detail after saving', async () => {
    const f = api();
    show(<Recruitment />, '/recruitment?tab=requisitions');
    await userEvent.click(await screen.findByText('Analyst'));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    const form = screen.getByRole('dialog', { name: 'Edit REQ-1' });
    await userEvent.click(within(form).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(posts(f, '/requisitions/r1').some(([, i]) => (i as RequestInit).method === 'PUT')).toBe(true));
    await screen.findByRole('dialog', { name: /REQ-1/ });
    const gets = f.mock.calls.filter(([u, i]) => String(u).endsWith('/requisitions/r1') && !(i as RequestInit).method?.match(/PUT/)).length;
    await waitFor(() => expect(f.mock.calls.filter(([u]) => String(u).endsWith('/requisitions/r1')).length).toBeGreaterThanOrEqual(gets));
    expect(gets).toBeGreaterThanOrEqual(2); // fresh version after the edit, so the next edit cannot 409
  });
  it('goes back to the detail on cancel', async () => {
    api();
    show(<Recruitment />, '/recruitment?tab=requisitions');
    await userEvent.click(await screen.findByText('Analyst'));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit REQ-1' })).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  });
});

const SEP = { id: 's1', status: 'approved', employee: { id: 'e2', name: 'Bo', status: 'on_notice' }, employee_id: 'e2', notice_date: '2026-01-01', requested_lwd: '2026-02-01', approved_lwd: '2026-02-01', shortfall_days: 0, waive_shortfall: false, reason: 'Moving', initiated_by_name: 'Bo', notice_days_required: 30, fnf_status: 'not_started', fnf_note: null, checklist: null, leaveBalances: [], exit_interview: { reasonForLeaving: 'Relocation', whatWentWell: 'Team', _recorded_by: 'u9', _at: 'x' } };

describe('QA-003 exit interview', () => {
  const openForm = async (handler?: Handler) => {
    const f = mockApi(['lifecycle.manage', 'lifecycle.read', 'lifecycle.self'], (url, init) => {
      if (url.includes('/exit-interview') && handler) return handler(url, init);
      if (url.includes('/separations/s1')) return SEP;
      if (url.includes('/separations')) return { items: [{ ...SEP, employee_name: 'Bo', employee_code: 'E2' }], page: 1, pageSize: 25, total: 1 };
      return { items: [] };
    });
    show(<Lifecycle />, '/lifecycle?tab=separations');
    await userEvent.click(await screen.findByText('Bo', {}, { timeout: 2000 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Exit interview' }));
    return { f, form: await screen.findByRole('dialog', { name: 'Exit interview' }) };
  };
  it('opens with the recorded answers, so saving cannot wipe them', async () => {
    const { form } = await openForm();
    expect(within(form).getByLabelText<HTMLTextAreaElement>('Main reason for leaving').value).toBe('Relocation');
    expect(within(form).getByLabelText<HTMLTextAreaElement>('What worked well').value).toBe('Team');
  });
  it('keeps the form and the typed answers open when saving fails', async () => {
    const { form } = await openForm(() => problem(500, 'Could not save'));
    const box = within(form).getByLabelText<HTMLTextAreaElement>('What should we improve');
    await userEvent.type(box, 'Pay');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(form).getByRole('alert').textContent).toContain('Could not save'));
    expect(screen.getByRole('dialog', { name: 'Exit interview' })).toBeTruthy();
    expect(box.value).toBe('Pay');
  });
});

describe('QA-004 salary tab', () => {
  const emps = [{ id: 'a', first_name: 'Asha', last_name: 'Rao', employee_code: 'A1' }, { id: 'b', first_name: 'Ben', last_name: 'Roy', employee_code: 'B1' }];
  it("never shows employee A's statutory details under employee B while B loads or after it fails", async () => {
    let finishB: (r: Response) => void = () => undefined;
    mockApi(['payroll.read', 'payroll.manage'], (url) => {
      if (url.includes('/employees/a/statutory')) return { uan: 'UAN-OF-ASHA', pf_excluded: false, tax_regime: 'new', pan: null };
      if (url.includes('/employees/b/statutory')) return new Promise((res) => { finishB = res; });
      if (url.includes('/salaries')) return { items: [] };
      if (url.includes('/api/v1/employees')) return { items: emps };
      return { items: [] };
    });
    show(<Payroll />, '/payroll?tab=salaries');
    await userEvent.click(await screen.findByRole('combobox', { name: /employee/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Asha/ }));
    await screen.findByText(/UAN-OF-ASHA/);
    await userEvent.click(screen.getByRole('button', { name: /Clear Employee/ }));
    await userEvent.click(await screen.findByRole('combobox', { name: /employee/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Ben/ }));
    await waitFor(() => expect(screen.queryByText(/UAN-OF-ASHA/)).toBeNull());
    await act(async () => { finishB(problem(500, 'Statutory failed')); });
    expect(screen.queryByText(/UAN-OF-ASHA/)).toBeNull();
    expect((await screen.findAllByRole('alert')).some((a) => a.textContent?.includes('Statutory failed'))).toBe(true);
  });
});

describe('QA-005 destructive actions ask first', () => {
  it('finalizing payroll needs confirmation', async () => {
    const run = { id: 'p1', period: '2026-01', legal_entity_name: 'Co', kind: 'regular', status: 'approved', employees: 3, gross: 1, net: 1, warnings: 0, totals: {}, items: [], adjustments: [], attendanceLocked: true };
    const f = mockApi(['payroll.read', 'payroll.manage', 'payroll.approve'], (url) => {
      if (url.includes('/runs/p1/finalize')) return {};
      if (url.includes('/runs/p1')) return run;
      if (url.endsWith('/runs')) return { items: [run] };
      return { items: [], legalEntities: [] };
    });
    show(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByText('2026-01'));
    await userEvent.click(await screen.findByRole('button', { name: 'Finalize' }));
    expect(posts(f, '/finalize')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Finalize payroll' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Finalize' }));
    await waitFor(() => expect(posts(f, '/finalize')).toHaveLength(1));
  });
  it('a failed finalize keeps the confirmation open with the reason', async () => {
    const run = { id: 'p1', period: '2026-01', legal_entity_name: 'Co', kind: 'regular', status: 'approved', employees: 3, gross: 1, net: 1, warnings: 0, totals: {}, items: [], adjustments: [], attendanceLocked: true };
    mockApi(['payroll.read', 'payroll.manage', 'payroll.approve'], (url) => {
      if (url.includes('/runs/p1/finalize')) return problem(409, 'Attendance is not locked');
      if (url.includes('/runs/p1')) return run;
      if (url.endsWith('/runs')) return { items: [run] };
      return { items: [], legalEntities: [] };
    });
    show(<Payroll />, '/payroll?tab=runs');
    await userEvent.click(await screen.findByText('2026-01'));
    await userEvent.click(await screen.findByRole('button', { name: 'Finalize' }));
    const dlg = await screen.findByRole('dialog', { name: 'Finalize payroll' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Finalize' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Attendance is not locked');
  });
  it('rotating a device key needs confirmation and the new key cannot be dismissed by accident', async () => {
    const device = { id: 'd1', name: 'Gate', serial_number: 'S', api_key_prefix: 'k', branch_name: 'HQ', status: 'active', last_sync_at: null, last_clock_drift_seconds: null, last_error: null, unmapped_events: 0 };
    const f = mockApi(['attendance.devices.manage', 'attendance.configure'], (url) => {
      if (url.includes('rotate-key')) return { apiKey: 'NEW-SECRET-KEY' };
      if (url.endsWith('/attendance/devices')) return { items: [device] };
      if (url.includes('/installation')) return { modules: [{ key: 'attendance.biometric', usable: true, blockers: [] }] };
      return { items: [], branches: [], legalEntities: [], departments: [] };
    });
    show(<AttendanceAdmin />, '/attendance/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Biometric devices' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rotate key' }));
    expect(posts(f, 'rotate-key')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Rotate device key' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Rotate key' }));
    const keyDialog = await screen.findByRole('dialog', { name: 'Device API key' });
    expect(keyDialog.textContent).toContain('NEW-SECRET-KEY');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Device API key' })).toBeTruthy();
  });
  it('resetting two-factor needs confirmation', async () => {
    const user = { id: 'u2', email: 'b@x.test', display_name: 'Bo', status: 'active', roles: [], mfa_enabled: true, locked: false, employee_id: null };
    const f = mockApi(['users.manage', 'settings.read'], (url, init) => {
      if (init.method === 'PATCH') return {};
      if (url.includes('/tenant/users')) return { items: [user], page: 1, pageSize: 25, total: 1 };
      if (url.includes('/tenant/roles')) return { items: [] };
      return { items: [] };
    });
    show(<Routes><Route path="/settings/*" element={<SettingsCenter />} /></Routes>, '/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    await userEvent.click(await screen.findByRole('button', { name: /Reset two-factor/ }));
    expect(f.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Reset two-factor authentication' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(f.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toHaveLength(1));
  });
});
