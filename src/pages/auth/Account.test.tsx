import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { bodyOf, mockPageApi, problem, renderPage, reads, writes, type PageOptions } from '../../test/page';
import { Account } from './Account';

const session = (over = {}) => ({ id: 's1', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', ip: '10.0.0.1', last_seen_at: '2026-10-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', current: false, ...over });
const CURRENT = session({ id: 'me', current: true, ip: null, user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0' });
type Over = (url: string, init: RequestInit) => unknown;
const api = (over: Over = () => undefined, sessions: unknown[] = [CURRENT]) => (url: string, init: RequestInit) => {
  const x = over(url, init);
  if (x !== undefined) return x;
  if (url.endsWith('/auth/sessions')) return { items: sessions };
  return {};
};
const show = (over?: Over, options: PageOptions = {}, flags: string[] = [], sessions?: unknown[]) => {
  const f = mockPageApi([], flags, api(over, sessions), 'e1', options);
  renderPage(<Account />, '/account');
  return f;
};
const toast = (text: string | RegExp) => screen.findByText(text);
const meCalls = (f: Mock) => reads(f, '/auth/me').length;
const OFF_CONFIG_NOTE = 'Add a second step at sign-in, with an authenticator app or by email.';

afterEach(() => { vi.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); });

describe('appearance', () => {
  it('shows the saved theme and applies a new choice to the page and storage', async () => {
    localStorage.setItem('hrms.theme', 'dark');
    show();
    const theme = await screen.findByLabelText('Theme') as HTMLSelectElement;
    expect(theme.value).toBe('dark');
    await userEvent.selectOptions(theme, 'light');
    expect(localStorage.getItem('hrms.theme')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    await userEvent.selectOptions(theme, 'system');
    expect(localStorage.getItem('hrms.theme')).toBeNull();
  });
});

describe('email notifications', () => {
  it('is hidden when the feature is off', async () => {
    show();
    await screen.findByRole('heading', { name: 'My account' });
    expect(screen.queryByRole('checkbox', { name: /Email me/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Push notifications' })).toBeNull();
  });
  it('saves the choice, refreshes the profile and confirms', async () => {
    const f = show(undefined, {}, ['FEATURE_EMAIL_NOTIFICATIONS']);
    const box = await screen.findByRole('checkbox', { name: /Email me/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    const before = meCalls(f);
    await userEvent.click(box);
    expect(await toast('Email notifications off')).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/preferences')[0]!)).toEqual({ emailNotifications: false });
    expect(writes(f, '/api/v1/auth/preferences')[0]![1]).toMatchObject({ method: 'PUT' });
    expect(meCalls(f)).toBeGreaterThan(before);
  });
  it('a refused change shows the reason', async () => {
    show((url) => (url.endsWith('/preferences') ? problem(500, 'Could not save preferences') : undefined), {}, ['FEATURE_EMAIL_NOTIFICATIONS']);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Email me/ }));
    expect(await toast('Could not save preferences')).toBeTruthy();
  });
  it('the push card appears with its feature', async () => {
    show(undefined, {}, ['FEATURE_PUSH_NOTIFICATIONS']);
    expect(await screen.findByRole('heading', { name: 'Push notifications' })).toBeTruthy();
    expect(screen.getByText('This browser does not support push notifications.')).toBeTruthy();
  });
});

describe('change password', () => {
  const fill = async (next = 'a-long-enough-password', confirm = next) => {
    await userEvent.type(await screen.findByLabelText(/^Current password/), 'old-password');
    await userEvent.type(screen.getByLabelText(/^New password/), next);
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };
  it('posts both passwords, clears the form and confirms', async () => {
    const f = show();
    await fill();
    expect(await toast('Password changed')).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/password')[0]!)).toEqual({ currentPassword: 'old-password', newPassword: 'a-long-enough-password' });
    expect((screen.getByLabelText(/^Current password/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe('');
  });
  it('passwords that differ never reach the server', async () => {
    const f = show();
    await fill('a-long-enough-password', 'another-long-password');
    expect(await screen.findByText('The passwords do not match.')).toBeTruthy();
    expect(writes(f, '/api/v1/auth/password')).toHaveLength(0);
  });
  it('a wrong current password lands on its field and keeps what was typed', async () => {
    show((url) => (url.endsWith('/auth/password') ? problem(422, 'Check the fields', { errors: [{ path: 'currentPassword', message: 'That is not your password' }] }) : undefined));
    await fill();
    expect(await screen.findByText('That is not your password')).toBeTruthy();
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe('a-long-enough-password');
  });
  it('a weak new password shows the reason on the new password', async () => {
    show((url) => (url.endsWith('/auth/password') ? problem(422, 'Weak', { code: 'weak_password', problems: ['too_simple'] }) : undefined));
    await fill();
    expect(await screen.findByText('Choose a different password. It is too repetitive.')).toBeTruthy();
    expect(screen.getByLabelText(/^New password/).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('sessions', () => {
  const uas: [string, string][] = [
    ['Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120', 'Edge on Windows'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/120 Safari/537', 'Chrome on Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17 Safari/604', 'Safari on iOS'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari/605', 'Safari on macOS'],
    ['curl/8.0', 'Browser'],
  ];
  it('names each browser and marks this device, which has no sign-out button', async () => {
    show(undefined, {}, [], [CURRENT, ...uas.map(([user_agent], i) => session({ id: `s${i}`, user_agent }))]);
    const list = await screen.findByRole('list', { name: 'Signed-in sessions' });
    expect(within(list).getByText('Firefox on Linux').closest('li')!.textContent).toContain('This device');
    expect(within(within(list).getByText('Firefox on Linux').closest('li')!).queryByRole('button')).toBeNull();
    for (const [, name] of uas) expect(within(list).getByText(name)).toBeTruthy();
    expect(within(list).getByText('Edge on Windows').closest('li')!.textContent).toContain('From 10.0.0.1.');
  });
  it('no sessions says so', async () => {
    show(undefined, {}, [], []);
    expect(await screen.findByText('No other sessions.')).toBeTruthy();
  });
  it('signs out another session after asking, with a DELETE of that session', async () => {
    const f = show(undefined, {}, [], [CURRENT, session()]);
    await userEvent.click(await screen.findByRole('button', { name: /Sign out Safari on macOS/ }));
    expect(writes(f, '/auth/sessions')).toHaveLength(0);
    const dlg = await screen.findByRole('dialog', { name: 'Sign out this session' });
    expect(within(dlg).getByText('Safari on macOS will have to sign in again.')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Sign out' }));
    expect(await toast('Session signed out')).toBeTruthy();
    const call = writes(f, '/api/v1/auth/sessions/s1')[0]!;
    expect((call[1] as RequestInit).method).toBe('DELETE');
  });
  it('a failed sign-out of a session tells the person', async () => {
    show((url, init) => (init.method === 'DELETE' ? problem(404, 'That session has gone') : undefined), {}, [], [CURRENT, session()]);
    await userEvent.click(await screen.findByRole('button', { name: /Sign out Safari on macOS/ }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Sign out this session' })).getByRole('button', { name: 'Sign out' }));
    expect(await toast('That session has gone')).toBeTruthy();
  });
  it('Cancel leaves the session alone', async () => {
    const f = show(undefined, {}, [], [CURRENT, session()]);
    await userEvent.click(await screen.findByRole('button', { name: /Sign out Safari on macOS/ }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Sign out this session' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, '/auth/sessions')).toHaveLength(0);
  });
  it('signing out everywhere revokes all, then ends this session too', async () => {
    const f = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Sign out everywhere' })).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(writes(f, '/api/v1/auth/logout')).toHaveLength(1));
    expect(writes(f, '/api/v1/auth/sessions/revoke-all')).toHaveLength(1);
  });
  it('a failed revoke keeps the dialog with the reason and does not sign out', async () => {
    const f = show((url) => (url.endsWith('/revoke-all') ? problem(500, 'Could not revoke') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    const dlg = await screen.findByRole('dialog', { name: 'Sign out everywhere' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Sign out everywhere' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Could not revoke');
    expect(writes(f, '/auth/logout')).toHaveLength(0);
  });
});

describe('two-factor authentication: off', () => {
  it('suggests it to someone who can read pay', async () => {
    show(undefined, { mfa: { suggested: true } });
    expect(await screen.findByText(/You can read pay or bank details/)).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
  });
  it('does not nag anyone else', async () => {
    show();
    expect(await screen.findByText(OFF_CONFIG_NOTE)).toBeTruthy();
    expect(screen.queryByText(/You can read pay or bank details/)).toBeNull();
  });
  it('enrols from the card and confirms', async () => {
    const f = show((url) => {
      if (url.endsWith('/mfa/methods')) return { methods: [{ method: 'email', usable: true }] };
      if (url.endsWith('/email/enable')) return { recoveryCodes: ['aaaa-bbbb'] };
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send the code' }));
    await userEvent.type(await screen.findByLabelText(/Code from the email/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /I have saved/ }));
    const before = meCalls(f);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await toast('Two-factor authentication is on')).toBeTruthy();
    expect(meCalls(f)).toBeGreaterThan(before);
  });
});

describe('two-factor authentication: on', () => {
  const APP = { mfa: { enabled: true, method: 'totp' } };
  const EMAIL = { mfa: { enabled: true, method: 'email' } };
  it('says which method is on', async () => {
    show(undefined, EMAIL);
    expect(await screen.findByText('On: Email codes')).toBeTruthy();
  });
  it('an unknown method still reads as on', async () => {
    show(undefined, { mfa: { enabled: true, method: null } });
    expect(await screen.findByText('On: Authenticator app')).toBeTruthy();
  });
  it('generates new recovery codes with a current code, then returns to the card', async () => {
    const f = show((url) => (url.endsWith('/recovery-codes') ? { recoveryCodes: ['new1-new1', 'new2-new2'] } : undefined), APP);
    await userEvent.click(await screen.findByRole('button', { name: 'New recovery codes' }));
    await userEvent.type(screen.getByLabelText(/Current code from your app/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('new1-new1')).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/mfa/recovery-codes')[0]!)).toEqual({ code: '123456' });
    await userEvent.click(screen.getByRole('checkbox', { name: /I have saved/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'New recovery codes' })).toBeTruthy();
    expect(screen.queryByText('new1-new1')).toBeNull();
  });
  it('a wrong code keeps the form with the reason, and Cancel leaves', async () => {
    show((url) => (url.endsWith('/recovery-codes') ? problem(400, 'That code is not right') : undefined), EMAIL);
    await userEvent.click(await screen.findByRole('button', { name: 'New recovery codes' }));
    expect(await screen.findByRole('button', { name: 'Send a code' })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Current code from your email/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right');
    expect((screen.getByLabelText(/Current code from your email/) as HTMLInputElement).value).toBe('123456');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'New recovery codes' })).toBeTruthy();
  });
  it('turning off needs the password and a code, and confirms', async () => {
    const f = show(undefined, APP);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    await userEvent.type(screen.getByLabelText(/^Password/), 'my-password');
    await userEvent.type(screen.getByLabelText(/Code from your app, or a recovery code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await toast('Two-factor authentication is off')).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/mfa/disable')[0]!)).toEqual({ password: 'my-password', code: '123456' });
  });
  it('a refused turn-off stays with the reason; Cancel keeps it on', async () => {
    show((url) => (url.endsWith('/mfa/disable') ? problem(403, 'Your password is wrong') : undefined), EMAIL);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(await screen.findByRole('button', { name: 'Send a code' })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/^Password/), 'bad');
    await userEvent.type(screen.getByLabelText(/Code from your email, or a recovery code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Your password is wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'New recovery codes' })).toBeTruthy();
  });
});
