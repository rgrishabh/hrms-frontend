import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, money, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, Confirm, StatusBadge, useToast, errText } from '../ui';

type Tab = 'mine' | 'team' | 'finance' | 'categories';

export function Expenses() {
  const { can, canAny, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('expenses.self')) tabs.push({ key: 'mine', label: 'My claims' });
  if (can('expenses.team.read')) tabs.push({ key: 'team', label: 'Team claims' });
  if (canAny('expenses.pay', 'expenses.read')) tabs.push({ key: 'finance', label: 'Finance' });
  if (can('expenses.manage')) tabs.push({ key: 'categories', label: 'Categories' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to expenses.</Empty>;
  return (
    <div className="stack">
      <div><h1>Expenses</h1><p className="sub">Claims are approved by your manager and then by finance. Receipts are stored securely with the claim.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {(tab === 'mine' || tab === 'team') && <ClaimList scope={tab} />}
      {tab === 'finance' && <Finance />}
      {tab === 'categories' && <Categories />}
    </div>
  );
}

function ClaimList({ scope }: { scope: 'mine' | 'team' }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/expenses/claims${qs({ scope, page, pageSize: 20 })}`), [scope, page]);
  return (
    <div className="stack">
      {scope === 'mine' && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setCreating(true)}>New claim</button></div>}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No claims.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Claim</th>{scope === 'team' && <th>Employee</th>}<th>Items</th><th>Total</th><th>Status</th><th>Updated</th></tr></thead><tbody>
            {data.items.map((c: any) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
              <td>{c.title}{c.flagged > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>Possible duplicate</span>}</td>{scope === 'team' && <td>{c.employee_name}</td>}
              <td>{c.items}</td><td>{money(c.total)}</td><td><StatusBadge status={c.status} /></td><td className="muted">{fmtDateTime(c.paid_at ?? c.approved_at ?? c.submitted_at ?? c.created_at)}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {creating && <ClaimForm onClose={() => setCreating(false)} onSaved={(id) => { reload(); setOpen(id); }} />}
      {open && <ClaimDetail id={open} onClose={() => { setOpen(null); reload(); }} onChanged={() => { reload(); toast('Saved'); }} />}
    </div>
  );
}

function ClaimForm({ claim, onClose, onSaved }: { claim?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ title: claim?.title ?? '', purpose: claim?.purpose ?? '', project: claim?.project ?? '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={claim ? 'Edit claim' : 'New expense claim'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const body = { ...f, project: f.project || null };
          if (claim) { await api.put(`/api/v1/expenses/claims/${claim.id}`, body); onSaved(claim.id); } else onSaved((await api.post('/api/v1/expenses/claims', body)).id);
          onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Title" hint="e.g. Client visit — Pune STP sampling"><input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Business purpose"><textarea required minLength={3} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        <Field label="Project / cost centre (optional)"><input value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">{claim ? 'Save' : 'Create and add items'}</button></div>
      </form>
    </Modal>
  );
}

function ClaimDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data: c, loading, error, reload } = useLoad(() => api.get(`/api/v1/expenses/claims/${id}`), [id]);
  const cats = useLoad(() => api.get('/api/v1/expenses/categories'), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'submit' | 'cancel' | null>(null);
  return (
    <Modal title={c?.title ?? 'Expense claim'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={c.status} /><span className="muted">{c.employee_name}</span><span className="spacer" /><strong>{money(c.total)}</strong></div>
          <div className="muted" style={{ fontSize: 13 }}>{c.purpose}{c.project ? ` · ${c.project}` : ''}{c.payment_reference ? ` · paid, ref ${c.payment_reference}` : ''}</div>
          {!c.items.length ? <div className="muted">No items yet.</div> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Receipt</th>{c.editable && <th />}</tr></thead><tbody>
              {c.items.map((i: any) => <tr key={i.id}><td>{fmtDate(i.expense_date)}</td><td>{i.category_name}</td>
                <td>{i.description}{i.merchant && <div className="muted" style={{ fontSize: 12 }}>{i.merchant}{i.invoice_number ? ` · ${i.invoice_number}` : ''}{i.gstin ? ` · GSTIN ${i.gstin}` : ''}</div>}
                  {i.duplicate_of && <span className="badge warn">Possible duplicate</span>}</td>
                <td>{money(i.amount)}</td><td>{i.has_receipt ? <a href={`/api/v1/expenses/items/${i.id}/receipt`}>Download</a> : '—'}</td>
                {c.editable && <td><button className="btn sm" onClick={async () => { try { await api.del(`/api/v1/expenses/claims/${id}/items/${i.id}`); reload(); } catch (x) { toast(errText(x), 'error'); } }}>Remove</button></td>}</tr>)}
            </tbody></table></div>)}
          {c.editable && <div className="row">
            <button className="btn" onClick={() => setAdding(true)}>Add expense</button><button className="btn" onClick={() => setEditing(true)}>Edit details</button>
            <span className="spacer" /><button className="btn danger" onClick={() => setConfirm('cancel')}>Cancel claim</button>
            <button className="btn primary" disabled={!c.items.length} onClick={() => setConfirm('submit')}>Submit for approval</button></div>}
          {c.status === 'submitted' && c.employee_id && <div className="row"><span className="spacer" /><button className="btn" onClick={() => setConfirm('cancel')}>Withdraw</button></div>}
        </div>
      )}
      {adding && cats.data && <ItemForm claimId={id} categories={cats.data.items} onClose={() => setAdding(false)} onDone={() => { reload(); onChanged(); }} />}
      {editing && c && <ClaimForm claim={c} onClose={() => setEditing(false)} onSaved={() => { reload(); onChanged(); }} />}
      {confirm && <Confirm title={confirm === 'submit' ? 'Submit claim' : 'Cancel claim'} danger={confirm === 'cancel'} confirmLabel={confirm === 'submit' ? 'Submit' : 'Cancel claim'}
        message={confirm === 'submit' ? `Submit ${money(c.total)} for approval? You cannot edit it unless it is returned to you.` : 'Cancel this claim? This cannot be undone.'}
        onClose={() => setConfirm(null)} onConfirm={async () => { await api.post(`/api/v1/expenses/claims/${id}/${confirm}`); toast(confirm === 'submit' ? 'Submitted for approval' : 'Claim cancelled'); reload(); onChanged(); }} />}
    </Modal>
  );
}

function ItemForm({ claimId, categories, onClose, onDone }: { claimId: string; categories: any[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ categoryId: categories[0]?.id ?? '', expenseDate: todayLocal(), amount: '', description: '', merchant: '', invoiceNumber: '', gstin: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cat = categories.find((c) => c.id === f.categoryId);
  return (
    <Modal title="Add expense" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const form = new FormData();
        for (const [k, v] of Object.entries(f)) if (v) form.append(k, v);
        if (file) form.append('receipt', file);
        try { const r = await api.upload(`/api/v1/expenses/claims/${claimId}/items`, form); if (r.possibleDuplicate) toast('Added — note: it looks similar to another claimed expense', 'error'); onDone(); onClose(); }
        catch (x) { setError(errText(x)); }
      }}>
        <div className="form-grid">
          <Field label="Category"><select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Date"><input type="date" required max={todayLocal()} value={f.expenseDate} onChange={(e) => setF({ ...f, expenseDate: e.target.value })} /></Field>
          <Field label="Amount (₹)" hint={cat?.max_amount ? `Up to ${money(cat.max_amount)}` : undefined}><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Merchant (optional)"><input value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} /></Field>
        </div>
        <Field label="Description"><input required minLength={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {cat?.gst_applicable && <div className="form-grid">
          <Field label="Supplier GSTIN"><input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
          <Field label="Invoice number"><input value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field></div>}
        <Field label={`Receipt${cat?.requires_receipt ? ' (required)' : ' (optional)'}`} hint="PDF or photo (PNG, JPEG, WebP)"><input type="file" required={!!cat?.requires_receipt} accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="muted" style={{ fontSize: 12 }}>GST input credit is decided by finance; a reimbursement is not automatically tax-exempt.</div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Add</button></div>
      </form>
    </Modal>
  );
}

function Finance() {
  const { can } = useAuth();
  const toast = useToast();
  const payables = useLoad(() => (can('expenses.pay') ? api.get('/api/v1/expenses/payables') : Promise.resolve({ items: [] })), []);
  const batches = useLoad(() => api.get('/api/v1/expenses/batches'), []);
  const ageing = useLoad(() => api.get('/api/v1/expenses/reports/ageing'), []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState<any>(null);
  const [ref, setRef] = useState('');
  const chosen = Object.keys(selected).filter((k) => selected[k]);
  const reloadAll = () => { payables.reload(); batches.reload(); ageing.reload(); };
  const act = async (url: string, msg: string) => { try { await api.post(url); toast(msg); reloadAll(); } catch (e) { toast(errText(e), 'error'); } };
  return (
    <div className="stack">
      {ageing.data && <div className="grid grid-4">
        {ageing.data.pipeline.map((p: any) => <div key={p.status} className="card stat"><div className="l">{p.status === 'submitted' ? 'Awaiting approval' : 'Approved, unpaid'}</div><div className="v">{money(p.amount)}</div><div className="l">{p.claims} claim(s)</div></div>)}
        {ageing.data.approvedUnpaidByAge.map((b: any) => <div key={b.bucket} className="card stat"><div className="l">Unpaid {b.bucket} days</div><div className="v">{money(b.amount)}</div><div className="l">{b.claims} claim(s)</div></div>)}
      </div>}
      {can('expenses.pay') && <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Approved, ready to pay</h3><span className="spacer" />
          <button className="btn primary sm" disabled={!chosen.length} onClick={async () => { try { const r = await api.post('/api/v1/expenses/batches', { claimIds: chosen }); toast(`Batch prepared: ${money(r.total)}. Another finance user must approve it.`); setSelected({}); reloadAll(); } catch (e) { toast(errText(e), 'error'); } }}>Prepare batch ({chosen.length})</button></div>
        {!payables.data?.items.length ? <div className="muted">Nothing to pay.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th /><th>Employee</th><th>Claim</th><th>Amount</th><th>Approved</th></tr></thead><tbody>
            {payables.data.items.map((p: any) => <tr key={p.id}><td><input type="checkbox" checked={!!selected[p.id]} onChange={(e) => setSelected({ ...selected, [p.id]: e.target.checked })} aria-label={`Select ${p.title}`} /></td>
              <td>{p.employee_name} <span className="muted mono">{p.employee_code}</span></td><td>{p.title}</td><td>{money(p.total)}</td><td>{fmtDate(p.approved_at.slice(0, 10))} · {p.age_days}d</td></tr>)}
          </tbody></table></div>)}
      </div>}
      <div className="card stack">
        <h3>Payment batches</h3>
        {!batches.data?.items.length ? <div className="muted">No batches yet.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Created</th><th>Claims</th><th>Total</th><th>Status</th><th>Prepared / approved / paid by</th><th /></tr></thead><tbody>
            {batches.data.items.map((b: any) => <tr key={b.id}><td>{fmtDateTime(b.created_at)}</td><td>{b.claim_count}</td><td>{money(b.total)}</td><td><StatusBadge status={b.status} />{b.payment_reference && <div className="muted mono" style={{ fontSize: 12 }}>{b.payment_reference}</div>}</td>
              <td className="muted" style={{ fontSize: 12 }}>{[b.prepared_by_name, b.approved_by_name, b.paid_by_name].filter(Boolean).join(' → ')}</td>
              <td>{can('expenses.pay') && <div className="row" style={{ flexWrap: 'nowrap' }}>
                {b.status === 'prepared' && <button className="btn sm" onClick={() => act(`/api/v1/expenses/batches/${b.id}/approve`, 'Batch approved')}>Approve</button>}
                {b.status === 'approved' && <button className="btn sm primary" onClick={() => { setPaying(b); setRef(''); }}>Mark paid</button>}
                {['approved', 'paid'].includes(b.status) && <a className="btn sm" href={`/api/v1/expenses/batches/${b.id}/export.csv`} style={{ textDecoration: 'none' }}>Export CSV</a>}
                {['prepared', 'approved'].includes(b.status) && <button className="btn sm" onClick={() => act(`/api/v1/expenses/batches/${b.id}/cancel`, 'Batch cancelled')}>Cancel</button>}
              </div>}</td></tr>)}
          </tbody></table></div>)}
      </div>
      {paying && <Modal title="Record payment" onClose={() => setPaying(null)}>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/api/v1/expenses/batches/${paying.id}/paid`, { paymentReference: ref }); toast('Payment recorded; employees notified'); setPaying(null); reloadAll(); } catch (x) { toast(errText(x), 'error'); } }}>
          <p className="muted" style={{ margin: 0 }}>{paying.claim_count} claim(s), {money(paying.total)}. Record the bank / NEFT reference once the transfer is done.</p>
          <Field label="Payment reference"><input required minLength={3} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setPaying(null)}>Cancel</button><button className="btn primary">Mark paid</button></div>
        </form></Modal>}
    </div>
  );
}

function Categories() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get('/api/v1/expenses/categories'), []);
  const [edit, setEdit] = useState<any>(null);
  return (
    <div className="stack">
      <div className="row"><span className="spacer" /><button className="btn primary sm" onClick={() => setEdit({ code: '', name: '', description: '', requiresReceipt: true, maxAmount: '', gstApplicable: false, status: 'active' })}>New category</button></div>
      {loading ? <Loading /> : !data.items.length ? <Empty>No categories yet (e.g. Local travel, Accommodation, Meals, Sample collection travel, PPE, Training).</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Receipt</th><th>Limit per item</th><th>GST details</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((c: any) => <tr key={c.id}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.requires_receipt ? 'Required' : 'Optional'}</td><td>{c.max_amount ? money(c.max_amount) : '—'}</td>
            <td>{c.gst_applicable ? 'Captured' : '—'}</td><td>{c.status}</td><td><button className="btn sm" onClick={() => setEdit({ id: c.id, code: c.code, name: c.name, description: c.description ?? '',
              requiresReceipt: c.requires_receipt, maxAmount: c.max_amount ?? '', gstApplicable: c.gst_applicable, status: c.status })}>Edit</button></td></tr>)}
        </tbody></table></div>)}
      {edit && <Modal title={edit.id ? `Edit ${edit.code}` : 'New expense category'} onClose={() => setEdit(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const { id, ...b } = edit;
          const body = { ...b, description: b.description || null, maxAmount: b.maxAmount === '' ? null : Number(b.maxAmount) };
          try { if (id) await api.put(`/api/v1/expenses/categories/${id}`, body); else await api.post('/api/v1/expenses/categories', body); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Code"><input required value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Limit per item (₹)" hint="Blank = no limit"><input type="number" min={1} step="0.01" value={edit.maxAmount} onChange={(e) => setEdit({ ...edit, maxAmount: e.target.value })} /></Field>
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
          <Field label="Description"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <label className="row"><input type="checkbox" checked={edit.requiresReceipt} onChange={(e) => setEdit({ ...edit, requiresReceipt: e.target.checked })} /> Receipt required</label>
          <label className="row"><input type="checkbox" checked={edit.gstApplicable} onChange={(e) => setEdit({ ...edit, gstApplicable: e.target.checked })} /> Capture supplier GSTIN and invoice number</label>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}
