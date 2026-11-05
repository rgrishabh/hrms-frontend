import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, renderPage, writes } from '../../test/page';
import { renderUi } from '../../test/render';
import { MfaEnroll, MfaVerify, RecoveryCodes, SendCodeButton } from './Mfa';

const CODES = ['aaaa-bbbb-cccc', 'dddd-eeee-ffff'];
const TOTP = { secret: 'ABCDEFGHIJKLMNOP', otpauthUri: 'otpauth://totp/Acme:a@x.test?secret=ABCDEFGHIJKLMNOP' };
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('second step at sign-in', () => {
  it('with an app, posts the trimmed code and finishes', async () => {
    const f = mockPageApi([], [], () => ({}));
    const onDone = vi.fn();
    renderPage(<MfaVerify method="totp" delivery={null} onDone={onDone} />);
    expect(await screen.findByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send another code/ })).toBeNull();
    await userEvent.type(screen.getByLabelText(/^Code/), '123456');
    await userEvent.click(button('Verify'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(bodyOf(writes(f, '/api/v1/auth/mfa/verify')[0]!)).toEqual({ code: '123456' });
  });
  it('by email, the wording follows what happened to the message', async () => {
    mockPageApi([], [], () => ({}));
    const { rerender } = renderPage(<MfaVerify method="email" delivery="sent" onDone={() => undefined} />);
    expect(await screen.findByText(/We sent a 6-digit code to your email/)).toBeTruthy();
    expect(button('Send another code')).toBeTruthy();
    rerender(<></>);
    renderUi(<MfaVerify method="email" delivery="wait" onDone={() => undefined} />);
    expect(screen.getByText(/A code was sent a moment ago/)).toBeTruthy();
    renderUi(<MfaVerify method="email" delivery={null} onDone={() => undefined} />);
    expect(screen.getByText('Enter the 6-digit code from your email.')).toBeTruthy();
  });
  it('when email cannot be sent, opens on recovery codes, and can go back', async () => {
    mockPageApi([], [], () => ({}));
    renderPage(<MfaVerify method="email" delivery="unavailable" onDone={() => undefined} />);
    expect(await screen.findByText('Enter one of your recovery codes. Each works once.')).toBeTruthy();
    const input = screen.getByLabelText(/Recovery code/) as HTMLInputElement;
    expect(input.maxLength).toBe(20);
    await userEvent.type(input, 'abcd');
    await userEvent.click(button('Use a code from email'));
    expect((screen.getByLabelText(/^Code/) as HTMLInputElement).value).toBe('');
    expect(button('Send another code')).toBeTruthy();
  });
  it('an app user can switch to a recovery code and back', async () => {
    mockPageApi([], [], () => ({}));
    renderPage(<MfaVerify method="totp" delivery={null} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    expect(screen.getByLabelText(/Recovery code/)).toBeTruthy();
    await userEvent.click(button('Use authenticator code'));
    expect(screen.getByLabelText(/^Code/)).toBeTruthy();
  });
  it('a wrong code keeps the form with the reason', async () => {
    mockPageApi([], [], () => problem(400, 'That code is not right'));
    const onDone = vi.fn();
    renderPage(<MfaVerify method="totp" delivery={null} onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText(/^Code/), '000000');
    await userEvent.click(button('Verify'));
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right');
    expect((screen.getByLabelText(/^Code/) as HTMLInputElement).value).toBe('000000');
    expect(button('Verify').disabled).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });
  it('too many guesses lock the Verify button', async () => {
    mockPageApi([], [], () => problem(423, 'Too many attempts', { code: 'mfa_locked' }));
    renderPage(<MfaVerify method="totp" delivery={null} onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText(/^Code/), '000000');
    await userEvent.click(button('Verify'));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts');
    expect(button('Verify').disabled).toBe(true);
  });
  it('a session that ended reloads the page, because the form is of no more use', async () => {
    mockPageApi([], [], () => problem(401, 'Session ended'));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderUi(<MfaVerify method="totp" delivery={null} onDone={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/^Code/), '000000');
    await userEvent.click(button('Verify'));
    expect((await screen.findByRole('alert')).textContent).toContain('Session ended');
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1), { timeout: 10000 });
  });
});

describe('send another code', () => {
  it('posts, says so, and holds the button while counting down', async () => {
    const f = mockPageApi([], [], () => ({}));
    const onSent = vi.fn();
    renderPage(<SendCodeButton onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send another code' }));
    expect(await screen.findByText('A new code is on its way.')).toBeTruthy();
    expect(writes(f, '/api/v1/auth/mfa/email/send')).toHaveLength(1);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole('button', { name: /Send another code \(\d+s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByRole('button', { name: /\(59s\)|\(58s\)/ }, { timeout: 5000 })).toBeTruthy();
  });
  it('a rate limit shows the reason and waits as long as the server asks', async () => {
    mockPageApi([], [], () => new Response(JSON.stringify({ type: 'about:blank', title: 'Slow down.', status: 429 }), { status: 429, headers: { 'content-type': 'application/problem+json', 'retry-after': '30' } }));
    const onSent = vi.fn();
    renderPage(<SendCodeButton url="/api/v1/auth/mfa/email/setup" label="Send a code" onSent={onSent} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send a code' }));
    expect(await screen.findByText('Slow down. Try again in 30 seconds.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send a code (30s)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSent).not.toHaveBeenCalled();
  });
  it('a failure with no wait leaves the button usable', async () => {
    mockPageApi([], [], () => problem(500, 'Mail is down'));
    renderPage(<SendCodeButton />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send another code' }));
    expect(await screen.findByText('Mail is down')).toBeTruthy();
    expect(button('Send another code').disabled).toBe(false);
  });
});

describe('recovery codes', () => {
  it('shows the codes, copies and offers them as a file, and holds Continue until saved', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onDone = vi.fn();
    renderUi(<RecoveryCodes codes={CODES} onDone={onDone} />);
    expect(screen.getByText(CODES[0]!)).toBeTruthy();
    await user.click(button('Copy'));
    expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
    const file = screen.getByRole('link', { name: 'Download' });
    expect(file.getAttribute('download')).toBe('recovery-codes.txt');
    expect(decodeURIComponent(file.getAttribute('href')!)).toContain(CODES.join('\n'));
    expect(button('Continue').disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I have saved/ }));
    await user.click(button('Continue'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

const methods = (...m: { method: string; usable: boolean; reason?: string }[]) => ({ methods: m });

describe('enrolment: choosing a method', () => {
  it('nothing usable says so and gives each reason', async () => {
    mockPageApi([], [], () => methods({ method: 'totp', usable: false, reason: 'Switched off here' }, { method: 'email', usable: false, reason: 'Email is not set up' }));
    renderPage(<MfaEnroll onDone={() => undefined} intro="Your organization requires this" />);
    expect(await screen.findByText(/No method can be set up right now/)).toBeTruthy();
    expect(screen.getByText('Your organization requires this')).toBeTruthy();
    expect(screen.getByText('Switched off here')).toBeTruthy();
    expect(screen.getByText('Email is not set up')).toBeTruthy();
    expect(button('Use an authenticator app').disabled).toBe(true);
    expect(button('Use codes sent by email').disabled).toBe(true);
  });
  it('a choice of two asks, and starts what was chosen', async () => {
    const f = mockPageApi([], [], (url) => (url.endsWith('/mfa/methods') ? methods({ method: 'totp', usable: true }, { method: 'email', usable: true }) : TOTP));
    renderPage(<MfaEnroll onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use an authenticator app' }));
    expect(await screen.findByLabelText(/Code from the app/)).toBeTruthy();
    await waitFor(() => expect(writes(f, '/api/v1/auth/mfa/setup')).toHaveLength(1));
  });
});

describe('enrolment: authenticator app', () => {
  const api = (over: (url: string) => unknown = () => undefined) => (url: string) => {
    const x = over(url);
    if (x !== undefined) return x;
    if (url.endsWith('/mfa/methods')) return methods({ method: 'totp', usable: true }, { method: 'email', usable: false, reason: 'No mail' });
    if (url.endsWith('/mfa/setup')) return TOTP;
    if (url.endsWith('/mfa/enable')) return { recoveryCodes: CODES };
    return {};
  };
  it('shows the key in groups and a QR code, enables with the code, and ends on the recovery codes', async () => {
    const f = mockPageApi([], [], api());
    const onDone = vi.fn();
    renderPage(<MfaEnroll onDone={onDone} />);
    expect((await screen.findByTestId('totp-secret')).textContent).toBe('ABCD EFGH IJKL MNOP');
    expect((await screen.findByRole('img', { name: /QR code/ })).getAttribute('src')).toMatch(/^data:image\/png/);
    await userEvent.type(screen.getByLabelText(/Code from the app/), '654321');
    await userEvent.click(button('Turn on two-factor authentication'));
    expect(await screen.findByText(CODES[0]!)).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/mfa/enable')[0]!)).toEqual({ code: '654321' });
    await userEvent.click(screen.getByRole('checkbox', { name: /I have saved/ }));
    await userEvent.click(button('Continue'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it('a failed setup shows the reason and holds the button', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/mfa/setup') ? problem(409, 'Already enrolled') : undefined)));
    renderPage(<MfaEnroll onDone={() => undefined} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Already enrolled');
    expect(button('Turn on two-factor authentication').disabled).toBe(true);
  });
  it('a wrong code stays on the step with the reason', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/mfa/enable') ? problem(400, 'That code is not right') : undefined)));
    renderPage(<MfaEnroll onDone={() => undefined} />);
    await screen.findByTestId('totp-secret');
    await userEvent.type(screen.getByLabelText(/Code from the app/), '111111');
    await userEvent.click(button('Turn on two-factor authentication'));
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right');
    expect((screen.getByLabelText(/Code from the app/) as HTMLInputElement).value).toBe('111111');
  });
});

describe('enrolment: email', () => {
  const api = (over: (url: string) => unknown = () => undefined) => (url: string) => {
    const x = over(url);
    if (x !== undefined) return x;
    if (url.endsWith('/mfa/methods')) return methods({ method: 'email', usable: true });
    if (url.endsWith('/email/enable')) return { recoveryCodes: CODES };
    return {};
  };
  it('sends a proof code, enables with it, and ends on the recovery codes', async () => {
    const f = mockPageApi([], [], api());
    renderPage(<MfaEnroll onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send the code' }));
    await userEvent.type(await screen.findByLabelText(/Code from the email/), '222222');
    expect(writes(f, '/api/v1/auth/mfa/email/setup')).toHaveLength(1);
    await userEvent.click(button('Send another code'));
    await waitFor(() => expect(writes(f, '/api/v1/auth/mfa/email/setup')).toHaveLength(2));
    await userEvent.click(button('Turn on two-factor authentication'));
    expect(await screen.findByText(CODES[1]!)).toBeTruthy();
    expect(bodyOf(writes(f, '/api/v1/auth/mfa/email/enable')[0]!)).toEqual({ code: '222222' });
  });
  it('a failed send stays on the first step with the reason', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/email/setup') ? problem(503, 'Mail is down') : undefined)));
    renderPage(<MfaEnroll onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send the code' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mail is down');
    expect(button('Send the code')).toBeTruthy();
  });
  it('a code refused on its field shows there', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/email/enable') ? problem(422, 'Check the code', { errors: [{ path: 'code', message: 'Expired code' }] }) : undefined)));
    renderPage(<MfaEnroll onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send the code' }));
    await userEvent.type(await screen.findByLabelText(/Code from the email/), '222222');
    await userEvent.click(button('Turn on two-factor authentication'));
    expect(await screen.findByText('Expired code')).toBeTruthy();
    expect(screen.getByLabelText(/Code from the email/).getAttribute('aria-invalid')).toBe('true');
  });
});
