import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';
import { problem } from './test/page';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const CONFIG = { brand: { productName: 'Acme HR', timezone: 'Asia/Kolkata' }, features: { FEATURE_LEAVE: true } };
const ME = { user: { id: 'u1', email: 'a@x.test', displayName: 'Asha', employeeId: 'e1' }, permissions: ['leave.self', 'leave.read'], roles: [], views: [], mfa: { enabled: false }, csrfToken: 'tok', organization: { id: 'o', name: 'Acme' } };

function Probe() {
  const a = useAuth();
  return (
    <div>
      <p data-testid="config">{a.config ? a.config.brand.productName : 'no config'}</p>
      <p data-testid="config-error">{a.configError ? `${a.configError.kind}:${a.configError.kind === 'temporary' ? a.configError.status : a.configError.message}` : 'none'}</p>
      <p data-testid="me">{a.loading ? 'loading' : a.me ? a.me.user.displayName : 'signed out'}</p>
      <p data-testid="ended">{String(a.sessionEnded)}</p>
      <p data-testid="can">{`${a.can('leave.self', 'leave.read')} ${a.can('leave.self', 'x')} ${a.canAny('x', 'leave.read')} ${a.canAny('x')}`}</p>
      <p data-testid="feature">{`${a.hasFeature('FEATURE_LEAVE')} ${a.hasFeature('FEATURE_PAYROLL')}`}</p>
      <p data-testid="challenge">{a.challenge?.method ?? 'none'}</p>
      <button type="button" onClick={() => void a.logout()}>logout</button>
      <button type="button" onClick={() => a.clearSessionEnded()}>clear</button>
      <button type="button" onClick={() => a.setChallenge({ method: 'email', delivery: 'sent' })}>challenge</button>
    </div>
  );
}
const mount = () => render(<MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter>);
const text = (id: string) => screen.getByTestId(id).textContent;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('session', () => {
  it('loads the config then the user, and answers permission and feature questions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => json(String(u).endsWith('/config/public') ? CONFIG : ME));
    mount();
    await waitFor(() => expect(text('me')).toBe('Asha'));
    expect(text('config')).toBe('Acme HR');
    expect(text('can')).toBe('true false true false');
    expect(text('feature')).toBe('true false');
  });
  it('nobody signed in is not an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => (String(u).endsWith('/config/public') ? json(CONFIG) : problem(401, 'Sign in')));
    mount();
    await waitFor(() => expect(text('me')).toBe('signed out'));
    expect(text('config-error')).toBe('none');
    expect(text('can')).toBe('false false false false');
  });
  it('logout posts, drops the user and the challenge, even if the request fails', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      if (String(u).endsWith('/config/public')) return json(CONFIG);
      if (String(u).endsWith('/auth/logout')) return problem(500, 'nope');
      return json(ME);
    });
    mount();
    await waitFor(() => expect(text('me')).toBe('Asha'));
    await userEvent.click(screen.getByRole('button', { name: 'challenge' }));
    expect(text('challenge')).toBe('email');
    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(text('me')).toBe('signed out'));
    expect(text('challenge')).toBe('none');
    expect(f.mock.calls.some((c) => String(c[0]).endsWith('/auth/logout'))).toBe(true);
  });
  it('a session the server ended is flagged once, only if someone was signed in', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => json(String(u).endsWith('/config/public') ? CONFIG : ME));
    mount();
    await waitFor(() => expect(text('me')).toBe('Asha'));
    act(() => { window.dispatchEvent(new Event('hrms:unauthorized')); });
    await waitFor(() => expect(text('ended')).toBe('true'));
    expect(text('me')).toBe('signed out');
    await userEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(text('ended')).toBe('false');
    act(() => { window.dispatchEvent(new Event('hrms:unauthorized')); });
    expect(text('ended')).toBe('false');
  });
});

describe('config failures', () => {
  it('a 404 means this address is not an installation, and it stops trying', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => problem(404, 'Unknown tenant'));
    mount();
    await waitFor(() => expect(text('config-error')).toBe('not_configured:Unknown tenant'));
    expect(text('me')).toBe('signed out');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('anything else is temporary, and it tries again until the config arrives', async () => {
    const real = globalThis.setTimeout;
    const later: (() => void)[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => { if (ms === 5000) { later.push(fn); return 0; } return real(fn, ms); }) as unknown as typeof setTimeout);
    let up = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      if (!up) return problem(503, 'Unavailable');
      return json(String(u).endsWith('/config/public') ? CONFIG : ME);
    });
    mount();
    await waitFor(() => expect(text('config-error')).toBe('temporary:503'));
    expect(later).toHaveLength(1);
    up = true;
    act(() => { later[0]!(); });
    await waitFor(() => expect(text('me')).toBe('Asha'));
    expect(text('config-error')).toBe('none');
  });
  it('an unreachable server is temporary too', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { unmount } = mount();
    await waitFor(() => expect(text('config-error')).toBe('temporary:0'));
    unmount();
  });
});
