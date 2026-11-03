import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from './api';
import { Field, ErrorBox, errText } from './ui';

/** Second step of sign-in: authenticator code or a recovery code. */
export function MfaVerify({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api.post('/api/v1/auth/mfa/verify', { code: code.trim() }); onDone(); }
      catch (x) { setError(errText(x)); if ((x as { status?: number }).status === 401) setTimeout(() => window.location.reload(), 1500); }
      finally { setBusy(false); }
    }}>
      <div><h1>Two-factor authentication</h1><p className="muted" style={{ margin: '4px 0 0' }}>{recovery ? 'Enter one of your recovery codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}</p></div>
      <Field label={recovery ? 'Recovery code' : 'Code'}>
        <input autoFocus required autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} pattern={recovery ? undefined : '\\d{6}'} maxLength={recovery ? 20 : 6}
          value={code} onChange={(e) => setCode(e.target.value)} placeholder={recovery ? 'xxxx-xxxx-xxxx' : '123456'} />
      </Field>
      <ErrorBox error={error} />
      <button className="btn primary lg" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
      <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setRecovery(!recovery); setCode(''); }}>{recovery ? 'Use authenticator code' : 'Use a recovery code'}</button>
    </form>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack">
      <div className="alert warn">Save these recovery codes somewhere safe (a password manager or printed). Each works once if you lose your phone. They will not be shown again.</div>
      <div className="card mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>{codes.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(codes.join('\n'))}>Copy</button>
        <a className="btn sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(codes.join('\n'))}`} download="recovery-codes.txt" style={{ textDecoration: 'none' }}>Download</a>
      </div>
      <label className="row"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved my recovery codes</label>
      <button className="btn primary" disabled={!saved} onClick={onDone}>Continue</button>
    </div>
  );
}

/** Enrolment: QR (rendered in the browser) + manual key → confirm with a code → recovery codes. */
export function MfaEnroll({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.post('/api/v1/auth/mfa/setup').then(async (s) => { setSetup(s); setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 200 })); })
      .catch((e) => setError(errText(e)));
  }, []);
  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      try { setCodes((await api.post('/api/v1/auth/mfa/enable', { code: code.trim() })).recoveryCodes); } catch (x) { setError(errText(x)); }
    }}>
      {intro && <div className="alert info">{intro}</div>}
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, …).</li>
        <li>Scan this QR code, or enter the key manually.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {setup && <div className="row" style={{ gap: 16, alignItems: 'center' }}>
        {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 6, borderRadius: 6 }} />}
        <div className="stack" style={{ gap: 4 }}><span className="muted" style={{ fontSize: 12 }}>Manual key</span><span className="mono">{setup.secret.match(/.{1,4}/g)!.join(' ')}</span></div>
      </div>}
      <Field label="Code from the app"><input required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <ErrorBox error={error} />
      <button className="btn primary" disabled={!setup}>Turn on two-factor authentication</button>
    </form>
  );
}
