import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtTime, fmtMinutes, todayLocal, STATUS_LABEL, EXCEPTION_LABEL } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Pager, Empty, useToast, errText } from '../ui';

export function TeamAttendance() {
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [date, setDate] = useState(todayLocal());
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const url = `/api/v1/attendance/daily${qs({ date, branchId, status, exceptionsOnly: exceptionsOnly || undefined, page, pageSize: 50 })}`;
  const { data, loading, error, reload } = useLoad(() => api.get(url), [url]);
  const all = can('attendance.read');
  return (
    <div className="stack">
      <div><h1>{all ? 'Attendance' : 'Team attendance'}</h1><p className="sub">{all ? 'All active employees' : 'Employees in your reporting line'} · daily results</p></div>
      <div className="card row">
        <label className="field">Date<input type="date" value={date} max={todayLocal()} onChange={(e) => { setDate(e.target.value); setPage(1); }} /></label>
        {all && <label className="field">Branch<select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
          <option value="">All branches</option>{org.data?.branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label className="field">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="row" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={exceptionsOnly} onChange={(e) => { setExceptionsOnly(e.target.checked); setPage(1); }} /> Exceptions only</label>
        <span className="spacer" />
        {can('attendance.recalculate') && <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={async () => {
          try { const r = await api.post('/api/v1/attendance/recalculate', { from: date, to: date, branchId: branchId || undefined }); toast(`Recalculated ${r.daysCalculated} day(s)${r.lockedDaysSkipped ? `, ${r.lockedDaysSkipped} locked day(s) skipped` : ''}`); reload(); }
          catch (e) { toast(errText(e), 'error'); }
        }}>Recalculate this day</button>}
      </div>
      {data?.summary && <div className="row">{data.summary.map((s: any) => <span key={s.status} className="badge">{STATUS_LABEL[s.status] ?? s.status}: {s.count}</span>)}</div>}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data?.items.length ? <Empty>No employees match these filters.</Empty> : (
        <>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Employee</th><th>Branch</th><th>Shift</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Late</th><th>Exceptions</th></tr></thead>
            <tbody>{data.items.map((r: any) => (
              <tr key={r.employee_id} className="clickable" onClick={() => nav(`/employees/${r.employee_id}?tab=attendance`)}>
                <td><div>{r.name}</div><div className="muted">{r.employee_code}</div></td><td>{r.branch_name}</td><td>{r.shift_code ?? '—'}</td>
                <td><StatusBadge status={r.status} />{r.locked && <span className="badge info" style={{ marginLeft: 4 }}>Locked</span>}</td>
                <td>{fmtTime(r.first_in)}</td><td>{fmtTime(r.last_out)}</td><td>{r.worked_minutes != null ? fmtMinutes(r.worked_minutes) : '—'}</td>
                <td>{r.late_minutes ? `${r.late_minutes}m` : '—'}</td>
                <td>{(r.exceptions ?? []).map((x: string) => <span key={x} className="badge warn" style={{ marginRight: 4 }}>{EXCEPTION_LABEL[x] ?? x}</span>)}</td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
