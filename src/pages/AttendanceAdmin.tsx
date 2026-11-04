import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, fmtMinutes, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Modal, Field, Tabs, Confirm, useToast, errText } from '../ui';
import { RosterSetup } from './Rosters';

type Tab = 'shifts' | 'rosters' | 'holidays' | 'devices' | 'locks';

export function AttendanceAdmin() {
  const { can, canAny, hasModule } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (canAny('attendance.configure') && hasModule('shifts')) tabs.push({ key: 'shifts', label: 'Shifts' }, { key: 'rosters', label: 'Rosters' });
  if (canAny('attendance.configure') && hasModule('holidays')) tabs.push({ key: 'holidays', label: 'Holidays' });
  if (canAny('attendance.devices.manage') && hasModule('attendance')) tabs.push({ key: 'devices', label: 'Biometric devices' });
  if (canAny('attendance.lock', 'attendance.read')) tabs.push({ key: 'locks', label: 'Payroll locks' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'shifts');
  if (!tabs.length) return <Empty>There is nothing to set up here with your permissions and the modules that are on.</Empty>;
  return (
    <div className="stack">
      <div><h1>Attendance setup</h1><p className="sub">Shift policies, rotating rosters, holiday calendars, devices and payroll period locks.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'shifts' && <Shifts />}
      {tab === 'rosters' && <RosterSetup />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'devices' && <Devices />}
      {tab === 'locks' && <Locks canLock={can('attendance.lock')} />}
    </div>
  );
}

const EMPTY_SHIFT = { code: '', name: '', startTime: '09:30', endTime: '18:00', breakMinutes: 30, graceMinutes: 10, earlyExitGraceMinutes: 10, halfDayMinMinutes: 240, fullDayMinMinutes: 450, overtimeAfterMinutes: '' as number | '', status: 'active' };

function Shifts() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/attendance/shifts'), []);
  const [edit, setEdit] = useState<any | null>(null);
  const [assign, setAssign] = useState<any | null>(null);
  return (
    <div className="stack">
      <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setEdit({ ...EMPTY_SHIFT })}>New shift</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No shifts yet.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Timing</th><th>Break</th><th>Grace</th><th>Full / half day</th><th>OT after</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((s: any) => (
            <tr key={s.id}><td className="mono">{s.code}</td><td>{s.name}</td><td>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}{s.overnight && <span className="badge info" style={{ marginLeft: 6 }}>Overnight</span>}</td>
              <td>{s.break_minutes}m</td><td>{s.grace_minutes}m / {s.early_exit_grace_minutes}m</td><td>{fmtMinutes(s.full_day_min_minutes)} / {fmtMinutes(s.half_day_min_minutes)}</td>
              <td>{s.overtime_after_minutes ? fmtMinutes(s.overtime_after_minutes) : '—'}</td><td><StatusBadge status={s.status} /></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setEdit({ id: s.id, code: s.code, name: s.name, startTime: s.start_time.slice(0, 5), endTime: s.end_time.slice(0, 5),
                breakMinutes: s.break_minutes, graceMinutes: s.grace_minutes, earlyExitGraceMinutes: s.early_exit_grace_minutes, halfDayMinMinutes: s.half_day_min_minutes,
                fullDayMinMinutes: s.full_day_min_minutes, overtimeAfterMinutes: s.overtime_after_minutes ?? '', status: s.status })}>Edit</button>
                {s.status === 'active' && <button className="btn sm" onClick={() => setAssign(s)}>Assign</button>}</div></td></tr>))}
        </tbody></table></div>
      )}
      {edit && <ShiftForm shift={edit} onClose={() => setEdit(null)} onSaved={() => { toast('Shift saved. Recalculate affected dates from Team attendance if needed.'); reload(); }} />}
      {assign && <AssignShift shift={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}

function ShiftForm({ shift, onClose, onSaved }: { shift: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(shift);
  const [error, setError] = useState<string | null>(null);
  const num = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const overnight = f.endTime <= f.startTime;
  return (
    <Modal title={shift.id ? 'Edit shift' : 'New shift'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const body = { ...f, overtimeAfterMinutes: f.overtimeAfterMinutes === '' ? null : f.overtimeAfterMinutes }; delete body.id;
        try { if (shift.id) await api.put(`/api/v1/attendance/shifts/${shift.id}`, body); else await api.post('/api/v1/attendance/shifts', body); onSaved(); onClose(); }
        catch (err) { setError(errText(err)); }
      }}>
        <div className="form-grid">
          <Field label="Code" hint="e.g. GEN, NIGHT"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Start time"><input type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="End time" hint={overnight ? 'Ends next day (overnight shift)' : undefined}><input type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
          <Field label="Break (minutes)" hint="Deducted when the day has a single in/out pair"><input type="number" min={0} value={f.breakMinutes} onChange={num('breakMinutes')} /></Field>
          <Field label="Late grace (minutes)"><input type="number" min={0} value={f.graceMinutes} onChange={num('graceMinutes')} /></Field>
          <Field label="Early-exit grace (minutes)"><input type="number" min={0} value={f.earlyExitGraceMinutes} onChange={num('earlyExitGraceMinutes')} /></Field>
          <Field label="Full-day minimum (minutes)"><input type="number" min={60} value={f.fullDayMinMinutes} onChange={num('fullDayMinMinutes')} /></Field>
          <Field label="Half-day minimum (minutes)"><input type="number" min={30} value={f.halfDayMinMinutes} onChange={num('halfDayMinMinutes')} /></Field>
          <Field label="Overtime after (minutes)" hint="Blank = no overtime"><input type="number" min={60} value={f.overtimeAfterMinutes} onChange={num('overtimeAfterMinutes')} /></Field>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        </div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function AssignShift({ shift, onClose }: { shift: any; onClose: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);
  const emps = useLoad(() => api.get(`/api/v1/employees${qs({ search, status: 'active', pageSize: 50 })}`), [search]);
  return (
    <Modal title={`Assign ${shift.code} shift`} onClose={onClose}>
      <div className="stack">
        <Field label="Effective from" hint="The employee's previous shift ends the day before"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <input placeholder="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
        <div style={{ maxHeight: 240, overflowY: 'auto' }} className="stack">
          {emps.data?.items.map((e: any) => (
            <label key={e.id} className="row"><input type="checkbox" checked={!!selected[e.id]} onChange={(x) => { const s = { ...selected }; if (x.target.checked) s[e.id] = e.first_name; else delete s[e.id]; setSelected(s); }} />
              {e.first_name} {e.last_name} <span className="muted mono">{e.employee_code}</span></label>))}
        </div>
        <ErrorBox error={error} />
        <div className="row"><span className="muted">{Object.keys(selected).length} selected</span><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!Object.keys(selected).length} onClick={async () => {
            try { const r = await api.post('/api/v1/attendance/shift-assignments', { employeeIds: Object.keys(selected), shiftId: shift.id, effectiveFrom: from }); toast(`Assigned ${r.assigned} employee(s)`); onClose(); }
            catch (e) { setError(errText(e)); }
          }}>Assign</button></div>
      </div>
    </Modal>
  );
}

function Holidays() {
  const toast = useToast();
  const [year, setYear] = useState(Number(todayLocal().slice(0, 4)));
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/attendance/holidays?year=${year}`), [year]);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const [f, setF] = useState({ holidayDate: '', name: '', branchId: '', optional: false });
  const [del, setDel] = useState<any>(null);
  return (
    <div className="stack">
      <form className="card row" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post('/api/v1/attendance/holidays', { ...f, branchId: f.branchId || null }); toast('Holiday added'); setF({ holidayDate: '', name: '', branchId: '', optional: false }); reload(); }
        catch (err) { toast(errText(err), 'error'); }
      }}>
        <Field label="Date"><input type="date" required value={f.holidayDate} onChange={(e) => setF({ ...f, holidayDate: e.target.value })} /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Diwali" /></Field>
        <Field label="Applies to"><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">All branches</option>{org.data?.branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <label className="row" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={f.optional} onChange={(e) => setF({ ...f, optional: e.target.checked })} /> Optional (restricted) holiday</label>
        <button className="btn primary" style={{ alignSelf: 'flex-end' }}>Add holiday</button>
      </form>
      <div className="row"><button className="btn sm" onClick={() => setYear(year - 1)}>‹ {year - 1}</button><strong>{year}</strong><button className="btn sm" onClick={() => setYear(year + 1)}>{year + 1} ›</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No holidays for {year}.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Holiday</th><th>Applies to</th><th>Type</th><th /></tr></thead><tbody>
          {data.items.map((h: any) => <tr key={h.id}><td>{fmtDate(h.holiday_date)}</td><td>{h.name}</td><td>{h.branch_name ?? 'All branches'}</td><td>{h.optional ? 'Optional' : 'Mandatory'}</td>
            <td><button className="btn sm danger" onClick={() => setDel(h)}>Remove</button></td></tr>)}
        </tbody></table></div>
      )}
      {del && <Confirm title="Remove holiday" message={`Remove ${del.name} (${fmtDate(del.holiday_date)})? Recalculate attendance for that date afterwards.`} confirmLabel="Remove" danger
        onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/v1/attendance/holidays/${del.id}`); toast('Holiday removed'); reload(); }} />}
    </div>
  );
}

function Devices() {
  const toast = useToast();
  const { hasModule } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/attendance/devices'), []);
  const unmapped = useLoad(() => api.get('/api/v1/attendance/device-events/unmapped'), []);
  const mappings = useLoad(() => api.get('/api/v1/attendance/device-mappings'), []);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const mods = useLoad(() => api.get('/api/v1/tenant/installation').catch(() => null), []);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [f, setF] = useState({ branchId: '', serialNumber: '', name: '', adapterKey: 'generic_push_v1' });
  const [mapUser, setMapUser] = useState<string | null>(null);
  const bio = mods.data?.items?.find((m: any) => m.key === 'attendance.biometric');
  return (
    <div className="stack">
      {!hasModule('attendance.biometric') && <div className="alert warn">Biometric attendance is not fully active{bio ? `: ${bio.blockers.join('; ')}` : ''}. Devices can be registered once the module is enabled for this installation (deployment setting ENABLED_MODULES).</div>}
      <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setRegistering(true)}>Register device</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No devices registered.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Device</th><th>Branch</th><th>Status</th><th>Last sync</th><th>Clock drift</th><th>Unmapped</th><th /></tr></thead><tbody>
          {data.items.map((d: any) => (
            <tr key={d.id}><td><div>{d.name}</div><div className="muted mono">{d.serial_number} · {d.api_key_prefix}</div></td><td>{d.branch_name}</td><td><StatusBadge status={d.status} /></td>
              <td>{d.last_sync_at ? fmtDateTime(d.last_sync_at) : <span className="muted">Never</span>}</td>
              <td>{d.last_clock_drift_seconds != null ? `${d.last_clock_drift_seconds}s` : '—'}{d.last_error && <div className="badge warn">{d.last_error}</div>}</td>
              <td>{d.unmapped_events || '—'}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm" onClick={async () => { try { setNewKey((await api.post(`/api/v1/attendance/devices/${d.id}/rotate-key`)).apiKey); } catch (e) { toast(errText(e), 'error'); } }}>Rotate key</button>
                <button className="btn sm" onClick={async () => { try { await api.patch(`/api/v1/attendance/devices/${d.id}`, { status: d.status === 'active' ? 'disabled' : 'active' }); reload(); } catch (e) { toast(errText(e), 'error'); } }}>{d.status === 'active' ? 'Disable' : 'Activate'}</button>
              </div></td></tr>))}
        </tbody></table></div>
      )}
      <div className="card stack">
        <h3>Unmapped device events</h3>
        <p className="muted" style={{ margin: 0 }}>Punches from device enrolment IDs that are not linked to an employee. Map the ID and these events are processed automatically.</p>
        {unmapped.loading ? <Loading /> : !unmapped.data?.items.length ? <div className="muted">Queue is empty.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Device user ID</th><th>Time</th><th>Device</th><th /></tr></thead><tbody>
            {unmapped.data.items.map((e: any) => <tr key={e.id}><td className="mono">{e.device_user_id}</td><td>{fmtDateTime(e.event_time)}</td><td>{e.device_name}</td><td><button className="btn sm" onClick={() => setMapUser(e.device_user_id)}>Map to employee</button></td></tr>)}
          </tbody></table></div>
        )}
      </div>
      <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Enrolment ID mappings</h3><span className="spacer" /><button className="btn sm" onClick={() => setMapUser('')}>Add mapping</button></div>
        {mappings.data?.items.length ? (
          <div className="table-wrap"><table className="t"><thead><tr><th>Device user ID</th><th>Employee</th></tr></thead><tbody>
            {mappings.data.items.map((m: any) => <tr key={m.device_user_id}><td className="mono">{m.device_user_id}</td><td>{m.name} <span className="muted mono">{m.employee_code}</span></td></tr>)}
          </tbody></table></div>) : <div className="muted">No mappings yet.</div>}
      </div>
      {registering && (
        <Modal title="Register biometric device" onClose={() => setRegistering(false)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            try { const r = await api.post('/api/v1/attendance/devices', f); setRegistering(false); setNewKey(r.apiKey); reload(); } catch (err) { toast(errText(err), 'error'); }
          }}>
            <Field label="Branch"><select required value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">Select…</option>{org.data?.branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Serial number"><input required value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></Field>
            <Field label="Name" hint="e.g. Main gate, Lab 2 entrance"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Integration adapter" hint="Push contract documented in docs/BIOMETRIC_INTEGRATION.md"><select value={f.adapterKey} onChange={(e) => setF({ ...f, adapterKey: e.target.value })}><option value="generic_push_v1">Generic push (v1)</option></select></Field>
            <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setRegistering(false)}>Cancel</button><button className="btn primary">Register</button></div>
          </form>
        </Modal>
      )}
      {newKey && (
        <Modal title="Device API key" onClose={() => setNewKey(null)}>
          <div className="stack">
            <div className="alert warn">Copy this key into the device or bridge configuration now. It will not be shown again.</div>
            <div className="mono card">{newKey}</div>
            <div className="row"><span className="spacer" /><button className="btn" onClick={() => navigator.clipboard.writeText(newKey).then(() => toast('Copied'))}>Copy</button><button className="btn primary" onClick={() => setNewKey(null)}>Done</button></div>
          </div>
        </Modal>
      )}
      {mapUser !== null && <MapDialog initial={mapUser} onClose={() => setMapUser(null)} onDone={() => { unmapped.reload(); mappings.reload(); reload(); }} />}
    </div>
  );
}

function MapDialog({ initial, onClose, onDone }: { initial: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [deviceUserId, setDeviceUserId] = useState(initial);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const emps = useLoad(() => api.get(`/api/v1/employees${qs({ search, status: 'active', pageSize: 20 })}`), [search]);
  return (
    <Modal title="Map device enrolment ID" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        try { const r = await api.put(`/api/v1/attendance/device-mappings/${encodeURIComponent(deviceUserId)}`, { employeeId }); toast(`Mapped. ${r.reprocessedEvents} queued event(s) processed.`); onDone(); onClose(); }
        catch (err) { toast(errText(err), 'error'); }
      }}>
        <Field label="Device user ID"><input required value={deviceUserId} onChange={(e) => setDeviceUserId(e.target.value)} /></Field>
        <Field label="Employee"><input placeholder="Search" aria-label="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select required aria-label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select…</option>{emps.data?.items.map((x: any) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name} ({x.employee_code})</option>)}</select></Field>
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save mapping</button></div>
      </form>
    </Modal>
  );
}

function Locks({ canLock }: { canLock: boolean }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/attendance/locks'), []);
  const [f, setF] = useState({ periodStart: '', periodEnd: '' });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack">
      {canLock && (
        <form className="card row" onSubmit={(e) => { e.preventDefault(); setConfirm(true); }}>
          <Field label="Period start"><input type="date" required value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="Period end"><input type="date" required value={f.periodEnd} min={f.periodStart} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
          <button className="btn primary" style={{ alignSelf: 'flex-end' }}>Lock period…</button>
        </form>
      )}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No locked periods.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Period</th><th>Locked by</th><th>Locked at</th></tr></thead><tbody>
          {data.items.map((l: any) => <tr key={l.id}><td>{fmtDate(l.period_start)} – {fmtDate(l.period_end)}</td><td>{l.locked_by}</td><td>{fmtDateTime(l.locked_at)}</td></tr>)}
        </tbody></table></div>
      )}
      {confirm && <Confirm title="Lock attendance period" danger confirmLabel="Lock period" onClose={() => setConfirm(false)}
        message={<>All attendance from <strong>{fmtDate(f.periodStart)}</strong> to <strong>{fmtDate(f.periodEnd)}</strong> will be recalculated and then frozen for payroll. Corrections and recalculation will no longer change these days. Locking fails if correction requests are still pending.</>}
        onConfirm={async () => { const r = await api.post('/api/v1/attendance/locks', f); toast(`Locked ${r.rowsLocked} attendance records`); reload(); }} />}
    </div>
  );
}
