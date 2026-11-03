import { useEffect, useState } from 'react';
import { api, qs, ApiError } from '../api';
import { useAuth } from '../auth';
import { fmtDate, todayLocal, addDays } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Modal, Field, Tabs, Confirm, Pager, useToast, errText } from '../ui';

type Tab = 'mine' | 'team' | 'admin';
const num = (s: string | number) => Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const halfLabel = (r: any) => `${fmtDate(r.start_date)}${r.start_half === 'second_half' ? ' (2nd half)' : ''}${r.end_date !== r.start_date || r.end_half !== 'full' ? ` → ${fmtDate(r.end_date)}${r.end_half === 'first_half' ? ' (1st half)' : ''}` : ''}`;

export function Leave() {
  const { can, canAny, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('leave.self')) tabs.push({ key: 'mine', label: 'My leave' });
  if (canAny('leave.team.read', 'leave.read', 'leave.manage')) tabs.push({ key: 'team', label: 'Team calendar' });
  if (can('leave.manage')) tabs.push({ key: 'admin', label: 'Administration' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to leave.</Empty>;
  return (
    <div className="stack">
      <div><h1>Leave</h1><p className="sub">Balances, requests and approvals. Policies are set by HR under Administration.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'mine' && <MyLeave />}
      {tab === 'team' && <TeamCalendar />}
      {tab === 'admin' && <LeaveAdmin />}
    </div>
  );
}

function MyLeave() {
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [cancel, setCancel] = useState<any>(null);
  const [page, setPage] = useState(1);
  const bal = useLoad(() => api.get('/api/v1/leave/balances'), []);
  const reqs = useLoad(() => api.get(`/api/v1/leave/requests${qs({ scope: 'mine', page, pageSize: 10 })}`), [page]);
  const today = todayLocal();
  return (
    <div className="stack">
      <div className="row"><span className="muted">{bal.data ? `Leave year ${fmtDate(bal.data.period.start)} – ${fmtDate(bal.data.period.end)}` : ''}</span><span className="spacer" />
        <button className="btn primary" onClick={() => setApplying(true)} disabled={!bal.data?.items.length}>Apply for leave</button></div>
      <ErrorBox error={bal.error} />
      {bal.loading ? <Loading /> : !bal.data.items.length ? <Empty>No leave types are set up yet. Ask HR.</Empty> : (
        <div className="grid grid-4">
          {bal.data.items.map((b: any) => (
            <div key={b.id} className="card stat">
              <div className="l">{b.name} <span className="mono">{b.code}</span>{!b.paid && <span className="badge" style={{ marginLeft: 4 }}>Unpaid</span>}</div>
              {b.requires_balance ? <>
                <div className="v">{num(b.available)}</div>
                <div className="l">available · {num(b.used)} used{Number(b.pending) > 0 ? ` · ${num(b.pending)} pending` : ''}</div>
              </> : <div className="l" style={{ marginTop: 8 }}>No balance needed</div>}
            </div>))}
        </div>
      )}
      <div className="card">
        <h2>My requests</h2>
        {reqs.loading ? <Loading /> : !reqs.data?.items.length ? <div className="muted">No leave requests yet.</div> : (
          <>
            <div className="table-wrap"><table className="t"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
              {reqs.data.items.map((r: any) => <tr key={r.id}><td>{r.type_name}</td><td>{halfLabel(r)}</td><td>{num(r.days)}</td><td>{r.reason}</td><td><StatusBadge status={r.status} /></td>
                <td>{(r.status === 'pending' || (r.status === 'approved' && r.start_date > today)) && <button className="btn sm" onClick={() => setCancel(r)}>Cancel</button>}</td></tr>)}
            </tbody></table></div>
            <Pager page={reqs.data.page} pageSize={reqs.data.pageSize} total={reqs.data.total} onPage={setPage} />
          </>
        )}
      </div>
      {applying && <ApplyForm types={bal.data.items} onClose={() => setApplying(false)} onDone={() => { bal.reload(); reqs.reload(); }} />}
      {cancel && <Confirm title="Cancel leave" message={`Cancel ${cancel.type_name} for ${halfLabel(cancel)}?${cancel.status === 'approved' ? ' The days will be returned to your balance.' : ''}`}
        confirmLabel="Cancel leave" danger onClose={() => setCancel(null)}
        onConfirm={async () => { await api.post(`/api/v1/leave/requests/${cancel.id}/cancel`, {}); toast('Leave cancelled'); bal.reload(); reqs.reload(); }} />}
    </div>
  );
}

export function ApplyForm({ types, employeeId, onClose, onDone }: { types: any[]; employeeId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const start0 = addDays(todayLocal(), 1);
  const [f, setF] = useState({ leaveTypeId: types[0]?.id ?? '', startDate: start0, endDate: start0, startHalf: 'full', endHalf: 'full', reason: '' });
  const [preview, setPreview] = useState<any>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === f.leaveTypeId);
  const body = { ...f, endDate: f.endDate < f.startDate ? f.startDate : f.endDate, employeeId, reason: undefined };
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.post('/api/v1/leave/requests/preview', body).then((p) => { if (alive) { setPreview(p); setPErr(null); } })
        .catch((e) => { if (alive) { setPreview(null); setPErr(errText(e)); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.leaveTypeId, f.startDate, f.endDate, f.startHalf, f.endHalf]);
  const single = body.startDate === body.endDate;
  return (
    <Modal title="Apply for leave" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { const r = await api.post('/api/v1/leave/requests', { ...body, reason: f.reason }); toast(`Leave requested: ${num(r.days)} day(s). Sent for approval.`); onDone(); onClose(); }
        catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="Leave type"><select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.requires_balance ? ` — ${num(t.available)} available` : ''}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="From"><input type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} /></Field>
          <Field label="To"><input type="date" required min={f.startDate} value={body.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        {type?.allow_half_day && (
          <div className="row">
            <label className="row"><input type="checkbox" checked={f.startHalf === 'second_half'} onChange={(e) => setF({ ...f, startHalf: e.target.checked ? 'second_half' : 'full', endHalf: e.target.checked && single ? 'full' : f.endHalf })} />
              {single ? 'Second half only' : 'Start in the second half'}</label>
            <label className="row"><input type="checkbox" checked={f.endHalf === 'first_half'} onChange={(e) => setF({ ...f, endHalf: e.target.checked ? 'first_half' : 'full', startHalf: e.target.checked && single ? 'full' : f.startHalf })} />
              {single ? 'First half only' : 'Return after the first half'}</label>
          </div>)}
        {preview && (
          <div className={`alert ${preview.sufficient ? 'info' : 'error'}`}>
            <strong>{num(preview.days)} day(s)</strong>{!preview.paid && ' (unpaid)'}
            {preview.requiresBalance && <> · {num(preview.available)} available{!preview.sufficient && ' — not enough balance'}</>}
            {preview.perDate.some((d: any) => d.fraction === 0) && <div className="muted" style={{ fontSize: 12 }}>Not counted (weekly off / holiday): {preview.perDate.filter((d: any) => d.fraction === 0).map((d: any) => fmtDate(d.date)).join(', ')}</div>}
          </div>)}
        {pErr && <div className="alert warn">{pErr}</div>}
        <Field label="Reason"><textarea required minLength={3} maxLength={1000} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !preview || !preview.sufficient}>{busy ? 'Submitting…' : 'Submit for approval'}</button></div>
      </form>
    </Modal>
  );
}

function TeamCalendar() {
  const [from, setFrom] = useState(todayLocal());
  const to = addDays(from, 27);
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/leave/calendar${qs({ from, to })}`), [from]);
  const days: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const people = new Map<string, { name: string; code: string; items: any[] }>();
  for (const r of data?.items ?? []) {
    const p = people.get(r.employee_id) ?? { name: r.name as string, code: r.employee_code as string, items: [] as any[] };
    p.items.push(r); people.set(r.employee_id, p);
  }
  const cell = (items: any[], d: string) => {
    const r = items.find((x) => x.start_date <= d && x.end_date >= d);
    if (!r) return null;
    const half = (d === r.start_date && r.start_half === 'second_half') || (d === r.end_date && r.end_half === 'first_half');
    return <span title={`${r.type_code} ${r.status}`} className={`badge ${r.status === 'approved' ? 'ok' : 'warn'}`} style={{ padding: '2px 4px', opacity: half ? 0.6 : 1 }}>{r.type_code}{half ? '½' : ''}</span>;
  };
  return (
    <div className="stack">
      <div className="row"><button className="btn sm" onClick={() => setFrom(addDays(from, -28))}>‹ Earlier</button><strong>{fmtDate(from)} – {fmtDate(to)}</strong>
        <button className="btn sm" onClick={() => setFrom(addDays(from, 28))}>Later ›</button><span className="spacer" />
        <span className="badge ok">Approved</span><span className="badge warn">Pending</span></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !people.size ? <Empty>No leave in this period.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th>{days.map((d) => <th key={d} style={{ padding: '6px 4px', textAlign: 'center' }}>{Number(d.slice(8))}</th>)}</tr></thead><tbody>
          {[...people.entries()].map(([id, p]) => <tr key={id}><td style={{ whiteSpace: 'nowrap' }}>{p.name} <span className="muted mono">{p.code}</span></td>
            {days.map((d) => <td key={d} style={{ padding: '6px 2px', textAlign: 'center' }}>{cell(p.items, d)}</td>)}</tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

const EMPTY_TYPE = { code: '', name: '', description: '', paid: true, allowHalfDay: true, requiresBalance: true, accrualMethod: 'annual', annualEntitlement: 0,
  carryForwardMax: 0, maxBalance: '' as number | '', countNonWorkingDays: false, minNoticeDays: 0, maxConsecutiveDays: '' as number | '', eligibleAfterDays: 0,
  applicableEmploymentTypes: [] as string[], status: 'active' };
const EMP_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];

function LeaveAdmin() {
  const toast = useToast();
  const types = useLoad(() => api.get('/api/v1/leave/types?includeInactive=true'), []);
  const [edit, setEdit] = useState<any>(null);
  const [year, setYear] = useState(Number(todayLocal().slice(0, 4)));
  const [through, setThrough] = useState(12);
  const [confirmYearEnd, setConfirmYearEnd] = useState(false);
  const [adjust, setAdjust] = useState(false);
  return (
    <div className="stack">
      <div className="alert info">Leave types are your organization's policy. Check statutory minimums for your state and establishment (e.g. Shops & Establishments rules, maternity benefit) with your HR or legal advisor before publishing them.</div>
      <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Leave types</h3><span className="spacer" /><button className="btn primary sm" onClick={() => setEdit({ ...EMPTY_TYPE })}>New leave type</button></div>
        {types.loading ? <Loading /> : !types.data?.items.length ? <div className="muted">No leave types yet.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Accrual</th><th>Entitlement / year</th><th>Carry forward</th><th>Rules</th><th>Status</th><th /></tr></thead><tbody>
            {types.data.items.map((t: any) => <tr key={t.id}><td className="mono">{t.code}</td><td>{t.name}{!t.paid && <span className="badge" style={{ marginLeft: 4 }}>Unpaid</span>}</td>
              <td>{t.requires_balance ? t.accrual_method : 'no balance'}</td><td>{t.requires_balance ? num(t.annual_entitlement) : '—'}</td><td>{num(t.carry_forward_max)}</td>
              <td className="muted" style={{ fontSize: 12 }}>{[t.allow_half_day && 'half days', t.count_non_working_days && 'sandwich', t.min_notice_days > 0 && `${t.min_notice_days}d notice`,
                t.max_consecutive_days && `max ${num(t.max_consecutive_days)}d`, t.eligible_after_days > 0 && `after ${t.eligible_after_days}d`,
                t.applicable_employment_types.length && t.applicable_employment_types.join('/')].filter(Boolean).join(' · ')}</td>
              <td><StatusBadge status={t.status} /></td>
              <td><button className="btn sm" onClick={() => setEdit({ id: t.id, code: t.code, name: t.name, description: t.description ?? '', paid: t.paid, allowHalfDay: t.allow_half_day,
                requiresBalance: t.requires_balance, accrualMethod: t.accrual_method, annualEntitlement: Number(t.annual_entitlement), carryForwardMax: Number(t.carry_forward_max),
                maxBalance: t.max_balance === null ? '' : Number(t.max_balance), countNonWorkingDays: t.count_non_working_days, minNoticeDays: t.min_notice_days,
                maxConsecutiveDays: t.max_consecutive_days === null ? '' : Number(t.max_consecutive_days), eligibleAfterDays: t.eligible_after_days,
                applicableEmploymentTypes: t.applicable_employment_types, status: t.status })}>Edit</button></td></tr>)}
          </tbody></table></div>)}
      </div>
      <div className="grid grid-2">
        <div className="card stack">
          <h3>Accruals</h3>
          <p className="muted" style={{ margin: 0 }}>Credits entitlements for the leave year. Safe to run repeatedly: nothing is credited twice. Monthly types accrue up to the chosen month.</p>
          <div className="row">
            <Field label="Leave year"><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} /></Field>
            <Field label="Through month of leave year"><input type="number" min={1} max={12} value={through} onChange={(e) => setThrough(Number(e.target.value))} style={{ width: 80 }} /></Field>
            <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={async () => {
              try { const r = await api.post('/api/v1/leave/accruals', { leaveYear: year, throughMonth: through }); toast(`Accruals: ${r.credited} credit(s) added, ${r.alreadyCredited} already done`); }
              catch (e) { toast(errText(e), 'error'); }
            }}>Run accruals</button>
          </div>
        </div>
        <div className="card stack">
          <h3>Year-end and adjustments</h3>
          <p className="muted" style={{ margin: 0 }}>Year-end carries balances forward up to each type's limit and lapses the rest. Adjustments record opening balances or corrections, with a note.</p>
          <div className="row"><button className="btn" onClick={() => setConfirmYearEnd(true)}>Close leave year {year}…</button><button className="btn" onClick={() => setAdjust(true)}>Adjust a balance…</button></div>
        </div>
      </div>
      {edit && <TypeForm type={edit} onClose={() => setEdit(null)} onSaved={() => { toast('Leave type saved'); types.reload(); }} />}
      {confirmYearEnd && <Confirm title={`Close leave year ${year}`} danger confirmLabel="Close year" onClose={() => setConfirmYearEnd(false)}
        message={`Balances above each type's carry-forward limit will lapse and the rest moves to ${year + 1}. All requests of ${year} must be decided first. This cannot be undone except by manual adjustments.`}
        onConfirm={async () => { const r = await api.post('/api/v1/leave/year-end', { leaveYear: year }); toast(`Year closed: ${num(r.daysCarried)} day(s) carried, ${num(r.daysLapsed)} lapsed`); }} />}
      {adjust && <AdjustForm types={types.data?.items ?? []} year={year} onClose={() => setAdjust(false)} />}
    </div>
  );
}

function TypeForm({ type, onClose, onSaved }: { type: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(type);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const n = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const b = (k: string) => (e: any) => setF({ ...f, [k]: e.target.checked });
  return (
    <Modal title={type.id ? `Edit ${type.code}` : 'New leave type'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null); setErrors({});
        const body = { ...f, description: f.description || null, maxBalance: f.maxBalance === '' ? null : f.maxBalance, maxConsecutiveDays: f.maxConsecutiveDays === '' ? null : f.maxConsecutiveDays,
          accrualMethod: f.requiresBalance ? f.accrualMethod : 'none' };
        delete body.id;
        try { if (type.id) await api.put(`/api/v1/leave/types/${type.id}`, body); else await api.post('/api/v1/leave/types', body); onSaved(); onClose(); }
        catch (x) {
          if (x instanceof ApiError && Array.isArray(x.details)) setErrors(Object.fromEntries(x.details.map((d: any) => [d.path, d.message])));
          setError(errText(x));
        }
      }}>
        <div className="form-grid">
          <Field label="Code" hint="e.g. CL, SL, EL" error={errors.code}><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name" error={errors.name}><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        </div>
        <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="row" style={{ gap: 16 }}>
          <label className="row"><input type="checkbox" checked={f.paid} onChange={b('paid')} /> Paid</label>
          <label className="row"><input type="checkbox" checked={f.requiresBalance} onChange={b('requiresBalance')} /> Needs a balance</label>
          <label className="row"><input type="checkbox" checked={f.allowHalfDay} onChange={b('allowHalfDay')} /> Half days allowed</label>
          <label className="row"><input type="checkbox" checked={f.countNonWorkingDays} onChange={b('countNonWorkingDays')} /> Count weekly offs/holidays inside leave</label>
        </div>
        {f.requiresBalance && <div className="form-grid">
          <Field label="Accrual" error={errors.accrualMethod}><select value={f.accrualMethod} onChange={(e) => setF({ ...f, accrualMethod: e.target.value })}>
            <option value="annual">Annual (credited at year start)</option><option value="monthly">Monthly (1/12 each month)</option><option value="none">None (manual adjustments only)</option></select></Field>
          <Field label="Entitlement per year (days)" error={errors.annualEntitlement}><input type="number" step={0.5} min={0} value={f.annualEntitlement} onChange={n('annualEntitlement')} /></Field>
          <Field label="Carry forward up to (days)" hint="0 = lapses at year end" error={errors.carryForwardMax}><input type="number" step={0.5} min={0} value={f.carryForwardMax} onChange={n('carryForwardMax')} /></Field>
          <Field label="Maximum balance (days)" hint="Blank = no cap" error={errors.maxBalance}><input type="number" step={0.5} min={0} value={f.maxBalance} onChange={n('maxBalance')} /></Field>
        </div>}
        <div className="form-grid">
          <Field label="Minimum notice (days)" error={errors.minNoticeDays}><input type="number" min={0} value={f.minNoticeDays} onChange={n('minNoticeDays')} /></Field>
          <Field label="Max days per request" hint="Blank = no limit" error={errors.maxConsecutiveDays}><input type="number" step={0.5} min={0.5} value={f.maxConsecutiveDays} onChange={n('maxConsecutiveDays')} /></Field>
          <Field label="Eligible after (days of service)" error={errors.eligibleAfterDays}><input type="number" min={0} value={f.eligibleAfterDays} onChange={n('eligibleAfterDays')} /></Field>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        </div>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6 }}><legend>Applies to (none ticked = everyone)</legend>
          <div className="row">{EMP_TYPES.map((t) => <label key={t} className="row"><input type="checkbox" checked={f.applicableEmploymentTypes.includes(t)}
            onChange={(e) => setF({ ...f, applicableEmploymentTypes: e.target.checked ? [...f.applicableEmploymentTypes, t] : f.applicableEmploymentTypes.filter((x: string) => x !== t) })} />{t}</label>)}</div>
        </fieldset>
        {type.id && <div className="muted" style={{ fontSize: 12 }}>Changes apply to new requests and accruals; past balances and approved leave are not rewritten.</div>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function AdjustForm({ types, year, onClose }: { types: any[]; year: number; onClose: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const emps = useLoad(() => api.get(`/api/v1/employees${qs({ search, pageSize: 20 })}`), [search]);
  const [f, setF] = useState({ employeeId: '', leaveTypeId: types[0]?.id ?? '', leaveYear: year, days: 0, entryType: 'adjustment', note: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Adjust a leave balance" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await api.post('/api/v1/leave/adjustments', f); toast('Balance adjusted'); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Employee"><input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select required value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">Select…</option>
            {emps.data?.items.map((x: any) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name} ({x.employee_code})</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Leave type"><select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Leave year"><input type="number" value={f.leaveYear} onChange={(e) => setF({ ...f, leaveYear: Number(e.target.value) })} /></Field>
          <Field label="Days (+ credit / − debit)" hint="Multiples of 0.5"><input type="number" step={0.5} required value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></Field>
          <Field label="Kind"><select value={f.entryType} onChange={(e) => setF({ ...f, entryType: e.target.value })}><option value="adjustment">Correction</option><option value="opening">Opening balance (migration)</option></select></Field>
        </div>
        <Field label="Note (kept in the ledger and audit log)"><textarea required minLength={5} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.days}>Save adjustment</button></div>
      </form>
    </Modal>
  );
}
