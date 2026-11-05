import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { act, render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../auth';
import { normalizeConfig } from '../../lib/config';
import { bodyOf, mockPageApi, problem, renderPage, writes } from '../../test/page';
import { newTestClient } from '../../test/render';
import { Login } from './Login';

const cfg = (brand = {}, auth = {}) => normalizeConfig({ brand: { productName: 'Acme HR', ...brand }, auth });
const Challenge = () => { const { challenge } = useAuth(); return <output>{challenge ? `${challenge.method}/${challenge.delivery}` : 'no challenge'}</output>; };

const fill = async () => {
  await userEvent.type(await screen.findByLabelText(/Work email/), 'a@x.test');
  await userEvent.type(screen.getByLabelText(/^Password/), 'correct-horse');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

afterEach(() => { vi.restoreAllMocks(); });

describe('sign in', () => {
  it('posts the email and password, then asks who is signed in', async () => {
    const f = mockPageApi([], [], (url) => (url.endsWith('/auth/login') ? { mfaRequired: false } : {}));
    renderPage(<><Login cfg={cfg()} /><Challenge /></>);
    await fill();
    await waitFor(() => expect(writes(f, '/api/v1/auth/login')).toHaveLength(1));
    expect(bodyOf(writes(f, '/api/v1/auth/login')[0]!)).toEqual({ email: 'a@x.test', password: 'correct-horse' });
    expect(screen.getByText('no challenge')).toBeTruthy();
    await waitFor(() => expect(f.mock.calls.filter((c) => String(c[0]).endsWith('/auth/me')).length).toBeGreaterThan(1));
  });
  it('keeps the second-step method and delivery the server asked for', async () => {
    mockPageApi([], [], (url) => (url.endsWith('/auth/login') ? { mfaRequired: true, mfaMethod: 'email', mfaDelivery: 'sent' } : {}));
    renderPage(<><Login cfg={cfg()} /><Challenge /></>);
    await fill();
    expect(await screen.findByText('email/sent')).toBeTruthy();
  });
  it('a refused sign-in shows the reason and keeps what was typed', async () => {
    mockPageApi([], [], () => problem(401, 'Email or password is wrong'));
    renderPage(<Login cfg={cfg()} />);
    await fill();
    expect((await screen.findByRole('alert')).textContent).toContain('Email or password is wrong');
    expect((screen.getByLabelText(/Work email/) as HTMLInputElement).value).toBe('a@x.test');
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('what the page offers', () => {
  it('shows the login message and offers a reset only when email can reach people', async () => {
    mockPageApi([], [], () => ({}));
    const { unmount } = renderPage(<Login cfg={cfg({ loginMessage: 'Use your company account' }, { resetByEmail: true })} />);
    expect(await screen.findByText('Use your company account')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Forgot your password?' }).getAttribute('href')).toBe('/forgot-password');
    unmount();
    renderPage(<Login cfg={cfg()} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('link', { name: 'Forgot your password?' })).toBeNull();
  });
  it('after the server ends the session, says why, once', async () => {
    mockPageApi([], [], () => ({}));
    const Gate = () => {
      const { me, config } = useAuth();
      if (!config) return null;
      return me ? <p>Signed in</p> : <Login cfg={config} />;
    };
    render(<QueryClientProvider client={newTestClient()}><MemoryRouter><AuthProvider><Gate /></AuthProvider></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Signed in');
    act(() => { window.dispatchEvent(new Event('hrms:unauthorized')); });
    expect((await screen.findByText(/Your session ended/)).textContent).toContain('without activity');
  });
});
