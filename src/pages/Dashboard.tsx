import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime, fmtMinutes, fmtDate, EXCEPTION_LABEL } from '../format';
import { useLoad, useToast, errText, StatusBadge, Loading } from '../ui';

/** Clock-in card. Server decides time; client sends an idempotency key so double clicks/retries are safe. */
export function PunchCard() {
  const toast = useToast();
  const { data, loading, reload, error } = useLoad(() => api.get('/api/v1/attendance/me/today'), []);
  const [busy, setBusy] = useState(false);
  if (loading) return <div className="card"><Loading /></div>;
  if (error) return <div className="card"><h3>Today</h3><div className="muted">{error}</div></div>;
  if (!data.linked) return <div className="card"><h3>Today</h3><p className="muted">Your account is not linked to an employee record, so attendance is not available.</p></div>;
  const channel = data.channels.web ? 'web' : data.channels.mobile ? 'mobile' : null;
  const isMobile = window.matchMedia('(max-width: 860px)').matches;
  const useChannel = isMobile && data.channels.mobile ? 'mobile' : channel;

  const punch = async () => {
    if (!useChannel) return;
    setBusy(true);
    const body: any = { channel: useChannel, idempotencyKey: crypto.randomUUID(), direction: data.nextDirection };
    try {
      if (useChannel === 'mobile' && data.locationMode !== 'off' && 'geolocation' in navigator) {
        // Location is requested only at punch time, never tracked continuously.
        const pos = await new Promise<GeolocationPosition | null>((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000 }));
        if (pos) { body.latitude = pos.coords.latitude; body.longitude = pos.coords.longitude; }
      }
      const r = await api.post('/api/v1/attendance/punch', body);
      toast(r.duplicate ? 'Already recorded' : `Clocked ${r.direction} at ${fmtTime(r.eventTime)}`);
      reload();
    } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  const d = data.daily;
  return (
    <div className="card punch-card">
      <div className="row" style={{ width: '100%' }}><h3 style={{ margin: 0 }}>Today · {fmtDate(data.today)}</h3><span className="spacer" />{d && <StatusBadge status={d.status} />}</div>
      <div className="punch-time">{new Intl.DateTimeFormat('en-IN', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date())}</div>
      <div className="muted">{data.events.length ? `Punches: ${data.events.map((e: any) => `${e.direction === 'in' ? 'In' : e.direction === 'out' ? 'Out' : '•'} ${fmtTime(e.event_time)}`).join(' · ')}` : 'No punches yet today'}</div>
      {d && d.exceptions.length > 0 && <div className="row">{d.exceptions.map((x: string) => <span key={x} className="badge warn">{EXCEPTION_LABEL[x] ?? x}</span>)}</div>}
      {useChannel ? (
        <button className="btn primary lg" disabled={busy} onClick={punch}>{busy ? 'Recording…' : data.nextDirection === 'in' ? 'Clock in' : 'Clock out'}</button>
      ) : <div className="alert info">Web and mobile attendance are not enabled for your organization. Use the biometric device.</div>}
      {useChannel === 'mobile' && data.locationMode !== 'off' && <div className="muted" style={{ fontSize: 12 }}>Your location is {data.locationMode === 'required' ? 'required' : 'requested'} only when you clock in or out.</div>}
      {d && <div className="muted" style={{ fontSize: 12 }}>Worked so far: {fmtMinutes(d.worked_minutes)}</div>}
    </div>
  );
}

export function Dashboard() {
  const { me, hasModule, can } = useAuth();
  const inbox = useLoad(() => api.get('/api/v1/approvals/inbox'), []);
  const mine = useLoad(() => api.get('/api/v1/approvals/mine'), []);
  const pendingMine = (mine.data?.items ?? []).filter((x: any) => x.status === 'pending').length;
  const showPolicies = hasModule('core.policies') && can('policies.self') && !!me!.user.employeeId;
  const policies = useLoad(() => (showPolicies ? api.get('/api/v1/policies/mine') : Promise.resolve(null)), [showPolicies]);
  return (
    <div className="stack">
      <div><h1>Welcome, {me!.user.displayName}</h1><p className="sub">{me!.organization.name}</p></div>
      {policies.data?.pending > 0 && <Link to="/policies" className={`alert ${policies.data.overdue ? 'error' : 'warn'}`} style={{ textDecoration: 'none' }}>
        {policies.data.pending} polic{policies.data.pending === 1 ? 'y needs' : 'ies need'} your acknowledgement{policies.data.overdue ? ` — ${policies.data.overdue} overdue` : ''}. Open policies →</Link>}
      <div className="grid grid-2">
        {hasModule('attendance') && can('attendance.self') ? <PunchCard /> : <div className="card"><h3>Attendance</h3><p className="muted">Attendance is not enabled for your account.</p></div>}
        <div className="card stack">
          <h3>Requests</h3>
          <div className="grid grid-4">
            <Link to="/approvals" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><div className="v">{inbox.data?.items.length ?? '—'}</div><div className="l">Awaiting your approval</div></Link>
            <Link to="/approvals" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><div className="v">{mine.data ? pendingMine : '—'}</div><div className="l">Your pending requests</div></Link>
          </div>
          <div className="row">
            {hasModule('leave') && me!.user.employeeId && <Link to="/leave" className="btn" style={{ textDecoration: 'none' }}>Apply for leave</Link>}
            {hasModule('attendance.regularization') && me!.user.employeeId && <Link to="/attendance/me" className="btn" style={{ textDecoration: 'none' }}>Request attendance correction</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
