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
export const problem = (status: number, title: string) => json({ type: 'about:blank', title, status }, status, 'application/problem+json');

/** A signed-in user with these permissions and flags; every other request goes to the handler. */
export function mockPageApi(perms: string[], flags: string[], handler: Handler): Mock {
  const config = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d', currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY' }, features: Object.fromEntries(flags.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions: perms, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return json(config);
    if (url.endsWith('/auth/me')) return json(me);
    const out = await handler(url, init ?? {});
    return out instanceof Response ? out : json(out ?? {});
  }) as unknown as Mock;
}

function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }

export const showPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}><MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>,
);

/** Calls that are not GETs, whose URL contains the given text. */
export const writes = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && !!(i as RequestInit | undefined)?.method && (i as RequestInit).method !== 'GET');
