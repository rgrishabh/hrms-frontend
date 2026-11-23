import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { AuthProvider, useAuth } from '../auth';
import { ToastProvider } from '../components/Toast';
import { newTestClient } from './render';

/** The one harness for whole pages: real auth, toast and query providers, against a fake API. */
export type Handler = (url: string, init: RequestInit) => unknown;
export interface PageOptions { mode?: 'single' | 'single_hr' | 'multi'; mfa?: Partial<{ enabled: boolean; pending: boolean; enrollmentRequired: boolean; method: string | null; suggested: boolean }>; salaryLevel?: number; roles?: { key: string; name: string; group: string }[]; views?: { key: string; label: string }[]; resetByEmail?: boolean }

const json = (body: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

export const problem = (status: number, title: string, extra: object = {}) => json({ type: 'about:blank', title, status, ...extra }, status, 'application/problem+json');
export const problemResponse = problem;

const flagsToFeatures = (flags: readonly string[]) => Object.fromEntries(flags.map((f) => [f, true]));

/**
 * A signed-in user with these permissions and flags; every other request goes to the handler, which may return a
 * Response, or data to send as JSON. Flags are a list or a map, before or after the handler, as a page reads best.
 */
export function mockPageApi(permissions: readonly string[], flags: readonly string[], handler: Handler, employeeId?: string | null, options?: PageOptions): Mock;
export function mockPageApi(permissions: readonly string[], handler: Handler, features?: Record<string, boolean>, employeeId?: string | null, options?: PageOptions): Mock;
export function mockPageApi(permissions: readonly string[], second: readonly string[] | Handler, third?: Handler | Record<string, boolean>, employeeId: string | null = 'e1', options: PageOptions = {}): Mock {
  const handler = (typeof second === 'function' ? second : third) as Handler;
  const features = typeof second === 'function' ? ((third ?? {}) as Record<string, boolean>) : flagsToFeatures(second);
  const config = {
    product: { name: 'HR' },
    brand: { name: 'Acme', productName: 'Acme HR', primaryColor: '#14532d', currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY' },
    features,
    mode: options.mode ?? 'multi',
    mfa: { available: true, enforced: false, methods: [] },
    auth: { resetByEmail: options.resetByEmail ?? false },
  };
  const me = {
    user: { id: 'u1', email: 'a@x.test', displayName: 'A', employeeId },
    passwordChangeRequired: false,
    mfa: { enabled: false, pending: false, enrollmentRequired: false, method: null, suggested: false, ...options.mfa },
    roles: options.roles ?? [],
    views: options.views ?? [],
    mode: options.mode ?? 'multi',
    salaryLevel: options.salaryLevel ?? 0,
    permissions,
    csrfToken: 't',
    organization: { id: 'o', name: 'Acme' },
    preferences: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY', emailNotifications: true },
  };
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

/** A page with the providers, waiting for the session like the shell does. */
export const renderPage = (ui: ReactNode, route = '/') => render(
  <QueryClientProvider client={newTestClient()}>
    <MemoryRouter initialEntries={[route]}><ToastProvider><AuthProvider><Gate>{ui}</Gate></AuthProvider></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);
export const showPage = renderPage;

const method = (call: unknown[]) => (call[1] as RequestInit | undefined)?.method ?? 'GET';
/** Calls that are not GET, whose URL contains the text. */
export const writes = (f: Mock, part: string) => f.mock.calls.filter((c) => String(c[0]).includes(part) && method(c) !== 'GET');
export const reads = (f: Mock, part: string) => f.mock.calls.filter((c) => String(c[0]).includes(part) && method(c) === 'GET');
export const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
