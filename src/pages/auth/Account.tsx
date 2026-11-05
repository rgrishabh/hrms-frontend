import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Monitor } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { InlineError } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Checkbox, Input } from '../../components/Input';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { useAction } from '../../components/useSubmit';
import { fmtDateTime } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../lib/theme';
import { PushToggle } from '../../pwa/PushToggle';
import { ChangePasswordForm } from './ChangePasswordForm';
import './account.css';

// The QR library is only needed while enrolling.
const MfaEnroll = lazy(() => import('./Mfa').then((m) => ({ default: m.MfaEnroll })));
const RecoveryCodes = lazy(() => import('./Mfa').then((m) => ({ default: m.RecoveryCodes })));
const SendCodeButton = lazy(() => import('./Mfa').then((m) => ({ default: m.SendCodeButton })));

const METHOD_LABEL: Record<string, string> = { totp: 'Authenticator app', email: 'Email codes' };

type SessionRow = ApiResponse<'/api/v1/auth/sessions'>['items'][number];

/** A rough name for a browser: enough to tell two sessions apart, without a user-agent parsing library. */
function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

function Sessions() {
  const { logout } = useAuth();
  const { run, isBusy } = useAction();
  const query = useApiQuery<ApiResponse<'/api/v1/auth/sessions'>>('/api/v1/auth/sessions');
  const [revokingAll, setRevokingAll] = useState(false);
  const [ending, setEnding] = useState<SessionRow | null>(null);
  return (
    <Card title="Sessions">
      <div className="stack-3">
        <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Monitor />} title="No other sessions." />}>
          {(d) => (
            <ul className="account-sessions" aria-label="Signed-in sessions">
              {d.items.map((s) => (
                <li key={s.id} className="account-sessions__item">
                  <div className="grow stack-1">
                    <span className="cluster"><strong>{deviceName(s.user_agent)}</strong>{s.current && <Badge tone="ok">This device</Badge>}</span>
                    <span className="text-sm text-2">Last active {fmtDateTime(s.last_seen_at)}. Signed in {fmtDateTime(s.created_at)}.{s.ip ? ` From ${s.ip}.` : ''}</span>
                  </div>
                  {!s.current && <Button size="sm" variant="danger-ghost" loading={isBusy(s.id)} aria-label={`Sign out ${deviceName(s.user_agent)}, last active ${fmtDateTime(s.last_seen_at)}`} onClick={() => setEnding(s)}>Sign out</Button>}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        <div><Button variant="danger-ghost" onClick={() => setRevokingAll(true)}>Sign out everywhere</Button></div>
      </div>
      {ending && (
        <ConfirmDialog
          title="Sign out this session"
          message={`${deviceName(ending.user_agent)} will have to sign in again.`}
          confirmLabel="Sign out"
          danger
          onClose={() => setEnding(null)}
          onConfirm={async () => { await run(ending.id, () => api.del(`/api/v1/auth/sessions/${ending.id}`), 'Session signed out'); await invalidateApi('/api/v1/auth/sessions'); }}
        />
      )}
      {revokingAll && (
        <ConfirmDialog
          title="Sign out everywhere"
          message="Every browser and device, including this one, will have to sign in again."
          confirmLabel="Sign out everywhere"
          danger
          onClose={() => setRevokingAll(false)}
          onConfirm={async () => { await api.post('/api/v1/auth/sessions/revoke-all'); await logout(); }}
        />
      )}
    </Card>
  );
}

export function Account() {
  const { me, logout, refresh, hasFeature, config } = useAuth();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  if (!me) return null;
  return (
    <div className="stack-4 account">
      <PageHeader title="My account" description={me.user.email} />
      <Card title="Appearance">
        <Select label="Theme" value={theme} onChange={(e) => { const t = e.target.value as ThemePreference; setTheme(t); setThemePreference(t); }} options={[{ value: 'system', label: 'Same as this device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>
      {hasFeature('FEATURE_EMAIL_NOTIFICATIONS') && (
        <Card title="Email notifications">
          <Checkbox
            label="Email me about approvals, decisions, reminders and security notices"
            hint="You always see notifications in the app."
            checked={me.preferences?.emailNotifications ?? false}
            onChange={async (e) => {
              const on = e.target.checked;
              try {
                await api.put('/api/v1/auth/preferences', { emailNotifications: on });
                await refresh();
                toast(on ? 'Email notifications on' : 'Email notifications off');
              } catch (x) { toast(errorMessage(x), 'error'); }
            }}
          />
        </Card>
      )}
      {hasFeature('FEATURE_PUSH_NOTIFICATIONS') && <Card title="Push notifications"><PushToggle /></Card>}
      <Card title="Change password"><ChangePasswordForm onDone={() => toast('Password changed')} /></Card>
      {config?.mfa.available && <MfaCard />}
      <Sessions />
    </div>
  );
}

type Mode = 'idle' | 'enroll' | 'codes' | 'disable';

function MfaCard() {
  const { me, refresh, config } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('idle');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [f, setF] = useState({ password: '', code: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const on = !!me?.mfa.enabled;
  const byEmail = me?.mfa.method === 'email';
  const start = (m: Mode) => { setMode(m); setF({ password: '', code: '' }); setError(null); };
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await fn(); } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Card title="Two-factor authentication" actions={<Badge tone={on ? 'ok' : 'neutral'}>{on ? `On: ${METHOD_LABEL[me?.mfa.method ?? ''] ?? 'Authenticator app'}` : 'Off'}</Badge>}>
      <Suspense fallback={<SkeletonRows rows={3} />}>
        {mode === 'idle' && (on
          ? (
            <div className="cluster">
              <Button size="sm" onClick={() => start('codes')}>New recovery codes</Button>
              {!config?.mfa.enforced && <Button size="sm" variant="danger-ghost" onClick={() => start('disable')}>Turn off</Button>}
            </div>
          )
          : (
            <div className="stack-3">
              {me?.mfa.suggested && <Alert tone="warn">You can read pay or bank details, so a second step at sign-in is worth turning on. It is your choice here.</Alert>}
              <p className="text-2">Add a second step at sign-in, with an authenticator app or by email.</p>
              <div><Button variant="primary" onClick={() => start('enroll')}>Turn on</Button></div>
            </div>
          ))}
        {mode === 'enroll' && <MfaEnroll onDone={async () => { setMode('idle'); await refresh(); toast('Two-factor authentication is on'); }} />}
        {mode === 'codes' && (codes ? <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setMode('idle'); }} /> : (
          <form className="stack-3" onSubmit={run(async () => { setCodes((await api.post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes', { code: f.code })).recoveryCodes); })}>
            <Input label={byEmail ? 'Current code from your email' : 'Current code from your app'} hint="Your old recovery codes stop working." required inputMode="numeric" maxLength={6} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            {byEmail && <SendCodeButton label="Send a code" />}
            <InlineError error={error} />
            <div className="cluster"><Button onClick={() => setMode('idle')}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Generate</Button></div>
          </form>
        ))}
        {mode === 'disable' && (
          <form className="stack-3" onSubmit={run(async () => { await api.post('/api/v1/auth/mfa/disable', f); setMode('idle'); await refresh(); toast('Two-factor authentication is off'); })}>
            <Input label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <Input label={byEmail ? 'Code from your email, or a recovery code' : 'Code from your app, or a recovery code'} required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            {byEmail && <SendCodeButton label="Send a code" />}
            <InlineError error={error} />
            <div className="cluster"><Button onClick={() => setMode('idle')}>Cancel</Button><Button type="submit" variant="danger" loading={busy}>Turn off</Button></div>
          </form>
        )}
      </Suspense>
    </Card>
  );
}
