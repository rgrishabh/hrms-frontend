import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, ApiError } from '../../api';
import { Alert } from '../../components/Alert';
import { Button, ButtonAnchor } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Checkbox, Input } from '../../components/Input';

/** Second step of sign-in: authenticator code or a recovery code. */
export function MfaVerify({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api.post('/api/v1/auth/mfa/verify', { code: code.trim() }); onDone(); }
    catch (x) {
      setError(x);
      if (x instanceof ApiError && x.status === 401) setTimeout(() => window.location.reload(), 1500);
    } finally { setBusy(false); }
  };
  return (
    <form className="stack-4" onSubmit={submit}>
      <div className="stack-1">
        <h1>Two-factor authentication</h1>
        <p className="text-2">{recovery ? 'Enter one of your recovery codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}</p>
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
      <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Checking…">Verify</Button>
      <div><Button variant="link" onClick={() => { setRecovery(!recovery); setCode(''); }}>{recovery ? 'Use authenticator code' : 'Use a recovery code'}</Button></div>
    </form>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack-3">
      <Alert tone="warn">Save these recovery codes somewhere safe, such as a password manager. Each works once if you lose your phone. They will not be shown again.</Alert>
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

/** Enrolment: QR (rendered in the browser) and manual key, confirm with a code, then recovery codes. */
export function MfaEnroll({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.post<{ secret: string; otpauthUri: string }>('/api/v1/auth/mfa/setup').then(async (s) => {
      setSetup(s);
      setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 200 }));
    }).catch(setError);
  }, []);
  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { setCodes((await api.post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/enable', { code: code.trim() })).recoveryCodes); }
    catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <form className="stack-3" onSubmit={submit}>
      {intro && <Alert>{intro}</Alert>}
      <ol className="auth-steps">
        <li>Install an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
        <li>Scan this QR code, or enter the key manually.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {setup && (
        <div className="auth-qr">
          {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} />}
          <div className="stack-1"><span className="text-xs text-3">Manual key</span><span className="mono">{setup.secret.match(/.{1,4}/g)?.join(' ')}</span></div>
        </div>
      )}
      <Input label="Code from the app" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      <InlineError error={error} />
      <div><Button type="submit" variant="primary" disabled={!setup} loading={busy}>Turn on two-factor authentication</Button></div>
    </form>
  );
}
