import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, errorMessage } from '../../api';
import { Alert } from '../../components/Alert';
import { Button, ButtonAnchor } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Checkbox, Input } from '../../components/Input';
import { QueryState } from '../../components/QueryState';
import { useSubmit } from '../../components/useSubmit';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';

const DELIVERY: Record<string, string> = {
  sent: 'We sent a 6-digit code to your email. It works for 10 minutes.',
  wait: 'A code was sent a moment ago. Use that one, or ask for another shortly.',
  unavailable: 'Email cannot be sent right now, so use one of your recovery codes.',
};

/** "Send another code", with the wait the server asks for shown on the button. */
export function SendCodeButton({ url = '/api/v1/auth/mfa/email/send', label = 'Send another code', onSent }: { url?: string; label?: string; onSent?: () => void }) {
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      await api.post(url);
      setNote('A new code is on its way.');
      setWait(60);
      onSent?.();
    } catch (x) {
      setNote(errorMessage(x));
      if (x instanceof ApiError && x.retryAfter) setWait(x.retryAfter);
    } finally { setBusy(false); }
  };
  return (
    <div className="cluster">
      <Button variant="link" disabled={wait > 0} loading={busy} onClick={() => void send()}>{wait > 0 ? `${label} (${wait}s)` : label}</Button>
      {note && <span role="status" className="text-sm text-2">{note}</span>}
    </div>
  );
}

/** Second step of sign-in: a code from the app or from email, or a recovery code. */
export function MfaVerify({ method, delivery, onDone }: { method: string | null; delivery: string | null; onDone: () => void }) {
  const byEmail = method === 'email';
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(delivery === 'unavailable');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const locked = error instanceof ApiError && error.code === 'mfa_locked';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api.post<ApiResponse<'/api/v1/auth/mfa/verify', 'post'>>('/api/v1/auth/mfa/verify', { code: code.trim() }); onDone(); }
    catch (x) {
      setError(x);
      // Too many guesses end the session, so the code form is of no more use.
      if (x instanceof ApiError && x.status === 401) setTimeout(() => window.location.reload(), 1500);
    } finally { setBusy(false); }
  };
  const prompt = recovery ? 'Enter one of your recovery codes. Each works once.' : byEmail ? (delivery && DELIVERY[delivery]) ?? 'Enter the 6-digit code from your email.' : 'Enter the 6-digit code from your authenticator app.';
  return (
    <form className="stack-4" onSubmit={submit}>
      <div className="stack-1">
        <h1>Two-factor authentication</h1>
        <p className="text-2">{prompt}</p>
      </div>
      <Input
        label={recovery ? 'Recovery code' : 'Code'}
        data-autofocus
        autoFocus
        required
        autoComplete="one-time-code"
        inputMode={recovery ? 'text' : 'numeric'}
        pattern={recovery ? undefined : '\\d{6}'}
        maxLength={recovery ? 20 : 6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={recovery ? 'xxxx-xxxx-xxxx' : '123456'}
      />
      <InlineError error={error} />
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={locked} loadingText="Checking…">Verify</Button>
      <div className="stack-1">
        {byEmail && !recovery && <SendCodeButton />}
        <div><Button variant="link" onClick={() => { setRecovery(!recovery); setCode(''); }}>{recovery ? (byEmail ? 'Use a code from email' : 'Use authenticator code') : 'Use a recovery code'}</Button></div>
      </div>
    </form>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack-3">
      <Alert tone="warn">Save these recovery codes somewhere safe, such as a password manager. Each works once if you lose your phone or your email. They will not be shown again.</Alert>
      <div className="auth-codes mono">{codes.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="cluster">
        <Button size="sm" onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}>Copy</Button>
        <ButtonAnchor size="sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(codes.join('\n'))}`} download="recovery-codes.txt">Download</ButtonAnchor>
      </div>
      <Checkbox label="I have saved my recovery codes" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      <div><Button variant="primary" disabled={!saved} onClick={onDone}>Continue</Button></div>
    </div>
  );
}

type Methods = ApiResponse<'/api/v1/auth/mfa/methods'>;

/** Enrolment: asks the server what is offered and usable, then runs that method to its recovery codes. */
export function MfaEnroll({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const query = useApiQuery<Methods>('/api/v1/auth/mfa/methods');
  const [chosen, setChosen] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  return (
    <div className="stack-3">
      {intro && <Alert>{intro}</Alert>}
      <QueryState query={query}>
        {(d) => {
          const usable = d.methods.filter((m) => m.usable);
          const method = chosen ?? (usable.length === 1 ? usable[0]!.method : null);
          if (method === 'totp') return <TotpEnroll onCodes={setCodes} />;
          if (method === 'email') return <EmailEnroll onCodes={setCodes} />;
          return (
            <div className="stack-3">
              {!usable.length && <Alert tone="warn">No method can be set up right now. Ask your administrator.</Alert>}
              {d.methods.map((m) => (
                <div key={m.method} className="stack-1">
                  <div><Button disabled={!m.usable} onClick={() => setChosen(m.method)}>{m.method === 'totp' ? 'Use an authenticator app' : 'Use codes sent by email'}</Button></div>
                  {!m.usable && m.reason && <p className="text-sm text-2">{m.reason}</p>}
                </div>
              ))}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

function TotpEnroll({ onCodes }: { onCodes: (c: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.post<ApiResponse<'/api/v1/auth/mfa/setup', 'post'>>('/api/v1/auth/mfa/setup').then(async (s) => {
      setSetup(s);
      setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 200 }));
    }).catch(setError);
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { onCodes((await api.post<ApiResponse<'/api/v1/auth/mfa/enable', 'post'>>('/api/v1/auth/mfa/enable', { code: code.trim() })).recoveryCodes); }
    catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <form className="stack-3" onSubmit={submit}>
      <ol className="auth-steps">
        <li>Install an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
        <li>Scan this QR code, or enter the key manually.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {setup && (
        <div className="auth-qr">
          {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} />}
          <div className="stack-1"><span className="text-xs text-3">Manual key</span><span className="mono" data-testid="totp-secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</span></div>
        </div>
      )}
      <Input label="Code from the app" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      <InlineError error={error} />
      <div><Button type="submit" variant="primary" disabled={!setup} loading={busy}>Turn on two-factor authentication</Button></div>
    </form>
  );
}

function EmailEnroll({ onCodes }: { onCodes: (c: string[]) => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const send = useSubmit(async () => { await api.post<ApiResponse<'/api/v1/auth/mfa/email/setup', 'post'>>('/api/v1/auth/mfa/email/setup'); setSent(true); });
  const form = useSubmit(async () => { onCodes((await api.post<ApiResponse<'/api/v1/auth/mfa/email/enable', 'post'>>('/api/v1/auth/mfa/email/enable', { code: code.trim() })).recoveryCodes); });
  if (!sent) {
    return (
      <div className="stack-3">
        <p className="text-2">We will send a code to your work email to prove it reaches you. After that, each sign-in sends a new code.</p>
        <InlineError error={send.error} />
        <div><Button variant="primary" loading={send.busy} onClick={() => void send.submit()}>Send the code</Button></div>
      </div>
    );
  }
  return (
    <form className="stack-3" onSubmit={form.submit}>
      <Alert>A 6-digit code is on its way to your work email. It works for 10 minutes.</Alert>
      <Input label="Code from the email" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={code} error={form.errors['code']} onChange={(e) => setCode(e.target.value)} />
      <InlineError error={form.error} />
      <div><Button type="submit" variant="primary" loading={form.busy}>Turn on two-factor authentication</Button></div>
      <SendCodeButton url="/api/v1/auth/mfa/email/setup" />
    </form>
  );
}
