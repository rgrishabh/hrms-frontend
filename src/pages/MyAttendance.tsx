import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtTime, fmtDateTime, fmtMinutes, todayLocal, addDays, localInputToIso, EXCEPTION_LABEL, STATUS_LABEL } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Modal, Field, useToast, errText } from '../ui';

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};

export function AttendanceCalendar({ employeeId, self }: { employeeId: string; self: boolean }) {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [regDate, setRegDate] = useState<string | null>(null);
  const { from, to } = monthBounds(month);
  const today = todayLocal();
  const url = self ? `/api/v1/attendance/me${qs({ from, to })}` : `/api/v1/attendance/employees/${employeeId}${qs({ from, to })}`;
  const { data, error, loading, reload } = useLoad(() => api.get(url), [url]);
  const { hasModule } = useAuth();
  const days: Record<string, any> = Object.fromEntries((data?.days ?? []).map((d: any) => [d.work_date, d]));
  const firstDow = new Date(from + 'T00:00:00Z').getUTCDay();
  const dates: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const sel = selected ? days[selected] : null;
  const counts: Record<string, number> = {};
  for (const d of Object.values(days)) counts[d.status] = (counts[d.status] ?? 0) + 1;
  // Punch window shown for a selected day: local midnight to noon the next day (covers overnight shifts).
  const winStart = selected ? Date.parse(localInputToIso(`${selected}T00:00`)) : 0;
  const winEnd = selected ? Date.parse(localInputToIso(`${addDays(selected, 1)}T12:00`)) : 0;
  const shiftMonth = (n: number) => { const [y, m] = month.split('-').map(Number) as [number, number]; const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(dt.toISOString().slice(0, 7)); setSelected(null); };

  return (
    <div className="stack">
      <div className="row">
        <button className="btn sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
        <strong>{new Date(from + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
        <button className="btn sm" onClick={() => shiftMonth(1)} disabled={to >= today} aria-label="Next month">›</button>
        <span className="spacer" />
        {Object.entries(counts).map(([k, v]) => <span key={k} className="badge">{STATUS_LABEL[k] ?? k}: {v}</span>)}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <div className="cal" role="grid" aria-label="Attendance calendar">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={'b' + i} />)}
          {dates.map((d) => {
            const r = days[d];
            return (
              <button key={d} className={`day ${r?.status ?? ''} ${selected === d ? 'sel' : ''}`} onClick={() => setSelected(d)} aria-label={`${fmtDate(d)} ${r ? STATUS_LABEL[r.status] : 'no record'}`}>
                <div className="n">{Number(d.slice(8))}</div>
                {r && <div>{STATUS_LABEL[r.status]}</div>}
                {r?.worked_minutes > 0 && <div className="muted">{fmtMinutes(r.worked_minutes)}</div>}
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="card stack">
          <div className="row"><h3 style={{ margin: 0 }}>{fmtDate(selected)}</h3>{sel && <StatusBadge status={sel.status} />}{sel?.locked && <span className="badge info">Locked for payroll</span>}<span className="spacer" />
            {self && hasModule('attendance.regularization') && !sel?.locked && selected <= today && <button className="btn sm" onClick={() => setRegDate(selected)}>Request correction</button>}</div>
          {sel ? (
            <div className="grid grid-4">
              <div className="stat"><div className="l">Shift</div><div>{sel.shift_code ?? 'None'}</div></div>
              <div className="stat"><div className="l">First in</div><div>{fmtTime(sel.first_in)}</div></div>
              <div className="stat"><div className="l">Last out</div><div>{fmtTime(sel.last_out)}</div></div>
              <div className="stat"><div className="l">Worked</div><div>{fmtMinutes(sel.worked_minutes)}</div></div>
              <div className="stat"><div className="l">Late</div><div>{sel.late_minutes ? `${sel.late_minutes} min` : '—'}</div></div>
              <div className="stat"><div className="l">Early exit</div><div>{sel.early_exit_minutes ? `${sel.early_exit_minutes} min` : '—'}</div></div>
              <div className="stat"><div className="l">Overtime</div><div>{sel.overtime_minutes ? fmtMinutes(sel.overtime_minutes) : '—'}</div></div>
              {Number(sel.leave_fraction) > 0 && <div className="stat"><div className="l">Leave</div><div>{sel.leave_type_code} · {Number(sel.leave_fraction) === 1 ? 'full day' : 'half day'}</div></div>}
              {Number(sel.duty_fraction) > 0 && <div className="stat"><div className="l">Field duty</div><div>{Number(sel.duty_fraction) === 1 ? 'full day' : 'half day'}</div></div>}
            </div>
          ) : <div className="muted">No calculated result for this day yet.</div>}
          {sel?.exceptions?.length > 0 && <div className="row">{sel.exceptions.map((x: string) => <span key={x} className="badge warn">{EXCEPTION_LABEL[x] ?? x}</span>)}</div>}
          <div>
            <h3>Raw punches</h3>
            {(data?.events ?? []).filter((e: any) => { const t = Date.parse(e.event_time); return t >= winStart && t < winEnd; }).map((e: any) => (
              <div key={e.id} className="muted">{fmtDateTime(e.event_time)} · {e.direction} · {e.source}{e.status !== 'accepted' ? ` (${e.status})` : ''}</div>
            ))}
          </div>
        </div>
      )}
      {regDate && <RegularizationForm date={regDate} onClose={() => setRegDate(null)} onDone={reload} />}
    </div>
  );
}

function RegularizationForm({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [inT, setIn] = useState(`${date}T09:30`);
  const [outT, setOut] = useState(`${date}T18:00`);
  const [useIn, setUseIn] = useState(true);
  const [useOut, setUseOut] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Attendance correction · ${fmtDate(date)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          await api.post('/api/v1/attendance/regularizations', { workDate: date, requestedIn: useIn ? localInputToIso(inT) : undefined, requestedOut: useOut ? localInputToIso(outT) : undefined, reason });
          toast('Correction request submitted for approval'); onDone(); onClose();
        } catch (err) { setError(errText(err)); } finally { setBusy(false); }
      }}>
        <p className="muted" style={{ margin: 0 }}>Your original punches are kept. If approved, these times are added as corrections and the day is recalculated.</p>
        <div className="row"><label className="row"><input type="checkbox" checked={useIn} onChange={(e) => setUseIn(e.target.checked)} /> In time</label><input type="datetime-local" value={inT} disabled={!useIn} onChange={(e) => setIn(e.target.value)} /></div>
        <div className="row"><label className="row"><input type="checkbox" checked={useOut} onChange={(e) => setUseOut(e.target.checked)} /> Out time</label><input type="datetime-local" value={outT} disabled={!useOut} onChange={(e) => setOut(e.target.value)} /></div>
        <Field label="Reason" hint="At least 5 characters"><textarea required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (!useIn && !useOut)}>{busy ? 'Submitting…' : 'Submit request'}</button></div>
      </form>
    </Modal>
  );
}

export function MyAttendance() {
  const { me } = useAuth();
  const regs = useLoad(() => api.get('/api/v1/attendance/regularizations?scope=mine&pageSize=10'), []);
  return (
    <div className="stack">
      <div><h1>My attendance</h1><p className="sub">Daily results are calculated from your punches, shift and holidays. Select a day for details.</p></div>
      <div className="card"><AttendanceCalendar employeeId={me!.user.employeeId!} self /></div>
      <div className="card">
        <h2>My correction requests</h2>
        {regs.loading ? <Loading /> : regs.data?.items.length ? (
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Reason</th><th>Status</th></tr></thead><tbody>
            {regs.data.items.map((r: any) => <tr key={r.id}><td>{fmtDate(r.work_date)}</td><td>{fmtTime(r.requested_in)}</td><td>{fmtTime(r.requested_out)}</td><td>{r.reason}</td><td><StatusBadge status={r.status} /></td></tr>)}
          </tbody></table></div>
        ) : <div className="muted">No requests yet.</div>}
      </div>
    </div>
  );
}
