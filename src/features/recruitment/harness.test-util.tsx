import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../../auth';
import { ToastProvider } from '../../components/Toast';
import { newTestClient } from '../../test/render';

const FLAGS = ['FEATURE_RECRUITMENT', 'FEATURE_ONBOARDING', 'FEATURE_OFFBOARDING', 'FEATURE_PERFORMANCE_REVIEW'];
const CONFIG = { brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d' }, features: Object.fromEntries(FLAGS.map((f) => [f, true])), mode: 'multi', mfa: { available: true } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });

export const problem = (status: number, title: string) => json({ type: 'about:blank', title, status }, status);

export type Handler = (url: string, method: string, body: unknown) => unknown;

/** Signs in with these permissions and answers the API from the handler. Returns the fetch mock. */
export function mockApi(permissions: string[], handler: Handler): Mock {
  const me = { user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId: 'e1' }, passwordChangeRequired: false, mfa: { enabled: false, pending: false, enrollmentRequired: false }, roles: [], permissions, csrfToken: 't', organization: { id: 'o', name: 'Acme' }, preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/config/public')) return json(CONFIG);
    if (url.endsWith('/auth/me')) return json(me);
    const out = await handler(url, init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : undefined);
    return out instanceof Response ? out : json(out ?? {});
  }) as unknown as Mock;
}

/** The calls to the API that were not reads, for one path fragment. */
export const writes = (f: Mock, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && (i as RequestInit | undefined)?.method && (i as RequestInit).method !== 'GET');

function Gate({ children }: { children: ReactNode }) { const { me } = useAuth(); return me ? <>{children}</> : null; }

export const showPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}><MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>,
);
