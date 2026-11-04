import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../auth';
import { ToastProvider } from '../components/Toast';
import { newTestClient } from './render';

export type Handler = (url: string, init: RequestInit) => unknown;

const json = (body: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
export const problem = (status: number, title: string, extra: object = {}) => json({ type: 'about:blank', title, status, ...extra }, status, 'application/problem+json');

/** Answers config and session, then asks the handler. A handler may return a Response, or data to send as JSON. */
export function mockPageApi(permissions: readonly string[], handler: Handler, features: Record<string, boolean> = {}, employeeId: string | null = 'e1'): Mock {
  const config = { product: { name: 'HR' }, brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features, mode: 'multi', mfa: { available: true, enforced: false, methods: [] } };
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return json(config);
    if (url.endsWith('/auth/me')) return json(me);
    const out = await handler(url, init ?? {});
    return out instanceof Response ? out : json(out ?? {});
  }) as unknown as Mock;
}

function Gate({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return me ? <>{children}</> : null;
}

/** A page with the real auth, toast and query providers, waiting for the session like the shell does. */
export const renderPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}>
    <MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

/** Calls that are not GET, for asserting what a screen changed. */
export const writes = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && ((i as RequestInit | undefined)?.method ?? 'GET') !== 'GET');
export const reads = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && ((i as RequestInit | undefined)?.method ?? 'GET') === 'GET');
