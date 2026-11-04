import { lazy, Suspense, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { InlineError } from '../../components/ErrorState';
import { Checkbox, Input } from '../../components/Input';
import { PageHeader } from '../../components/PageHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../lib/theme';
import { PushToggle } from '../../pwa/PushToggle';
import { ChangePasswordForm } from './ChangePasswordForm';
import './account.css';

// The QR library is only needed while enrolling.
const MfaEnroll = lazy(() => import('./Mfa').then((m) => ({ default: m.MfaEnroll })));
const RecoveryCodes = lazy(() => import('./Mfa').then((m) => ({ default: m.RecoveryCodes })));

export function Account() {
  const { me, logout, refresh, hasFeature, config } = useAuth();
  const toast = useToast();
  const [revoking, setRevoking] = useState(false);
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
            checked={me.preferences.emailNotifications}
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
      <Card title="Sessions">
        <div className="stack-3">
          <p className="text-2">Sign out of every browser and device, including this one.</p>
          <div><Button variant="danger-ghost" onClick={() => setRevoking(true)}>Sign out everywhere</Button></div>
        </div>
      </Card>
      {revoking && (
        <ConfirmDialog
          title="Sign out everywhere"
          message="Every browser and device, including this one, will have to sign in again."
          confirmLabel="Sign out everywhere"
          danger
          onClose={() => setRevoking(false)}
          onConfirm={async () => { await api.post('/api/v1/auth/sessions/revoke-all'); await logout(); }}
        />
      )}
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
  const start = (m: Mode) => { setMode(m); setF({ password: '', code: '' }); setError(null); };
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await fn(); } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Card title="Two-factor authentication" actions={<Badge tone={on ? 'ok' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>}>
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
              <p className="text-2">Add a second step at sign-in with an authenticator app.</p>
              <div><Button variant="primary" onClick={() => start('enroll')}>Turn on</Button></div>
            </div>
          ))}
        {mode === 'enroll' && <MfaEnroll onDone={async () => { setMode('idle'); await refresh(); toast('Two-factor authentication is on'); }} />}
        {mode === 'codes' && (codes ? <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setMode('idle'); }} /> : (
          <form className="stack-3" onSubmit={run(async () => { setCodes((await api.post<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes', { code: f.code })).recoveryCodes); })}>
            <Input label="Current code from your app" hint="Your old recovery codes stop working." required inputMode="numeric" maxLength={6} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            <InlineError error={error} />
            <div className="cluster"><Button onClick={() => setMode('idle')}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Generate</Button></div>
          </form>
        ))}
        {mode === 'disable' && (
          <form className="stack-3" onSubmit={run(async () => { await api.post('/api/v1/auth/mfa/disable', f); setMode('idle'); await refresh(); toast('Two-factor authentication is off'); })}>
            <Input label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <Input label="Code from your app, or a recovery code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            <InlineError error={error} />
            <div className="cluster"><Button onClick={() => setMode('idle')}>Cancel</Button><Button type="submit" variant="danger" loading={busy}>Turn off</Button></div>
          </form>
        )}
      </Suspense>
    </Card>
  );
}
