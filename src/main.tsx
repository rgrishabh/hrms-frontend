import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth, TEMPORARY, type PublicConfig } from './auth';
import { ToastProvider, Loading, ErrorBox, Field, errText, useToast } from './ui';
import { api, setCsrf } from './api';
import { Dashboard } from './pages/Dashboard';
import { MyAttendance } from './pages/MyAttendance';
import { TeamAttendance } from './pages/TeamAttendance';
import { Approvals } from './pages/Approvals';
import { Employees, EmployeeProfile } from './pages/Employees';
import { MyProfile } from './pages/PersonalDetails';
import { AttendanceAdmin } from './pages/AttendanceAdmin';
import { RosterPage } from './pages/Rosters';
import { SettingsCenter } from './pages/Settings';
import { Leave } from './pages/Leave';
import { Notifications } from './pages/Notifications';
import { Documents } from './pages/Documents';
import { Expenses } from './pages/Expenses';
import { Competency } from './pages/Competency';
import { Policies } from './pages/Policies';
import { Recruitment } from './pages/Recruitment';
import { Lifecycle } from './pages/Lifecycle';
import { Payroll } from './pages/Payroll';
import { Payslips } from './pages/Payslips';
import { Cases } from './pages/Cases';
import { Performance } from './pages/Performance';
import { Assets } from './pages/Assets';
import { Overtime } from './pages/Overtime';
import { FieldDuty } from './pages/FieldDuty';
import { Travel } from './pages/Travel';
import { Loans } from './pages/Loans';
import { Accounting } from './pages/Accounting';
import { Reports } from './pages/Reports';
import { MfaVerify, MfaEnroll, RecoveryCodes } from './Mfa';
import { runtimeEnv, environmentLabel } from './runtime/env';

const RUNTIME = runtimeEnv();
const ENV_LABEL = environmentLabel(RUNTIME);

/** Logo from deployment config; initials if none is configured or it fails to load. */
export function BrandMark({ cfg, size = 30 }: { cfg: PublicConfig; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (cfg.brand.logoUrl && !failed) {
    return <img src={cfg.brand.logoUrl} alt={`${cfg.brand.name} logo`} style={{ height: size, maxWidth: size * 4, objectFit: 'contain' }} onError={() => setFailed(true)} />;
  }
  const initials = cfg.brand.shortName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <div className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">{initials}</div>;
}

function SupportLine({ cfg }: { cfg: PublicConfig }) {
  const b = cfg.brand;
  if (!b.supportEmail && !b.supportPhone && !b.helpUrl) return null;
  return (
    <div className="muted" style={{ fontSize: 12 }}>
      Need help?{b.supportEmail && <> <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a></>}
      {b.supportPhone && <> · <a href={`tel:${b.supportPhone.replace(/[^+\d]/g, '')}`}>{b.supportPhone}</a></>}
      {b.helpUrl && <> · <a href={b.helpUrl} target="_blank" rel="noreferrer noopener">Help centre</a></>}
    </div>
  );
}

function CardPage({ cfg, children }: { cfg: PublicConfig; children: ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <div className="brand" style={{ padding: 0 }}><BrandMark cfg={cfg} /><div>{cfg.brand.name}</div></div>
        {children}
        <SupportLine cfg={cfg} />
        <div className="muted" style={{ fontSize: 11 }}>{cfg.product.name}</div>
      </div>
    </div>
  );
}

function Login({ cfg }: { cfg: PublicConfig }) {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <CardPage cfg={cfg}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { const r = await api.post('/api/v1/auth/login', { email, password }); setCsrf(r.csrfToken); await refresh(); }
        catch (err) { setError(errText(err)); } finally { setBusy(false); }
      }}>
        <div><h1>Sign in</h1>{cfg.brand.loginMessage && <p className="muted" style={{ margin: '4px 0 0' }}>{cfg.brand.loginMessage}</p>}</div>
        <label className="field">Work email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <ErrorBox error={error} />
        <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </CardPage>
  );
}

/** Completes a one-time administrator setup link. The token is in the URL fragment, which browsers never send to servers. */
function Setup({ cfg }: { cfg: PublicConfig }) {
  const nav = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { if (window.location.hash) history.replaceState(null, '', window.location.pathname); }, []);
  if (!token) return <CardPage cfg={cfg}><h2>Setup link incomplete</h2><p className="muted">Open the full link you were given, or ask your system operator for a new one.</p></CardPage>;
  if (done) return <CardPage cfg={cfg}><h2>Password set</h2><p className="muted">You can now sign in.</p><button className="btn primary" onClick={() => nav('/')}>Go to sign in</button></CardPage>;
  return (
    <CardPage cfg={cfg}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        if (pw !== pw2) { setError('The passwords do not match'); return; }
        try { await api.post('/api/v1/auth/setup', { token, newPassword: pw }); setDone(true); } catch (err) { setError(errText(err)); }
      }}>
        <div><h1>Set up your administrator account</h1><p className="muted" style={{ margin: '4px 0 0' }}>This link works once. Choose a strong password (at least 12 characters).</p></div>
        <Field label="New password"><input type="password" autoComplete="new-password" required minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password"><input type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <button className="btn primary lg">Set password</button>
      </form>
    </CardPage>
  );
}

export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      if (pw !== pw2) { setError('The new passwords do not match'); return; }
      setBusy(true);
      try { await api.post('/api/v1/auth/password', { currentPassword: cur, newPassword: pw }); setCur(''); setPw(''); setPw2(''); onDone(); }
      catch (err) { setError(errText(err)); } finally { setBusy(false); }
    }}>
      {forced && <div className="alert warn">You must choose a new password before continuing.</div>}
      <Field label={forced ? 'Temporary password' : 'Current password'}><input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="New password" hint="At least 12 characters; other sessions are signed out"><input type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="Confirm new password"><input type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      <ErrorBox error={error} />
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

function Account() {
  const { me, logout, refresh, hasModule } = useAuth();
  const toast = useToast();
  const [sms, setSms] = useState<boolean>(me!.preferences.smsNotifications ?? true);
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <div><h1>My account</h1><p className="sub">{me!.user.email}</p></div>
      {hasModule('notifications.email') && (
        <div className="card stack"><h2>Email notifications</h2>
          <label className="row"><input type="checkbox" checked={me!.preferences.emailNotifications} onChange={async (e) => {
            try { await api.put('/api/v1/auth/preferences', { emailNotifications: e.target.checked }); await refresh(); toast(e.target.checked ? 'Email notifications on' : 'Email notifications off'); }
            catch (x) { toast(errText(x), 'error'); }
          }} /> Email me about approvals, decisions, reminders and security notices</label>
          <span className="muted" style={{ fontSize: 12 }}>You always see notifications in the app.</span></div>)}
      {hasModule('notifications.sms') && (
        <div className="card stack"><h2>SMS</h2>
          <label className="row"><input type="checkbox" checked={sms} onChange={async (e) => {
            const on = e.target.checked; setSms(on);   // reflect the click at once; undo if saving fails
            try { await api.put('/api/v1/auth/preferences', { smsNotifications: on }); await refresh(); toast(on ? 'SMS on' : 'SMS off'); }
            catch (x) { setSms(!on); toast(errText(x), 'error'); }
          }} /> Text me important notifications (approvals waiting, payslips, payments)</label>
          <span className="muted" style={{ fontSize: 12 }}>Sent to the mobile number on your employee record.</span></div>)}
      <div className="card"><h2>Change password</h2><ChangePasswordForm onDone={() => toast('Password changed')} /></div>
      <MfaCard />
      <div className="card stack"><h2>Sessions</h2><p className="muted" style={{ margin: 0 }}>Sign out of every browser and device, including this one.</p>
        <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api.post('/api/v1/auth/sessions/revoke-all'); await logout(); }}>Sign out everywhere</button></div>
    </div>
  );
}

function MfaCard() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'idle' | 'enroll' | 'codes' | 'disable'>('idle');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [f, setF] = useState({ password: '', code: '' });
  const [error, setError] = useState<string | null>(null);
  const on = me!.mfa.enabled;
  return (
    <div className="card stack">
      <div className="row"><h2 style={{ margin: 0 }}>Two-factor authentication</h2><span className="spacer" /><span className={`badge ${on ? 'ok' : ''}`}>{on ? 'On' : 'Off'}</span></div>
      {mode === 'idle' && (on ? <div className="row">
        <button className="btn sm" onClick={() => { setMode('codes'); setF({ password: '', code: '' }); setError(null); }}>New recovery codes</button>
        <button className="btn sm danger" onClick={() => { setMode('disable'); setF({ password: '', code: '' }); setError(null); }}>Turn off</button></div>
        : <><p className="muted" style={{ margin: 0 }}>Add a second step at sign-in with an authenticator app.</p><button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setMode('enroll')}>Turn on</button></>)}
      {mode === 'enroll' && <MfaEnroll onDone={async () => { setMode('idle'); await refresh(); toast('Two-factor authentication is on'); }} />}
      {mode === 'codes' && (codes ? <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setMode('idle'); }} /> : (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); setError(null);
          try { setCodes((await api.post('/api/v1/auth/mfa/recovery-codes', { code: f.code })).recoveryCodes); } catch (x) { setError(errText(x)); } }}>
          <Field label="Current code from your app" hint="Your old recovery codes stop working"><input required inputMode="numeric" maxLength={6} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <ErrorBox error={error} /><div className="row"><button type="button" className="btn" onClick={() => setMode('idle')}>Cancel</button><button className="btn primary">Generate</button></div>
        </form>))}
      {mode === 'disable' && (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); setError(null);
          try { await api.post('/api/v1/auth/mfa/disable', f); setMode('idle'); await refresh(); toast('Two-factor authentication is off'); } catch (x) { setError(errText(x)); } }}>
          <Field label="Password"><input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Code from your app (or a recovery code)"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <ErrorBox error={error} /><div className="row"><button type="button" className="btn" onClick={() => setMode('idle')}>Cancel</button><button className="btn danger">Turn off</button></div>
        </form>)}
    </div>
  );
}

interface NavItem { to: string; label: string; show: boolean }

/** Unread notification count, refreshed every minute and on navigation. */
function useUnread(enabled: boolean) {
  const [n, setN] = useState(0);
  const loc = useLocation();
  const refresh = () => (enabled ? api.get('/api/v1/notifications/unread-count').then((r) => setN(r.unread)).catch(() => undefined) : Promise.resolve());
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, enabled]);
  return { unread: enabled ? n : 0, refresh };
}

function Shell({ cfg, children, unread }: { cfg: PublicConfig; children: ReactNode; unread: number }) {
  const { me, logout, can, canAny, hasModule } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!me) return null;
  const groups: { title: string; items: NavItem[] }[] = [
    { title: 'Me', items: [
      { to: '/', label: 'Dashboard', show: true },
      { to: '/notifications', label: 'Notifications', show: true },
      { to: '/profile', label: 'My profile', show: can('profile.self') && !!me.user.employeeId },
      { to: '/attendance/me', label: 'My attendance', show: hasModule('attendance') && can('attendance.self') && !!me.user.employeeId },
      { to: '/leave', label: 'Leave', show: hasModule('leave') && canAny('leave.self', 'leave.team.read', 'leave.read', 'leave.manage') },
      { to: '/overtime', label: 'Overtime', show: hasModule('overtime') && ((can('overtime.self') && !!me.user.employeeId) || canAny('overtime.team.read', 'overtime.read', 'overtime.approve', 'overtime.manage')) },
      { to: '/field-duty', label: 'Field duty', show: hasModule('field_duty') && ((can('field_duty.self') && !!me.user.employeeId) || canAny('field_duty.team.read', 'field_duty.read', 'field_duty.approve', 'field_duty.manage')) },
      { to: '/travel', label: 'Travel', show: hasModule('travel') && ((can('travel.self') && !!me.user.employeeId) || canAny('travel.team.read', 'travel.read', 'travel.approve', 'expenses.pay')) },
      { to: '/loans', label: 'Advances & loans', show: hasModule('advances_loans') && ((can('loans.self') && !!me.user.employeeId) || canAny('loans.team.read', 'loans.read', 'loans.approve', 'loans.manage')) },
      // Everyone can be on an interview panel, so the page is shown whenever the module is on.
      { to: '/recruitment', label: 'Recruitment', show: hasModule('recruitment') },
      { to: '/payslips', label: 'Payslips', show: hasModule('payroll.payslips') && can('payslips.self') && !!me?.user.employeeId },
      { to: '/payroll', label: 'Payroll', show: hasModule('payroll') && canAny('payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory') },
      { to: '/cases', label: 'Grievances & POSH', show: (hasModule('posh') || hasModule('grievance')) },
      { to: '/performance', label: 'Performance', show: hasModule('performance') && canAny('performance.self', 'performance.manage') },
      { to: '/assets', label: 'Assets', show: hasModule('assets') && ((can('assets.self') && !!me.user.employeeId) || can('assets.manage')) },
      { to: '/lifecycle', label: 'Onboarding & exit', show: hasModule('core.onboarding') || hasModule('core.offboarding') },
      { to: '/policies', label: 'Policies', show: hasModule('core.policies') && canAny('policies.self', 'policies.read', 'policies.manage') },
      { to: '/competency', label: hasModule('lab.competency') ? 'Competency' : 'Training', show: hasModule('training') && canAny('competency.self', 'training.manage', 'competency.read', 'competency.manage', 'competency.assess', 'competency.authorize') },
      { to: '/expenses', label: 'Expenses', show: hasModule('expenses') && canAny('expenses.self', 'expenses.team.read', 'expenses.read', 'expenses.pay', 'expenses.manage') },
      { to: '/approvals', label: 'Approvals', show: true },
    ] },
    { title: 'People', items: [
      { to: '/employees', label: 'Employees', show: canAny('employees.read', 'employees.directory') },
      { to: '/documents', label: 'Documents', show: hasModule('core.documents') },
      { to: '/attendance/roster', label: 'Roster', show: hasModule('shifts') && canAny('attendance.self', 'attendance.team.read', 'attendance.read') && (!!me.user.employeeId || canAny('attendance.read', 'attendance.team.read')) },
      { to: '/attendance/team', label: 'Team attendance', show: hasModule('attendance') && canAny('attendance.read', 'attendance.team.read') },
      // The page itself lists only the reports whose module is on and that the role may run.
      { to: '/reports', label: 'Reports', show: canAny('employees.read', 'attendance.read', 'attendance.team.read', 'leave.read', 'leave.team.read', 'payroll.read', 'expenses.read', 'competency.read', 'training.manage') },
    ] },
    { title: 'Administration', items: [
      { to: '/attendance/admin', label: 'Attendance setup', show: hasModule('attendance') && canAny('attendance.configure', 'attendance.devices.manage', 'attendance.lock', 'attendance.recalculate') },
      { to: '/accounting', label: 'Accounting', show: hasModule('accounting_exports') && canAny('accounting.export', 'accounting.configure') },
      { to: '/settings', label: 'Settings', show: canAny('settings.read', 'users.manage', 'audit.read', 'org.read') },
    ] },
  ];
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><BrandMark cfg={cfg} /><div>{cfg.brand.shortName}</div>
          {ENV_LABEL && <span className="badge warn" title={`Version ${RUNTIME.version}`} style={{ marginLeft: "auto" }}>{ENV_LABEL}</span>}</div>
        <nav className="nav">
          {groups.map((g) => g.items.some((i) => i.show) && (
            <div key={g.title}><div className="nav-group">{g.title}</div>
              {g.items.filter((i) => i.show).map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/'}>{i.label}{i.to === '/notifications' && unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}</NavLink>)}</div>
          ))}
        </nav>
        <div className="sidebar-foot stack" style={{ gap: 6 }}>
          <div><div style={{ color: 'var(--text)', fontWeight: 600 }}>{me.user.displayName}</div><div>{me.roles.map((r) => r.name).join(', ')}</div></div>
          <div className="row"><NavLink to="/account" className="btn sm" style={{ textDecoration: 'none' }}>My account</NavLink><button className="btn sm" onClick={logout}>Sign out</button></div>
          <SupportLine cfg={cfg} />
          <div style={{ fontSize: 11 }}>{cfg.product.name}</div>
        </div>
      </aside>
      <div>
        <div className="topbar-mobile"><button className="btn sm" onClick={() => setOpen(!open)} aria-label="Open menu">☰{unread > 0 && <span className="count">{unread}</span>}</button><BrandMark cfg={cfg} size={24} /><strong>{cfg.brand.shortName}</strong></div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

function App() {
  const { config, configError, me, loading, refresh } = useAuth();
  const loc = useLocation();
  const unread = useUnread(!!me && !me.passwordChangeRequired && !me.mfa.pending && !me.mfa.enrollmentRequired);
  if (configError) return <div className="login-wrap"><div className="card login-card">{configError.startsWith(TEMPORARY)
    ? <><h2>Please wait a moment</h2><p className="muted">{configError}. Retrying in a few seconds…</p><button className="btn" onClick={() => window.location.reload()}>Retry now</button></>
    : <><h2>This address is not configured</h2><p className="muted">{configError}</p></>}</div></div>;
  if (!config || loading) return <Loading />;
  if (loc.pathname === '/setup') return <Setup cfg={config} />;
  if (!me) return <Login cfg={config} />;
  if (me.mfa.pending) return <CardPage cfg={config}><MfaVerify onDone={refresh} /></CardPage>;
  if (me.mfa.enrollmentRequired) return <CardPage cfg={config}><h1>Set up two-factor authentication</h1>
    <MfaEnroll intro="Your role requires a second step at sign-in to protect employee, payroll and configuration data." onDone={refresh} /></CardPage>;
  if (me.passwordChangeRequired) return <CardPage cfg={config}><h1>Choose a new password</h1><ChangePasswordForm forced onDone={refresh} /></CardPage>;
  return (
    <Shell cfg={config} unread={unread.unread}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/attendance/me" element={<MyAttendance />} />
        <Route path="/attendance/roster" element={<RosterPage />} />
        <Route path="/attendance/team" element={<TeamAttendance />} />
        <Route path="/attendance/admin" element={<AttendanceAdmin />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/competency" element={<Competency />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/recruitment" element={<Recruitment />} />
        <Route path="/lifecycle" element={<Lifecycle />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/payslips" element={<Payslips />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/overtime" element={<Overtime />} />
        <Route path="/field-duty" element={<FieldDuty />} />
        <Route path="/travel" element={<Travel />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/accounting" element={<Accounting />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/:id" element={<EmployeeProfile />} />
        <Route path="/settings/*" element={<SettingsCenter />} />
        <Route path="/account" element={<Account />} />
        <Route path="/profile" element={<MyProfile />} />
        <Route path="/notifications" element={<Notifications onChange={unread.refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></BrowserRouter>
  </StrictMode>,
);
