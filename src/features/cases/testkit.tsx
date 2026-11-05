import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../../auth';
import { ToastProvider } from '../../components/Toast';
import { newTestClient } from '../../test/render';

export type Handler = (url: string, init: RequestInit) => unknown;

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
export const problem = (status: number, title: string) => new Response(JSON.stringify({ type: 'about:blank', title, status }), { status, headers: { 'content-type': 'application/problem+json' } });

/** A signed-in page against a fake API. The handler answers everything but config and identity. */
export function mockSession(perms: readonly string[], flags: readonly string[], handler: Handler): Mock {
  const config = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: Object.fromEntries(flags.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions: perms, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return jsonResponse(config);
    if (url.endsWith('/auth/me')) return jsonResponse(me);
    const out = await handler(url, init ?? {});
    return out instanceof Response ? out : jsonResponse(out ?? {});
  }) as unknown as Mock;
}

export const posted = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && !!(i as RequestInit | undefined)?.method && (i as RequestInit).method !== 'GET');

function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }
function Where() { const l = useLocation(); return <output data-testid="where" hidden>{l.search}</output>; }

export const showPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}>
    <MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}<Where /></Gate></AuthProvider></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);
