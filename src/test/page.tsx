import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../auth';
import { ToastProvider } from '../components/Toast';
import { newTestClient } from './render';

type Handler = (url: string, init: RequestInit) => unknown;

/** A whole page against a fake API: signed in with these permissions and flags. Other calls go to the handler. */
export function mockPageApi(perms: readonly string[], flags: readonly string[], handler: Handler, employeeId = 'e1'): Mock {
  const config = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: Object.fromEntries(flags.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions: perms, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return json(config);
    if (url.endsWith('/auth/me')) return json(me);
    const out = await handler(url, init ?? {});
    return out instanceof Response ? out : json(out ?? {});
  }) as unknown as Mock;
}

export const problemResponse = (status: number, title: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ type: 'about:blank', title, status, ...extra }), { status, headers: { 'content-type': 'application/problem+json' } });

/** Calls to a URL containing `part`, other than reads. */
export const writes = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && !['GET', undefined].includes((i as RequestInit | undefined)?.method));
export const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }

export const showPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}><MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>,
);
