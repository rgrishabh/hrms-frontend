import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtTime, fmtMinutes, fmtDate, EXCEPTION_LABEL } from '../format';
import { useLoad, useToast, errText, StatusBadge, Loading, ErrorBox } from '../ui';

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

type Tone = 'neutral' | 'good' | 'warn' | 'bad';
interface Tile { key: string; label: string; value: number | string; detail?: string; href?: string; tone?: Tone }
interface Section { key: string; title: string; tiles: Tile[] }
interface ListBlock { key: string; title: string; items: { primary: string; secondary?: string; date?: string }[]; href?: string; more?: number }
interface Summary { today: string; sections: Section[]; lists: ListBlock[] }

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** One number with its label; the whole card links to the screen (or report) behind it. */
export function TileCard({ t }: { t: Tile }) {
  const body = (
    <>
      <div className="v">{typeof t.value === 'number' ? nf.format(t.value) : t.value}</div>
      <div className="l">{t.label}</div>
      {t.detail && <div className="d">{t.detail}</div>}
    </>
  );
  const cls = `tile${t.tone && t.tone !== 'neutral' ? ` ${t.tone}` : ''}`;
  return t.href ? <Link to={t.href} className={cls} data-tile={t.key}>{body}</Link> : <div className={cls} data-tile={t.key}>{body}</div>;
}

function SummaryBlocks() {
  const { data, loading, error } = useLoad(() => api.get<Summary>('/api/v1/dashboard'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { sections, lists } = data!;
  return (
    <>
      {sections.map((s) => (
        <section key={s.key} aria-label={s.title} className="stack" style={{ gap: 8 }}>
          <h2 className="section-title">{s.title}</h2>
          <div className="tiles">{s.tiles.map((t) => <TileCard key={t.key} t={t} />)}</div>
        </section>
      ))}
      {lists.length > 0 && (
        <div className="grid grid-2">
          {lists.map((l) => (
            <section key={l.key} className="card stack" aria-label={l.title} style={{ gap: 8 }}>
              <div className="row"><h3 style={{ margin: 0 }}>{l.title}</h3><span className="spacer" />{l.href && l.items.length > 0 && <Link to={l.href} style={{ fontSize: 13 }}>View all</Link>}</div>
              {!l.items.length ? <div className="muted">{l.key === 'on_leave_today' ? 'Nobody is on leave today.' : 'Nothing to show.'}</div> : (
                <ul className="plain-list">
                  {l.items.map((i, n) => (
                    <li key={n}><span>{i.primary}</span>{i.secondary && <span className="muted"> · {i.secondary}</span>}
                      {i.date && <span className="muted" style={{ float: 'right' }}>{l.key === 'on_leave_today' ? `until ${fmtDate(i.date)}` : fmtDate(i.date)}</span>}</li>
                  ))}
                  {(l.more ?? 0) > 0 && <li className="muted">and {l.more} more</li>}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function Dashboard() {
  const { me, hasModule, can } = useAuth();
  const inbox = useLoad(() => api.get('/api/v1/approvals/inbox'), []);
  const mine = useLoad(() => api.get('/api/v1/approvals/mine'), []);
  const pendingMine = (mine.data?.items ?? []).filter((x: any) => x.status === 'pending').length;
  const showPolicies = hasModule('core.policies') && can('policies.self') && !!me!.user.employeeId;
  const policies = useLoad(() => (showPolicies ? api.get('/api/v1/policies/mine') : Promise.resolve(null)), [showPolicies]);
  const awaiting = inbox.data?.items.length ?? 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div><h1>Welcome, {me!.user.displayName}</h1><p className="sub">{me!.organization.name}</p></div>
      {policies.data?.pending > 0 && <Link to="/policies" className={`alert ${policies.data.overdue ? 'error' : 'warn'}`} style={{ textDecoration: 'none' }}>
        {policies.data.pending} polic{policies.data.pending === 1 ? 'y needs' : 'ies need'} your acknowledgement{policies.data.overdue ? ` — ${policies.data.overdue} overdue` : ''}. Open policies →</Link>}
      <div className="grid grid-2">
        {hasModule('attendance') && can('attendance.self') ? <PunchCard /> : <div className="card"><h3>Attendance</h3><p className="muted">Attendance is not enabled for your account.</p></div>}
        <div className="card stack">
          <h3>Requests</h3>
          <div className="tiles">
            <TileCard t={{ key: 'awaiting', label: 'Awaiting your approval', value: inbox.data ? awaiting : '—', href: '/approvals', tone: awaiting ? 'warn' : 'neutral' }} />
            <TileCard t={{ key: 'mine', label: 'Your pending requests', value: mine.data ? pendingMine : '—', href: '/approvals' }} />
          </div>
          <div className="row">
            {hasModule('leave') && me!.user.employeeId && <Link to="/leave" className="btn" style={{ textDecoration: 'none' }}>Apply for leave</Link>}
            {hasModule('attendance.regularization') && me!.user.employeeId && <Link to="/attendance/me" className="btn" style={{ textDecoration: 'none' }}>Request attendance correction</Link>}
            {hasModule('expenses') && can('expenses.self') && me!.user.employeeId && <Link to="/expenses" className="btn" style={{ textDecoration: 'none' }}>New expense claim</Link>}
          </div>
        </div>
      </div>
      <SummaryBlocks />
    </div>
  );
}
