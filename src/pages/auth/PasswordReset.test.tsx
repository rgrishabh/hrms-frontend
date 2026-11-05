import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeConfig } from '../../lib/config';
import { bodyOf, mockPageApi, problem, renderPage, writes } from '../../test/page';
import { ForgotPassword, ResetPassword } from './PasswordReset';
import { Setup } from './Setup';

const cfg = normalizeConfig({ brand: { productName: 'Acme HR' } });
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const GOOD = 'a-long-enough-password';

const typeNew = async (password = GOOD, confirm = password) => {
  await userEvent.type(await screen.findByLabelText(/^New password/), password);
  await userEvent.type(screen.getByLabelText(/^Confirm new password/), confirm);
};

afterEach(() => { history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

describe('forgot password', () => {
  it('sends the address and answers the same whether or not it exists', async () => {
    const f = mockPageApi([], [], () => ({}));
    renderPage(<ForgotPassword cfg={cfg} />);
    await userEvent.type(await screen.findByLabelText(/Work email/), 'a@x.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText(/If a@x.test has an account here/)).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/password/forgot')[0]!)).toEqual({ email: 'a@x.test' });
  });
  it('a failed request keeps the form with the reason', async () => {
    mockPageApi([], [], () => problem(429, 'Too many requests'));
    renderPage(<ForgotPassword cfg={cfg} />);
    await userEvent.type(await screen.findByLabelText(/Work email/), 'a@x.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many requests');
    expect((screen.getByLabelText(/Work email/) as HTMLInputElement).value).toBe('a@x.test');
  });
  it('a field error from the server lands on the email field', async () => {
    mockPageApi([], [], () => problem(422, 'Check the fields', { errors: [{ path: 'email', message: 'Not a work address' }] }));
    renderPage(<ForgotPassword cfg={cfg} />);
    await userEvent.type(await screen.findByLabelText(/Work email/), 'a@x.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Not a work address')).toBeTruthy();
    expect(screen.getByLabelText(/Work email/).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('reset password', () => {
  it('a link without a token says so and offers a new one', async () => {
    mockPageApi([], [], () => ({}));
    renderPage(<ResetPassword cfg={cfg} />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toBe('/forgot-password');
  });
  it('reads the token from the fragment, clears it from the address, and posts it with the password', async () => {
    window.location.hash = '#token=tok-1';
    const f = mockPageApi([], [], () => ({}));
    renderPage(<><ResetPassword cfg={cfg} /><Where /></>, '/reset-password');
    await typeNew();
    expect(window.location.hash).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/password/reset')[0]!)).toEqual({ token: 'tok-1', newPassword: GOOD });
    await userEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
  });
  it('passwords that differ are stopped here, with no request', async () => {
    window.location.hash = '#token=tok-1';
    const f = mockPageApi([], [], () => ({}));
    renderPage(<ResetPassword cfg={cfg} />);
    await typeNew(GOOD, `${GOOD}x`);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The passwords do not match.')).toBeTruthy();
    expect(writes(f, '/password/reset')).toHaveLength(0);
  });
  it('a weak password shows the reasons on the password field, once', async () => {
    window.location.hash = '#token=tok-1';
    mockPageApi([], [], () => problem(422, 'Weak', { code: 'weak_password', problems: ['breached', 'personal'] }));
    renderPage(<ResetPassword cfg={cfg} />);
    await typeNew();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.textContent).toBe('Choose a different password. It appears on a list of leaked passwords. It contains part of your name or email.');
    expect(screen.getByLabelText(/^New password/).getAttribute('aria-invalid')).toBe('true');
  });
  it('an expired link shows the server reason and keeps the form', async () => {
    window.location.hash = '#token=tok-1';
    mockPageApi([], [], () => problem(410, 'This link has expired'));
    renderPage(<ResetPassword cfg={cfg} />);
    await typeNew();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This link has expired');
    expect(screen.getByRole('link', { name: /Send a new one/ })).toBeTruthy();
  });
});

describe('invitation setup', () => {
  it('a link without a token says so', async () => {
    mockPageApi([], [], () => ({}));
    renderPage(<Setup cfg={cfg} />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
  });
  it('posts the token and password, then sends the person to sign in', async () => {
    window.location.hash = '#token=inv-9';
    const f = mockPageApi([], [], () => ({}));
    renderPage(<><Setup cfg={cfg} /><Where /></>, '/setup');
    expect(await screen.findByText(/Welcome to Acme HR/)).toBeTruthy();
    await typeNew();
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('heading', { name: 'Password set' })).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/setup')[0]!)).toEqual({ token: 'inv-9', newPassword: GOOD });
    await userEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
  });
  it('passwords that differ never reach the server', async () => {
    window.location.hash = '#token=inv-9';
    const f = mockPageApi([], [], () => ({}));
    renderPage(<Setup cfg={cfg} />);
    await typeNew(GOOD, 'something-else-entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('The passwords do not match.')).toBeTruthy();
    expect(writes(f, '/auth/setup')).toHaveLength(0);
  });
  it('a used link keeps the form with the reason', async () => {
    window.location.hash = '#token=inv-9';
    mockPageApi([], [], () => problem(410, 'This invitation was already used'));
    renderPage(<Setup cfg={cfg} />);
    await typeNew();
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This invitation was already used');
  });
});
