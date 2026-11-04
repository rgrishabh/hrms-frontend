import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtMinutes, fmtTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';

type Tab = 'mine' | 'team' | 'all';
const PAYOUT: Record<string, string> = { pay: 'Pay', comp_off: 'Compensatory off' };
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;
/** Days off earned (whole halves of the configured day), as the server computes it. */
const compDays = (minutes: number, dayMinutes: number) => Math.floor(minutes / (dayMinutes / 2)) / 2;

export function Overtime() {
  const { canAny, can, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('overtime.self')) tabs.push({ key: 'mine', label: 'My overtime' });
  if (can('overtime.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('overtime.read', 'overtime.approve', 'overtime.manage')) tabs.push({ key: 'all', label: 'All claims' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to overtime.</Empty>;
  return (
    <div className="stack">
      <div><h1>Overtime</h1><p className="sub">Overtime recorded by attendance, claimed as pay or compensatory off, approved by the manager and HR.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' ? <Mine /> : <Claims scope={tab} />}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const eligible = useLoad(() => api.get('/api/v1/overtime/eligible'), []);
  const claims = useLoad(() => api.get('/api/v1/overtime/claims?scope=mine&pageSize=50'), []);
  const [claim, setClaim] = useState<any | null>(null);
  const [withdraw, setWithdraw] = useState<any | null>(null);
  const reload = () => { eligible.reload(); claims.reload(); };
  if (eligible.loading) return <Loading />;
  if (eligible.error) return <ErrorBox error={eligible.error} />;
  const e = eligible.data;
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="ot-days">
        <h2 id="ot-days">Overtime to claim</h2>
        <p className="muted">Days in the last {e.windowDays} days where attendance recorded at least {e.minMinutes} minutes of overtime. If a day is wrong, correct your attendance first.</p>
        {!e.payout.pay && <div className="alert info">Overtime cannot be taken as pay yet: {e.payout.payBlocker}.{e.payout.compOff ? ' You can take it as compensatory off.' : ''}</div>}
        {!e.items.length ? <Empty>No unclaimed overtime.</Empty> : (
          <div className="table-wrap"><table className="t" aria-label="Overtime to claim"><thead><tr><th>Date</th><th>Shift</th><th>In – out</th><th>Worked</th><th>Overtime</th><th /></tr></thead><tbody>
            {e.items.map((d: any) => <tr key={d.work_date}><td>{fmtDate(d.work_date)}</td><td>{d.shift_code ?? '—'}</td><td>{fmtTime(d.first_in)} – {fmtTime(d.last_out)}</td>
              <td>{fmtMinutes(d.worked_minutes)}</td><td><strong>{fmtMinutes(d.overtime_minutes)}</strong></td>
              <td><button className="btn sm primary" disabled={!e.payout.pay && !e.payout.compOff} onClick={() => setClaim(d)}>Claim</button></td></tr>)}
          </tbody></table></div>)}
      </section>
      <section className="card stack" aria-labelledby="ot-claims">
        <h2 id="ot-claims">My claims</h2>
        {claims.loading ? <Loading /> : claims.error ? <ErrorBox error={claims.error} /> : !claims.data.items.length ? <Empty>No overtime claims yet.</Empty> : (
          <div className="table-wrap"><table className="t" aria-label="My overtime claims"><thead><tr><th>Date</th><th>Hours</th><th>Taken as</th><th>Status</th><th>Outcome</th><th /></tr></thead><tbody>
            {claims.data.items.map((c: any) => <tr key={c.id}><td>{fmtDate(c.work_date)}</td><td>{hours(c.minutes)}</td><td>{PAYOUT[c.payout]}</td><td><StatusBadge status={c.status} /></td>
              <td>{outcome(c)}</td>
              <td>{c.status === 'pending' && <button className="btn sm" onClick={() => setWithdraw(c)}>Withdraw</button>}</td></tr>)}
          </tbody></table></div>)}
      </section>
      {claim && <ClaimForm day={claim} payout={e.payout} onClose={() => setClaim(null)} onSaved={() => { toast('Overtime claimed; sent for approval'); reload(); }} />}
      {withdraw && <Confirm title="Withdraw overtime claim" message={`Withdraw your claim for ${hours(withdraw.minutes)} on ${fmtDate(withdraw.work_date)}? You can claim the day again.`}
        confirmLabel="Withdraw" onClose={() => setWithdraw(null)}
        onConfirm={async () => { await api.post(`/api/v1/overtime/claims/${withdraw.id}/withdraw`); toast('Claim withdrawn'); reload(); }} />}
    </div>
  );
}

function outcome(c: any) {
  if (c.status === 'cancelled' && c.cancel_reason) return <span className="muted">Cancelled: {c.cancel_reason}</span>;
  if (c.status !== 'approved') return <span className="muted">—</span>;
  if (c.payout === 'comp_off') return `${Number(c.comp_off_days)} day${Number(c.comp_off_days) === 1 ? '' : 's'} added to leave`;
  return c.payroll_period ? `In ${c.payroll_period} payroll${['finalized', 'paid'].includes(c.payroll_status) ? '' : ' (not final yet)'}` : 'In the next payroll';
}

function ClaimForm({ day, payout, onClose, onSaved }: { day: any; payout: any; onClose: () => void; onSaved: () => void }) {
  const [minutes, setMinutes] = useState<number>(day.overtime_minutes);
  const [as, setAs] = useState<'pay' | 'comp_off'>(payout.pay ? 'pay' : 'comp_off');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const comp = payout.compOff;
  const days = comp ? compDays(minutes || 0, comp.dayMinutes) : 0;
  return (
    <Modal title={`Claim overtime — ${fmtDate(day.work_date)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try { await api.post('/api/v1/overtime/claims', { workDate: day.work_date, minutes, payout: as, reason }); onSaved(); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="Minutes" hint={`Attendance recorded ${fmtMinutes(day.overtime_minutes)} of overtime; you can claim up to that.`}>
          <input type="number" min={1} max={day.overtime_minutes} required value={minutes || ''} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6 }}><legend>Take it as</legend>
          <label className="row"><input type="radio" name="payout" checked={as === 'pay'} disabled={!payout.pay} onChange={() => setAs('pay')} /> Pay{!payout.pay && <span className="muted"> (not available: {payout.payBlocker})</span>}</label>
          <label className="row"><input type="radio" name="payout" checked={as === 'comp_off'} disabled={!comp} onChange={() => setAs('comp_off')} /> Compensatory off{comp ? ` (${comp.name})` : <span className="muted"> (not offered)</span>}</label>
          {as === 'comp_off' && comp && <div className="muted" style={{ fontSize: 12 }}>{days > 0 ? `Earns ${days} day${days === 1 ? '' : 's'} off (${fmtMinutes(comp.dayMinutes)} of overtime = 1 day).` : `Needs at least ${fmtMinutes(comp.dayMinutes / 2)} for half a day off.`}</div>}
        </fieldset>
        <Field label="Reason"><textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needed the extra time (batch, client deadline, sampling trip…)" /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (as === 'comp_off' && days <= 0)}>{busy ? 'Sending…' : 'Submit for approval'}</button></div>
      </form>
    </Modal>
  );
}

function Claims({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState({ status: '', period: '' });
  const [page, setPage] = useState(1);
  const [cancel, setCancel] = useState<any | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/overtime/claims${qs({ scope, status: f.status || undefined, period: f.period || undefined, page, pageSize: 25 })}`), [scope, f, page]);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const totals = data?.minutesByStatus ?? {};
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="Month"><input type="month" value={f.period} onChange={(e) => set({ period: e.target.value })} /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>
          {['pending', 'approved', 'returned', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</select></Field>
        <span className="spacer" />
        {!loading && <div className="muted">Approved {hours(totals.approved ?? 0)} · pending {hours(totals.pending ?? 0)}</div>}
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No overtime claims match.</Empty> : (<>
        <div className="table-wrap"><table className="t" aria-label="Overtime claims"><thead><tr><th>Employee</th><th>Date</th><th>Hours</th><th>Recorded</th><th>Taken as</th><th>Reason</th><th>Status</th><th>Outcome</th><th /></tr></thead><tbody>
          {data.items.map((c: any) => <tr key={c.id}><td>{c.name}<div className="muted mono" style={{ fontSize: 12 }}>{c.employee_code}</div></td><td>{fmtDate(c.work_date)}</td>
            <td>{hours(c.minutes)}</td><td className="muted">{fmtMinutes(c.recorded_minutes)}</td><td>{PAYOUT[c.payout]}</td><td style={{ maxWidth: 260 }}>{c.reason}</td>
            <td><StatusBadge status={c.status} /></td><td>{outcome(c)}</td>
            <td>{scope === 'all' && can('overtime.manage') && c.status === 'approved' && !['pending', 'approved', 'finalized', 'paid'].includes(c.payroll_status ?? '') &&
              <button className="btn sm danger" onClick={() => setCancel(c)}>Cancel</button>}</td></tr>)}
        </tbody></table></div>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>)}
      {cancel && <Confirm title="Cancel approved overtime" danger requireComment confirmLabel="Cancel claim" onClose={() => setCancel(null)}
        message={<>Cancel {cancel.name}'s {hours(cancel.minutes)} on {fmtDate(cancel.work_date)}? {cancel.payout === 'comp_off' ? 'The compensatory off is taken back from their leave.' : 'It will not be paid.'}</>}
        onConfirm={async (reason) => {
          const r = await api.post(`/api/v1/overtime/claims/${cancel.id}/cancel`, { reason });
          toast(r.payrollRunToRecompute ? `Claim cancelled. Recompute the ${r.payrollRunToRecompute} payroll run.` : 'Claim cancelled');
          reload();
        }} />}
    </div>
  );
}
