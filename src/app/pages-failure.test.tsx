import { Component, Suspense, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { ToastProvider } from '../components/Toast';
import { ERROR_SURFACE_ATTR } from '../contract';
import { newTestClient } from '../test/render';
import { queryClient } from '../lib/query';
import { ROUTES } from './registry';

const ALL_PERMS = ['settings.read', 'settings.manage', 'users.manage', 'audit.read', 'org.read', 'org.manage', 'employees.read', 'employees.manage', 'employees.directory', 'employees.bank.read', 'attendance.self', 'attendance.read', 'attendance.team.read', 'attendance.configure', 'attendance.devices.manage', 'attendance.lock', 'attendance.recalculate', 'documents.read', 'documents.manage', 'expenses.self', 'expenses.read', 'expenses.pay', 'expenses.manage', 'performance.self', 'performance.manage', 'assets.self', 'assets.manage', 'cases.self', 'grievance.manage', 'posh.admin', 'payslips.self', 'payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory', 'lifecycle.self', 'lifecycle.read', 'lifecycle.manage', 'recruitment.requisition', 'recruitment.read', 'recruitment.manage', 'recruitment.approve', 'policies.self', 'policies.read', 'policies.manage', 'policies.publish', 'competency.self', 'training.manage', 'competency.read', 'competency.manage', 'competency.assess', 'competency.authorize', 'overtime.self', 'overtime.read', 'overtime.manage', 'field_duty.self', 'field_duty.read', 'field_duty.manage', 'travel.self', 'travel.read', 'travel.approve', 'loans.self', 'loans.read', 'loans.manage', 'accounting.export', 'accounting.configure', 'leave.self', 'leave.read', 'leave.manage', 'profile.self', 'approvals.delegations'];
const FLAGS = Object.fromEntries(ROUTES.flatMap((r) => r.flags ?? []).concat('FEATURE_PAYROLL_STATUTORY').map((f) => [f, true]));
const CONFIG = { product: { name: 'HR' }, brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: FLAGS, mode: 'multi', mfa: { available: true, enforced: false, methods: [] } };
const ME = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [{ key: 'x', name: 'X' }], permissions: ALL_PERMS, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };

const json = (status: number, body: unknown, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

function mockFailingApi(status: number) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/v1/config/public')) return json(200, CONFIG);
    if (url.endsWith('/api/v1/auth/me')) return json(200, ME);
    return json(status, { type: 'about:blank', title: status === 403 ? 'Forbidden' : 'Server exploded', status }, 'application/problem+json');
  });
}

class Catch extends Component<{ onCrash: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(e: unknown) { this.props.onCrash(e); }
  override render() { return this.state.failed ? <p>crashed</p> : this.props.children; }
}

const pagesToCheck = ROUTES.filter((r) => r.id !== 'account');

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); queryClient.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each([[500], [403]])('every page and tab on a failed first load (%i)', (status) => {
  it.each(pagesToCheck.map((r) => [r.id, r] as const))('%s neither crashes nor reads as empty', async (_id, route) => {
    mockFailingApi(status);
    const crash = vi.fn();
    const Page = await route.load();
    const path = route.path.replace(':id', 'e1');
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>
            <AuthProvider>
              <Catch onCrash={crash}>
                <Suspense fallback={null}>
                  <Routes><Route path={route.splat ? `${route.path}/*` : route.path} element={<Gate><Page /></Gate>} /></Routes>
                </Suspense>
              </Catch>
            </AuthProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('gate-ready')).not.toBeNull());
    const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    await settle();
    expect(crash, 'initial render').not.toHaveBeenCalled();
    // Visit each tab, because crash sites hide behind them.
    const tabCount = screen.queryAllByRole('tab').length + (document.querySelector('nav.tabs')?.querySelectorAll('a').length ?? 0);
    for (let i = 0; i < tabCount; i++) {
      const items = [...screen.queryAllByRole('tab'), ...(document.querySelector('nav.tabs')?.querySelectorAll('a') ?? [])];
      const el = items[i] as HTMLElement | undefined;
      if (!el) break;
      await act(async () => { el.click(); });
      await settle();
      expect(crash, `tab ${el.textContent}`).not.toHaveBeenCalled();
    }
    expect(document.querySelector(`[${ERROR_SURFACE_ATTR}]`), 'an error is on screen').not.toBeNull();
  }, 15000);
});

import { useAuth } from '../auth';
function Gate({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return me ? <div data-testid="gate-ready">{children}</div> : null;
}
