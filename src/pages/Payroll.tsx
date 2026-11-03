import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, money } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, StatusBadge, Confirm, useToast, errText } from '../ui';

type Tab = 'runs' | 'salaries' | 'components' | 'statutory';
const RULE_LABEL: Record<string, string> = { pf: 'Provident fund', esi: 'ESI', pt: 'Professional tax', lwf: 'Labour welfare fund', tds: 'Income tax (TDS)' };
const RULE_HELP: Record<string, string> = {
  pf: '{"employeeRate": …, "employerRate": …, "epsRate": …, "wageCeiling": …, "ceilingOnEmployee": true, "ceilingOnEmployer": true}',
  esi: '{"employeeRate": …, "employerRate": …, "wageThreshold": …, "rounding": "up"}',
  pt: '{"slabs": [{"upTo": …, "amount": …}, {"upTo": null, "amount": …, "monthAmounts": {"02": …}}]}',
  lwf: '{"employee": …, "employer": …, "months": [6, 12]}',
  tds: '{"slabs": [{"upTo": …, "rate": …}, {"upTo": null, "rate": …}], "standardDeduction": …, "rebateLimit": …, "rebateMax": …, "cessRate": …}',
};
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };

export function Payroll() {
  const { can, canAny, hasModule } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: { key: Tab; label: string }[] = [{ key: 'runs', label: 'Payroll runs' }, { key: 'salaries', label: 'Salaries' }];
  if (canAny('payroll.manage', 'payroll.read')) tabs.push({ key: 'components', label: 'Components' });
  if (hasModule('payroll.statutory') && canAny('payroll.statutory', 'payroll.read')) tabs.push({ key: 'statutory', label: 'Statutory rules' });
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? 'runs') as Tab;
  void can;
  return (
    <div className="stack">
      <div><h1>Payroll</h1><p className="sub">Runs are computed from attendance, approved by a second person and locked when finalized. Statutory values come only from rules you enter and verify.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'runs' && <Runs />}
      {tab === 'salaries' && <Salaries />}
      {tab === 'components' && <Components />}
      {tab === 'statutory' && <StatutoryRules />}
    </div>
  );
}

// ------------------------------------------------------------------ runs
function Runs() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/payroll/runs'), []);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ period: lastMonth(), legalEntityId: '', kind: 'regular', employeeId: '' });
  return (
    <div className="stack">
      {can('payroll.manage') && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setCreating(true)}>New run</button></div>}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No payroll runs yet. Set up components, salaries and statutory rules first.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Period</th><th>Entity</th><th>Kind</th><th>Employees</th><th>Gross</th><th>Net</th><th>Warnings</th><th>Status</th></tr></thead><tbody>
          {data.items.map((r: any) => <tr key={r.id} className="clickable" onClick={() => setOpen(r.id)}><td className="mono">{r.period}</td><td>{r.legal_entity_name}</td>
            <td>{r.kind === 'fnf' ? `F&F · ${r.employee_name}` : 'Regular'}</td><td>{r.totals?.employees ?? '—'}</td><td>{r.totals?.gross != null ? money(r.totals.gross) : '—'}</td>
            <td>{r.totals?.net != null ? money(r.totals.net) : '—'}</td><td>{r.warnings ? <span className={`badge ${r.warnings_acknowledged ? '' : 'warn'}`}>{r.warnings}{r.warnings_acknowledged ? ' ✓' : ''}</span> : '—'}</td>
            <td><StatusBadge status={r.status} /></td></tr>)}
        </tbody></table></div>)}
      {creating && <Modal title="New payroll run" onClose={() => setCreating(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { const r = await api.post('/api/v1/payroll/runs', { ...f, employeeId: f.kind === 'fnf' ? f.employeeId : undefined }); setCreating(false); reload(); setOpen(r.id); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Month"><input type="month" required value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
            <Field label="Legal entity"><select required value={f.legalEntityId} onChange={(e) => setF({ ...f, legalEntityId: e.target.value })}><option value="">Select…</option>
              {(org.data?.legalEntities ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="regular">Regular monthly</option><option value="fnf">Full & final (one leaver)</option></select></Field>
            {f.kind === 'fnf' && <Field label="Employee id" hint="From the separation"><input required value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} /></Field>}
          </div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary">Create</button></div>
        </form></Modal>}
      {open && <RunDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: r, loading, error, reload } = useLoad(() => api.get(`/api/v1/payroll/runs/${id}`), [id]);
  const [item, setItem] = useState<any>(null);
  const [adj, setAdj] = useState<any>(null);
  const [ack, setAck] = useState(false);
  const [paid, setPaid] = useState(false);
  const run = async (path: string, body: unknown, msg: string) => { try { await api.post(`/api/v1/payroll/runs/${id}/${path}`, body); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  const editable = r && ['draft', 'computed'].includes(r.status);
  return (
    <Modal title={r ? `Payroll ${r.period} — ${r.legal_entity_name}` : 'Payroll run'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={r.status} />{r.kind === 'fnf' && <span className="badge info">F&amp;F</span>}
            <span className="muted">{r.computed_at ? `computed ${fmtDateTime(r.computed_at)}` : 'not computed'}</span><span className="spacer" />
            {!r.attendanceLocked && <span className="badge warn">Attendance not locked for {r.period}</span>}</div>
          {r.totals?.employees != null && <div className="grid grid-4">
            {[['Employees', r.totals.employees], ['Gross', money(r.totals.gross)], ['Net', money(r.totals.net)], ['Employer cost', money(r.totals.employerCost)]].map(([l, v]) =>
              <div key={l as string} className="card stat"><div className="l">{l}</div><div className="v">{v}</div></div>)}</div>}
          {can('payroll.manage') && <div className="row">
            {editable && <button className="btn primary" onClick={() => run('compute', undefined, 'Computed')}>{r.status === 'draft' ? 'Compute' : 'Recompute'}</button>}
            {r.status === 'computed' && r.warnings > 0 && !r.warnings_acknowledged && <button className="btn" onClick={() => setAck(true)}>Acknowledge {r.warnings} warning(s)</button>}
            {r.status === 'computed' && <button className="btn primary" onClick={() => run('submit', undefined, 'Sent for approval')}>Submit for approval</button>}
            {r.status === 'approved' && <button className="btn primary" onClick={() => run('finalize', undefined, 'Finalized; payslips published')}>Finalize</button>}
            {r.status === 'finalized' && <button className="btn primary" onClick={() => setPaid(true)}>Mark paid</button>}
            {editable && <button className="btn danger" onClick={() => run('cancel', undefined, 'Cancelled')}>Cancel run</button>}
            <span className="spacer" />
            <a className="btn sm" href={`/api/v1/payroll/runs/${id}/register.csv`} style={{ textDecoration: 'none' }}>Register CSV</a>
            {['finalized', 'paid'].includes(r.status) && <>{['bank', 'pf', 'esi'].map((x) => <a key={x} className="btn sm" href={`/api/v1/payroll/runs/${id}/${x}.csv`} style={{ textDecoration: 'none' }}>{x.toUpperCase()} CSV</a>)}</>}
          </div>}
          {!r.items.length ? <div className="muted">{r.status === 'draft' ? 'Compute the run to see employees.' : 'No employees with an active salary in this entity.'}</div> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Paid days</th><th>LOP</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Warnings</th><th /></tr></thead><tbody>
              {r.items.map((i: any) => <tr key={i.id}><td>{i.employee_name} <span className="muted mono">{i.employee_code}</span>{i.hold && <span className="badge danger" style={{ marginLeft: 6 }}>Hold</span>}</td>
                <td>{Number(i.paid_days)}/{Number(i.employed_days)}</td><td>{Number(i.lop_days) || '—'}</td><td>{money(i.gross)}</td><td>{money(i.deductions)}</td><td><strong>{money(i.net)}</strong></td>
                <td style={{ fontSize: 12 }}>{i.warnings.length ? i.warnings.map((w: string, k: number) => <div key={k} className="muted">⚠ {w}</div>) : '—'}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setItem(i)}>Lines</button>
                  {editable && can('payroll.manage') && <button className="btn sm" onClick={() => setAdj({ employeeId: i.employee_id, name: i.employee_name, kind: 'earning', label: '', amount: '', taxable: true, note: '' })}>Adjust</button>}
                  {r.status === 'computed' && can('payroll.manage') && Number(i.net) >= 0 && <button className="btn sm" onClick={() => run('hold', { employeeId: i.employee_id, hold: !i.hold }, i.hold ? 'Released' : 'On hold')}>{i.hold ? 'Release' : 'Hold'}</button>}</div></td></tr>)}
            </tbody></table></div>)}
          {r.adjustments.length > 0 && <div className="stack" style={{ gap: 2 }}><strong>Adjustments</strong>{r.adjustments.map((x: any) => <div key={x.id} className="row" style={{ fontSize: 13 }}>
            <span>{r.items.find((i: any) => i.employee_id === x.employee_id)?.employee_name ?? ''}: {x.label} · {x.kind === 'lop_days' ? `${x.amount} LOP day(s)` : `${x.kind} ${money(x.amount)}`} <span className="muted">by {x.created_by_name}</span></span>
            {editable && can('payroll.manage') && <button className="btn sm" onClick={async () => { try { await api.del(`/api/v1/payroll/runs/${id}/adjustments/${x.id}`); toast('Removed — recompute'); reload(); } catch (e) { toast(errText(e), 'error'); } }}>×</button>}</div>)}</div>}
        </div>
      )}
      {item && <Modal title={`${item.employee_name} — lines`} onClose={() => setItem(null)}><PayLines lines={item.lines} gross={item.gross} deductions={item.deductions} net={item.net} /></Modal>}
      {adj && <Modal title={`Adjustment — ${adj.name}`} onClose={() => setAdj(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.post(`/api/v1/payroll/runs/${id}/adjustments`, { employeeId: adj.employeeId, kind: adj.kind, label: adj.label, amount: Number(adj.amount), taxable: adj.taxable, note: adj.note || null });
            toast('Added — recompute the run'); setAdj(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Kind"><select value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}><option value="earning">Earning</option><option value="deduction">Deduction</option><option value="lop_days">LOP days correction</option></select></Field>
            <Field label={adj.kind === 'lop_days' ? 'Days (+ adds LOP, − removes)' : 'Amount (₹)'}><input required type="number" step={adj.kind === 'lop_days' ? '0.5' : '0.01'} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
          </div>
          <Field label="Label" hint="Shown on the payslip, e.g. 'Arrears Aug', 'Notice recovery'"><input required minLength={2} value={adj.label} onChange={(e) => setAdj({ ...adj, label: e.target.value })} /></Field>
          {adj.kind === 'earning' && <label className="row"><input type="checkbox" checked={adj.taxable} onChange={(e) => setAdj({ ...adj, taxable: e.target.checked })} /> Taxable</label>}
          <Field label="Note"><input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setAdj(null)}>Cancel</button><button className="btn primary">Add</button></div>
        </form></Modal>}
      {ack && <Confirm title="Acknowledge warnings" requireComment confirmLabel="Acknowledge" message="Explain why the run can proceed (kept in the audit history)." onClose={() => setAck(false)}
        onConfirm={async (note) => run('acknowledge-warnings', { note }, 'Acknowledged')} />}
      {paid && <Confirm title="Record payment" requireComment confirmLabel="Mark paid" message="Bank / NEFT batch reference" onClose={() => setPaid(false)}
        onConfirm={async (paymentReference) => run('paid', { paymentReference }, 'Marked paid')} />}
    </Modal>
  );
}

export function PayLines({ lines, gross, deductions, net }: { lines: any[]; gross: number | string; deductions: number | string; net: number | string }) {
  const group = (k: string) => lines.filter((l) => l.kind === k);
  return (
    <div className="stack">
      <div className="form-grid">
        {(['earning', 'deduction'] as const).map((k) => <div key={k}><strong>{k === 'earning' ? 'Earnings' : 'Deductions'}</strong>
          <table className="t"><tbody>{group(k).map((l, i) => <tr key={i}><td>{l.name}{l.basis && <div className="muted" style={{ fontSize: 11 }}>{l.basis}</div>}</td><td style={{ textAlign: 'right' }}>{money(l.amount)}</td></tr>)}
            <tr><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{money(k === 'earning' ? gross : deductions)}</strong></td></tr></tbody></table></div>)}
      </div>
      {group('employer').length > 0 && <div className="muted" style={{ fontSize: 12 }}>Employer contributions: {group('employer').map((l) => `${l.name} ${money(l.amount)}`).join(' · ')}</div>}
      <div className="row"><span className="spacer" /><strong style={{ fontSize: 18 }}>Net pay {money(net)}</strong></div>
    </div>
  );
}

// ------------------------------------------------------------------ salaries
function Salaries() {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [emp, setEmp] = useState<any>(null);
  const emps = useLoad(() => api.get(`/api/v1/employees${qs({ search: search || undefined, pageSize: 20 })}`), [search]);
  const comps = useLoad(() => api.get('/api/v1/payroll/components'), []);
  const sal = useLoad(() => (emp ? api.get(`/api/v1/payroll/employees/${emp.id}/salaries`) : Promise.resolve(null)), [emp?.id]);
  const st = useLoad(() => (emp ? api.get(`/api/v1/payroll/employees/${emp.id}/statutory`) : Promise.resolve(null)), [emp?.id]);
  const [form, setForm] = useState<any>(null);
  const [stForm, setStForm] = useState<any>(null);
  return (
    <div className="stack">
      <div className="row"><input placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <select value={emp?.id ?? ''} onChange={(e) => setEmp((emps.data?.items ?? []).find((x: any) => x.id === e.target.value) ?? null)}><option value="">Select employee…</option>
          {(emps.data?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''} ({e.employee_code})</option>)}</select></div>
      {!emp ? <Empty>Pick an employee to see their salary history and statutory details.</Empty> : (
        <>
          <div className="card stack">
            <div className="row"><h3 style={{ margin: 0 }}>Salary history</h3><span className="spacer" />
              {can('payroll.manage') && <button className="btn sm primary" onClick={() => setForm({ effectiveFrom: new Date().toISOString().slice(0, 10), reason: '', amounts: {} })}>Propose change</button>}</div>
            {sal.loading ? <Loading /> : !sal.data?.items.length ? <div className="muted">No salary yet.</div> : (
              <div className="table-wrap"><table className="t"><thead><tr><th>Effective</th><th>Components</th><th>Reason</th><th>Status</th></tr></thead><tbody>
                {sal.data.items.map((s: any) => <tr key={s.id}><td>{fmtDate(s.effective_from)}</td><td style={{ fontSize: 12 }}>{Object.entries(s.amounts).map(([k, v]) => {
                  const c = comps.data?.items.find((x: any) => x.code === k); return `${k} ${c?.calc === 'percent' ? `${v}%` : money(v as number)}`; }).join(' · ')}</td>
                  <td>{s.reason}<div className="muted" style={{ fontSize: 11 }}>{s.created_by_name}</div></td><td><StatusBadge status={s.status} /></td></tr>)}
              </tbody></table></div>)}
          </div>
          <div className="card stack">
            <div className="row"><h3 style={{ margin: 0 }}>Statutory details</h3><span className="spacer" />
              {can('payroll.manage') && st.data && <button className="btn sm" onClick={() => setStForm({ uan: st.data.uan ?? '', pfMemberId: st.data.pf_member_id ?? '', pfExcluded: st.data.pf_excluded,
                esiIpNumber: st.data.esi_ip_number ?? '', pan: '', taxRegime: st.data.tax_regime, ptState: st.data.pt_state ?? '' })}>Edit</button>}</div>
            {st.data && <div style={{ fontSize: 13 }}>UAN {st.data.uan ?? '—'} · PF {st.data.pf_excluded ? 'excluded' : 'covered'} · ESI IP {st.data.esi_ip_number ?? '—'} · PAN {st.data.pan ?? '—'} · {st.data.tax_regime} regime · PT state {st.data.pt_state ?? 'branch state'}</div>}
          </div>
        </>
      )}
      {form && <Modal title={`Salary change — ${emp.first_name}`} onClose={() => setForm(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const amounts = Object.fromEntries(Object.entries(form.amounts).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v)]));
          try { await api.post(`/api/v1/payroll/employees/${emp.id}/salaries`, { effectiveFrom: form.effectiveFrom, reason: form.reason, amounts }); toast('Sent for approval'); setForm(null); sal.reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid"><Field label="Effective from"><input type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></Field>
            <Field label="Reason"><input required minLength={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
          <div className="form-grid">{(comps.data?.items ?? []).filter((c: any) => c.status === 'active').map((c: any) =>
            <Field key={c.code} label={`${c.name} (${c.calc === 'percent' ? `% of ${c.base_codes.join('+')}` : '₹ / month'})`}>
              <input type="number" min={0} step="0.01" value={form.amounts[c.code] ?? ''} onChange={(e) => setForm({ ...form, amounts: { ...form.amounts, [c.code]: e.target.value } })} /></Field>)}</div>
          <div className="muted" style={{ fontSize: 12 }}>Becomes active after approval by someone with payroll approval rights.</div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary">Submit</button></div>
        </form></Modal>}
      {stForm && <Modal title={`Statutory details — ${emp.first_name}`} onClose={() => setStForm(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const b = { ...stForm, uan: stForm.uan || null, pfMemberId: stForm.pfMemberId || null, esiIpNumber: stForm.esiIpNumber || null, ptState: stForm.ptState || null, pan: stForm.pan || undefined };
          try { await api.put(`/api/v1/payroll/employees/${emp.id}/statutory`, b); toast('Saved'); setStForm(null); st.reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="UAN (12 digits)"><input value={stForm.uan} onChange={(e) => setStForm({ ...stForm, uan: e.target.value })} /></Field>
            <Field label="PF member id"><input value={stForm.pfMemberId} onChange={(e) => setStForm({ ...stForm, pfMemberId: e.target.value })} /></Field>
            <Field label="ESI IP number (10 digits)"><input value={stForm.esiIpNumber} onChange={(e) => setStForm({ ...stForm, esiIpNumber: e.target.value })} /></Field>
            <Field label="PAN" hint="Leave empty to keep the current one"><input value={stForm.pan} onChange={(e) => setStForm({ ...stForm, pan: e.target.value.toUpperCase() })} /></Field>
            <Field label="Tax regime"><select value={stForm.taxRegime} onChange={(e) => setStForm({ ...stForm, taxRegime: e.target.value })}><option value="new">New</option><option value="old">Old</option></select></Field>
            <Field label="PT state" hint="Empty = branch state"><input value={stForm.ptState} onChange={(e) => setStForm({ ...stForm, ptState: e.target.value })} /></Field>
          </div>
          <label className="row"><input type="checkbox" checked={stForm.pfExcluded} onChange={(e) => setStForm({ ...stForm, pfExcluded: e.target.checked })} /> Not covered by PF (as assessed by the organization)</label>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setStForm(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}

// ------------------------------------------------------------------ components
function Components() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get('/api/v1/payroll/components'), []);
  const [edit, setEdit] = useState<any>(null);
  return (
    <div className="stack">
      {can('payroll.manage') && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setEdit({ code: '', name: '', kind: 'earning', calc: 'fixed', baseCodes: [], prorate: true, taxable: true, pfWage: false, esiWage: true, position: 0, status: 'active' })}>New component</button></div>}
      {loading ? <Loading /> : !data.items.length ? <Empty>No components. Typical: BASIC (PF wages), HRA (% of BASIC), SPECIAL allowance; deductions like canteen.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Kind</th><th>Calculation</th><th>Flags</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((c: any) => <tr key={c.id}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.kind}</td><td>{c.calc === 'percent' ? `% of ${c.base_codes.join(' + ')}` : 'Fixed monthly'}</td>
            <td style={{ fontSize: 12 }}>{[c.prorate && 'prorated', c.taxable && 'taxable', c.pf_wage && 'PF wage', c.esi_wage && 'ESI wage'].filter(Boolean).join(' · ')}</td><td>{c.status}</td>
            <td>{can('payroll.manage') && <button className="btn sm" onClick={() => setEdit({ id: c.id, code: c.code, name: c.name, kind: c.kind, calc: c.calc, baseCodes: c.base_codes, prorate: c.prorate, taxable: c.taxable, pfWage: c.pf_wage, esiWage: c.esi_wage, position: c.position, status: c.status })}>Edit</button>}</td></tr>)}
        </tbody></table></div>)}
      {edit && <Modal title={edit.id ? `Edit ${edit.code}` : 'New component'} onClose={() => setEdit(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); const { id, ...b } = edit;
          try { if (id) await api.put(`/api/v1/payroll/components/${id}`, { ...b, position: Number(b.position) }); else await api.post('/api/v1/payroll/components', { ...b, position: Number(b.position) }); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Code"><input required value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Kind"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select></Field>
            <Field label="Calculation"><select value={edit.calc} onChange={(e) => setEdit({ ...edit, calc: e.target.value })}><option value="fixed">Fixed monthly amount</option><option value="percent">Percent of components</option></select></Field>
            {edit.calc === 'percent' && <Field label="Base components" hint="Comma separated, fixed components only"><input required value={edit.baseCodes.join(',')} onChange={(e) => setEdit({ ...edit, baseCodes: e.target.value.toUpperCase().split(',').map((s: string) => s.trim()).filter(Boolean) })} /></Field>}
            <Field label="Order on payslip"><input type="number" min={0} value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></Field>
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
          {([['prorate', 'Prorate by paid days'], ['taxable', 'Taxable'], ['pfWage', 'Counts towards PF wages'], ['esiWage', 'Counts towards ESI wages']] as const).map(([k, l]) =>
            <label key={k} className="row"><input type="checkbox" checked={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} /> {l}</label>)}
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}

// ------------------------------------------------------------------ statutory rules
function StatutoryRules() {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get('/api/v1/payroll/statutory-rules'), []);
  const [edit, setEdit] = useState<any>(null);
  const act = async (url: string, msg: string) => { try { await api.post(url); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  return (
    <div className="stack">
      <div className="alert warn">No statutory values are shipped. Enter each rule from the official notification or circular, cite it, and have a second person verify it against the source. Rates change — review rules at every change in law.</div>
      {can('payroll.statutory') && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setEdit({ kind: 'pf', scope: 'IN', effectiveFrom: '', effectiveTo: '', params: '', sourceReference: '' })}>New rule</button></div>}
      {loading ? <Loading /> : !data.items.length ? <Empty>No rules. Without rules no statutory deduction is made, and runs show warnings.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Rule</th><th>Scope</th><th>Effective</th><th>Source</th><th>Entered / verified</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((r: any) => <tr key={r.id}><td>{RULE_LABEL[r.kind]}<div className="muted mono" style={{ fontSize: 11 }}>{JSON.stringify(r.params).slice(0, 90)}</div></td><td>{r.scope}</td>
            <td>{fmtDate(r.effective_from)}{r.effective_to ? ` – ${fmtDate(r.effective_to)}` : ' →'}</td><td style={{ fontSize: 12 }}>{r.source_reference}</td>
            <td style={{ fontSize: 12 }}>{r.created_by_name}{r.verified_by_name ? ` → ${r.verified_by_name}` : ''}</td><td><StatusBadge status={r.status} /></td>
            <td>{can('payroll.statutory') && <div className="row" style={{ flexWrap: 'nowrap' }}>
              {r.status === 'draft' && <button className="btn sm" onClick={() => setEdit({ id: r.id, kind: r.kind, scope: r.scope, effectiveFrom: r.effective_from, effectiveTo: r.effective_to ?? '', params: JSON.stringify(r.params, null, 2), sourceReference: r.source_reference })}>Edit</button>}
              {r.status === 'draft' && r.created_by !== me!.user.id && <button className="btn sm primary" onClick={() => act(`/api/v1/payroll/statutory-rules/${r.id}/verify`, 'Verified and active')}>Verify</button>}
              {r.status !== 'retired' && <button className="btn sm" onClick={() => act(`/api/v1/payroll/statutory-rules/${r.id}/retire`, 'Retired')}>Retire</button>}</div>}</td></tr>)}
        </tbody></table></div>)}
      {edit && <Modal title={edit.id ? 'Edit draft rule' : 'New statutory rule'} onClose={() => setEdit(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          let params: unknown; try { params = JSON.parse(edit.params); } catch { toast('Parameters must be valid JSON', 'error'); return; }
          const body = { kind: edit.kind, scope: edit.scope, effectiveFrom: edit.effectiveFrom, effectiveTo: edit.effectiveTo || null, params, sourceReference: edit.sourceReference };
          try { if (edit.id) await api.put(`/api/v1/payroll/statutory-rules/${edit.id}`, body); else await api.post('/api/v1/payroll/statutory-rules', body); toast('Saved as draft — a second person must verify it'); setEdit(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Rule"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value, scope: ['pf', 'esi'].includes(e.target.value) ? 'IN' : e.target.value === 'tds' ? 'new' : '' })}>{Object.entries(RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Scope" hint={edit.kind === 'tds' ? 'new or old (regime)' : ['pt', 'lwf'].includes(edit.kind) ? 'State, as on the branch' : 'IN'}><input required value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })} /></Field>
            <Field label="Effective from"><input type="date" required value={edit.effectiveFrom} onChange={(e) => setEdit({ ...edit, effectiveFrom: e.target.value })} /></Field>
            <Field label="Effective to (optional)"><input type="date" value={edit.effectiveTo} onChange={(e) => setEdit({ ...edit, effectiveTo: e.target.value })} /></Field>
          </div>
          <Field label="Parameters (JSON)" hint={`Shape: ${RULE_HELP[edit.kind]} — rates in %, amounts in ₹`}><textarea required rows={8} className="mono" value={edit.params} onChange={(e) => setEdit({ ...edit, params: e.target.value })} /></Field>
          <Field label="Source reference" hint="Notification / circular number and date, or the advice relied on"><input required minLength={5} value={edit.sourceReference} onChange={(e) => setEdit({ ...edit, sourceReference: e.target.value })} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save draft</button></div>
        </form></Modal>}
    </div>
  );
}
