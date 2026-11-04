import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, useToast, errText } from '../ui';
import { EmployeePicker } from '../features/employees/EmployeePicker';

export const ASSET_CATEGORY: Record<string, string> = { lab_instrument: 'Lab instrument', it: 'IT equipment', ppe: 'PPE', vehicle: 'Vehicle', furniture: 'Furniture', tool: 'Tool', other: 'Other' };
const STATUS: Record<string, string> = { available: 'Available', assigned: 'Issued', in_repair: 'In repair', retired: 'Retired', lost: 'Lost' };
const OUTCOME: Record<string, string> = { returned: 'Returned', lost: 'Lost', damaged: 'Damaged' };
type Tab = 'mine' | 'register';

/** Days from today to a YYYY-MM-DD date (negative = past). */
const daysTo = (d: string, today: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
function Calibration({ due, today }: { due: string | null; today: string }) {
  if (!due) return <span className="muted">—</span>;
  const n = daysTo(due, today);
  const kind = n < 0 ? 'danger' : n <= 30 ? 'warn' : '';
  return <span className={`badge ${kind}`} title={n < 0 ? 'Calibration expired: the instrument cannot be issued' : undefined}>{fmtDate(due)}{n < 0 ? ' · expired' : n <= 30 ? ` · ${n} d` : ''}</span>;
}

export function Assets() {
  const { can, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('assets.self')) tabs.push({ key: 'mine', label: 'My assets' });
  if (can('assets.manage')) tabs.push({ key: 'register', label: 'Asset register' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to assets.</Empty>;
  return (
    <div className="stack">
      <div><h1>Assets</h1><p className="sub">Laboratory instruments, IT equipment and PPE: who holds what, calibration due dates, issue and return.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' ? <Mine /> : <Register />}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/assets/mine'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const pending = data.items.filter((x: any) => !x.acknowledged_at).length;
  return (
    <div className="stack">
      {pending > 0 && <div className="alert warn">Confirm that you received {pending === 1 ? 'the item' : `${pending} items`} below. You are responsible for assets issued to you until they are returned.</div>}
      {!data.items.length ? <Empty>No assets are issued to you.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Asset</th><th>Category</th><th>Serial no.</th><th>Issued</th><th>Due back</th><th>Condition at issue</th><th /></tr></thead><tbody>
          {data.items.map((x: any) => <tr key={x.id}><td><strong>{x.tag}</strong> {x.name}</td><td>{ASSET_CATEGORY[x.category]}</td><td>{x.serial_number ?? '—'}</td>
            <td>{fmtDate(x.issued_at)}</td><td>{fmtDate(x.due_back)}</td><td>{x.condition_out ?? '—'}</td>
            <td>{x.acknowledged_at ? <span className="badge ok">Received {fmtDate(x.acknowledged_at.slice(0, 10))}</span>
              : <button className="btn sm primary" onClick={async () => { try { await api.post(`/api/v1/assets/assignments/${x.id}/acknowledge`); toast('Receipt confirmed'); reload(); } catch (e) { toast(errText(e), 'error'); } }}>I received it</button>}</td></tr>)}
        </tbody></table></div>)}
    </div>
  );
}

function Register() {
  const [f, setF] = useState({ search: '', status: '', category: '', calibration: '' });
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<any | null>(null);
  const [issue, setIssue] = useState<any | null>(null);
  const [receive, setReceive] = useState<any | null>(null);
  const [history, setHistory] = useState<any | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/assets${qs({ search: f.search || undefined, status: f.status || undefined, category: f.category || undefined,
    calibrationWithinDays: f.calibration || undefined, page, pageSize: 25 })}`), [f, page]);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="Search"><input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Tag, name or serial" /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Category"><select value={f.category} onChange={(e) => set({ category: e.target.value })}><option value="">All</option>{Object.entries(ASSET_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Calibration"><select value={f.calibration} onChange={(e) => set({ calibration: e.target.value })}><option value="">Any</option><option value="0">Expired or due today</option><option value="30">Due within 30 days</option><option value="90">Due within 90 days</option></select></Field>
        <span className="spacer" /><button className="btn primary" onClick={() => setEdit({})}>Add asset</button>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No assets match.</Empty> : (<>
        <div className="table-wrap"><table className="t"><thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Location</th><th>Calibration due</th><th>Status</th><th>Holder</th><th /></tr></thead><tbody>
          {data.items.map((x: any) => <tr key={x.id}>
            <td><strong>{x.tag}</strong></td><td>{x.name}{x.serial_number && <div className="muted" style={{ fontSize: 12 }}>S/N {x.serial_number}</div>}</td><td>{ASSET_CATEGORY[x.category]}</td>
            <td>{x.branch_name ?? '—'}</td><td><Calibration due={x.calibration_due} today={data.today} /></td>
            <td><StatusBadge status={x.status === 'assigned' ? 'issued' : x.status} /></td>
            <td>{x.holder_name ? <>{x.holder_name}<div className="muted" style={{ fontSize: 12 }}>since {fmtDate(x.issued_at)}{!x.acknowledged_at && ' · receipt not confirmed'}</div></> : '—'}</td>
            <td><div className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              {x.status === 'available' && <button className="btn sm primary" onClick={() => setIssue(x)}>Issue</button>}
              {x.status === 'assigned' && <button className="btn sm" onClick={() => setReceive(x)}>Receive</button>}
              <button className="btn sm" onClick={() => setEdit(x)}>Edit</button>
              <button className="btn sm" onClick={() => setHistory(x)}>History</button>
            </div></td></tr>)}
        </tbody></table></div>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      {edit && <AssetForm asset={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {issue && <IssueForm asset={issue} today={data?.today ?? todayLocal()} onClose={() => setIssue(null)} onSaved={() => { setIssue(null); reload(); }} />}
      {receive && <ReceiveForm asset={receive} today={data?.today ?? todayLocal()} onClose={() => setReceive(null)} onSaved={() => { setReceive(null); reload(); }} />}
      {history && <History asset={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function AssetForm({ asset, onClose, onSaved }: { asset: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = !asset.id;
  const branches = useLoad(() => api.get('/api/v1/org').then((o: any) => ({ items: o.branches ?? [] })).catch(() => ({ items: [] })), []);
  const [f, setF] = useState({ tag: asset.tag ?? '', name: asset.name ?? '', category: asset.category ?? 'lab_instrument', serialNumber: asset.serial_number ?? '', branchId: asset.branch_id ?? '',
    purchaseDate: asset.purchase_date ?? '', calibrationDue: asset.calibration_due ?? '', notes: asset.notes ?? '', status: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const body = { tag: f.tag, name: f.name, category: f.category, serialNumber: f.serialNumber || null, branchId: f.branchId || null, purchaseDate: f.purchaseDate || null,
    calibrationDue: f.calibrationDue || null, notes: f.notes || null, ...(f.status ? { status: f.status } : {}) };
  return (
    <Modal title={isNew ? 'Add asset' : `Edit ${asset.tag}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
        try { if (isNew) await api.post('/api/v1/assets', body); else await api.put(`/api/v1/assets/${asset.id}`, body); toast('Saved'); onSaved(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } }}>
        <div className="row"><Field label="Asset tag" hint="Letters, digits, / _ . -"><input required pattern="[A-Za-z0-9][A-Za-z0-9/_.\-]{0,39}" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="INS-PH-05" /></Field>
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(ASSET_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
        <Field label="Name"><input required minLength={2} maxLength={150} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="pH meter (bench)" /></Field>
        <div className="row"><Field label="Serial number"><input maxLength={100} value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></Field>
          <Field label="Location"><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">—</option>
            {(branches.data?.items ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field></div>
        <div className="row"><Field label="Purchase date"><input type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></Field>
          <Field label="Calibration due" hint={f.category === 'lab_instrument' ? 'An instrument past this date cannot be issued' : undefined}><input type="date" value={f.calibrationDue} onChange={(e) => setF({ ...f, calibrationDue: e.target.value })} /></Field></div>
        {!isNew && asset.status !== 'assigned' && <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Keep ({STATUS[asset.status]})</option>
          <option value="available">Available</option><option value="in_repair">In repair</option><option value="retired">Retired</option></select></Field>}
        <Field label="Notes"><textarea maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function IssueForm({ asset, today, onClose, onSaved }: { asset: any; today: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ employeeId: '', issuedAt: today, conditionOut: 'Good', dueBack: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`Issue ${asset.tag} — ${asset.name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
        try { await api.post(`/api/v1/assets/${asset.id}/issue`, { ...f, conditionOut: f.conditionOut || null, dueBack: f.dueBack || null }); toast('Issued; the employee is asked to confirm receipt'); onSaved(); }
        catch (x) { setErr(errText(x)); } finally { setBusy(false); } }}>
        {asset.category === 'lab_instrument' && asset.calibration_due && <div className="muted">Calibration due {fmtDate(asset.calibration_due)}</div>}
        <Field label="Issue to"><EmployeePicker value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /></Field>
        <div className="row"><Field label="Issued on"><input type="date" required value={f.issuedAt} onChange={(e) => setF({ ...f, issuedAt: e.target.value })} /></Field>
          <Field label="Due back (optional)"><input type="date" min={f.issuedAt} value={f.dueBack} onChange={(e) => setF({ ...f, dueBack: e.target.value })} /></Field></div>
        <Field label="Condition at issue"><input maxLength={300} value={f.conditionOut} onChange={(e) => setF({ ...f, conditionOut: e.target.value })} placeholder="Good, with electrode and stand" /></Field>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.employeeId}>{busy ? 'Issuing…' : 'Issue'}</button></div>
      </form>
    </Modal>
  );
}

function ReceiveForm({ asset, today, onClose, onSaved }: { asset: any; today: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ returnedAt: today, outcome: 'returned', conditionIn: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`Receive ${asset.tag} from ${asset.holder_name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
        try { await api.post(`/api/v1/assets/${asset.id}/receive`, { ...f, conditionIn: f.conditionIn || null }); toast('Recorded'); onSaved(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } }}>
        <div className="row"><Field label="Returned on"><input type="date" required min={asset.issued_at} value={f.returnedAt} onChange={(e) => setF({ ...f, returnedAt: e.target.value })} /></Field>
          <Field label="Outcome"><select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
        <Field label={f.outcome === 'returned' ? 'Condition (optional)' : 'What happened (required)'} hint={f.outcome === 'damaged' ? 'The asset goes to “In repair”' : f.outcome === 'lost' ? 'The asset is marked lost' : undefined}>
          <textarea required={f.outcome !== 'returned'} maxLength={500} value={f.conditionIn} onChange={(e) => setF({ ...f, conditionIn: e.target.value })} /></Field>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Record return'}</button></div>
      </form>
    </Modal>
  );
}

function History({ asset, onClose }: { asset: any; onClose: () => void }) {
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/assets/${asset.id}/history`), [asset.id]);
  return (
    <Modal title={`History — ${asset.tag}`} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>Never issued.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Issued</th><th>Returned</th><th>Outcome</th><th>Condition</th></tr></thead><tbody>
          {data.items.map((h: any) => <tr key={h.id}><td>{h.employee_name}<div className="muted" style={{ fontSize: 12 }}>{h.employee_code}</div></td>
            <td>{fmtDate(h.issued_at)}<div className="muted" style={{ fontSize: 12 }}>by {h.issued_by_name}{h.acknowledged_at ? ` · confirmed ${fmtDateTime(h.acknowledged_at)}` : ''}</div></td>
            <td>{h.returned_at ? <>{fmtDate(h.returned_at)}<div className="muted" style={{ fontSize: 12 }}>by {h.received_by_name}</div></> : <span className="badge info">With employee</span>}</td>
            <td>{h.outcome ? OUTCOME[h.outcome] : '—'}</td><td>{h.condition_out ?? '—'}{h.condition_in ? ` → ${h.condition_in}` : ''}</td></tr>)}
        </tbody></table></div>)}
    </Modal>
  );
}
