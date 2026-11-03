import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, Confirm, useToast, errText } from '../ui';

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function DocumentTable({ items, onArchive }: { items: any[]; onArchive?: (d: any) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  if (!items.length) return <Empty>No documents.</Empty>;
  return (
    <div className="table-wrap"><table className="t"><thead><tr><th>Title</th><th>Category</th><th>Employee</th><th>Expires</th><th>Uploaded</th><th /></tr></thead><tbody>
      {items.map((d) => <tr key={d.id}>
        <td><div>{d.title}</div><div className="muted" style={{ fontSize: 12 }}>{d.file_name} · {kb(d.size_bytes)}</div></td>
        <td>{d.category_name}{d.restricted && <span className="badge warn" style={{ marginLeft: 4 }}>Restricted</span>}</td>
        <td>{d.employee_name ?? <span className="muted">Company</span>}</td>
        <td>{d.expires_on ? <span className={`badge ${d.expires_on < today ? 'danger' : d.expires_on <= addDaysIso(today, 30) ? 'warn' : ''}`}>{fmtDate(d.expires_on)}</span> : '—'}</td>
        <td className="muted" style={{ fontSize: 12 }}>{fmtDateTime(d.created_at)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</td>
        <td><div className="row" style={{ flexWrap: 'nowrap' }}>
          <a className="btn sm" href={`/api/v1/documents/${d.id}/download`} style={{ textDecoration: 'none' }}>Download</a>
          {onArchive && d.status === 'active' && <button className="btn sm" onClick={() => onArchive(d)}>Archive</button>}</div></td>
      </tr>)}
    </tbody></table></div>
  );
}
const addDaysIso = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

export function UploadDialog({ categories, employeeId, onClose, onDone }: { categories: any[]; employeeId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const usable = categories.filter((c) => c.status === 'active' && (employeeId ? c.scope === 'employee' : true));
  const [f, setF] = useState({ categoryId: usable[0]?.id ?? '', title: '', expiresOn: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cat = usable.find((c) => c.id === f.categoryId);
  return (
    <Modal title="Upload document" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); if (!file) return; setBusy(true); setError(null);
        const form = new FormData();
        form.append('categoryId', f.categoryId); form.append('title', f.title);
        if (employeeId && cat?.scope === 'employee') form.append('employeeId', employeeId);
        if (f.expiresOn) form.append('expiresOn', f.expiresOn);
        form.append('file', file);
        try { await api.upload('/api/v1/documents', form); toast('Document uploaded'); onDone(); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="Category"><select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          {usable.map((c) => <option key={c.id} value={c.id}>{c.name}{c.restricted ? ' (restricted)' : ''}{c.scope === 'company' ? ' — company' : ''}</option>)}</select></Field>
        <Field label="Title"><input required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={`Expiry date${cat?.requires_expiry ? ' (required)' : ' (optional)'}`}><input type="date" required={!!cat?.requires_expiry} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></Field>
        <Field label="File" hint="PDF, PNG, JPEG, WebP, DOCX or XLSX"><input type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !file || !f.categoryId}>{busy ? 'Uploading…' : 'Upload'}</button></div>
      </form>
    </Modal>
  );
}

type Tab = 'mine' | 'company' | 'all' | 'categories';

export function Documents() {
  const { can, canAny, me } = useAuth();
  const toast = useToast();
  const hr = canAny('documents.read', 'documents.manage');
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId) tabs.push({ key: 'mine', label: 'My documents' });
  tabs.push({ key: 'company', label: 'Company documents' });
  if (hr) tabs.push({ key: 'all', label: 'All documents' });
  if (can('documents.manage')) tabs.push({ key: 'categories', label: 'Categories' });
  const [tab, setTab] = useState<Tab>(tabs[0]!.key);
  const [page, setPage] = useState(1);
  const [expiring, setExpiring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<any>(null);
  const cats = useLoad(() => api.get('/api/v1/documents/categories'), []);
  const url = tab === 'categories' ? null : `/api/v1/documents${qs({ scope: tab === 'all' ? undefined : tab, expiringWithinDays: expiring ? 30 : undefined, page, pageSize: 25 })}`;
  const docs = useLoad(() => (url ? api.get(url) : Promise.resolve(null)), [url]);
  const canUploadMine = (cats.data?.items ?? []).some((c: any) => c.employee_upload && c.status === 'active');
  return (
    <div className="stack">
      <div className="row"><div><h1>Documents</h1><p className="sub" style={{ marginBottom: 0 }}>Every download is recorded. Restricted documents are visible only to authorised HR staff and the employee.</p></div><span className="spacer" />
        {((tab === 'mine' && canUploadMine) || (can('documents.manage') && tab === 'company')) && <button className="btn primary" onClick={() => setUploading(true)}>Upload</button>}</div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />
      <ErrorBox error={cats.error} />
      {tab === 'categories' ? <Categories data={cats.data} reload={cats.reload} /> : (
        <>
          {tab === 'all' && <label className="row"><input type="checkbox" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); setPage(1); }} /> Expiring within 30 days (or expired)</label>}
          <ErrorBox error={docs.error} />
          {docs.loading || !docs.data ? <Loading /> : <>
            <DocumentTable items={docs.data.items} onArchive={can('documents.manage') ? setArchive : undefined} />
            <Pager page={docs.data.page} pageSize={docs.data.pageSize} total={docs.data.total} onPage={setPage} />
          </>}
        </>
      )}
      {uploading && cats.data && <UploadDialog categories={tab === 'mine' ? cats.data.items.filter((c: any) => c.employee_upload) : cats.data.items.filter((c: any) => c.scope === 'company')}
        employeeId={tab === 'mine' ? me!.user.employeeId! : undefined} onClose={() => setUploading(false)} onDone={docs.reload} />}
      {archive && <Confirm title="Archive document" message={`Archive “${archive.title}”? It stays in storage for retention but leaves active lists.`} confirmLabel="Archive" danger
        onClose={() => setArchive(null)} onConfirm={async () => { await api.post(`/api/v1/documents/${archive.id}/archive`); toast('Archived'); docs.reload(); }} />}
    </div>
  );
}

function Categories({ data, reload }: { data: any; reload: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="row"><span className="spacer" /><button className="btn primary sm" onClick={() => setEdit({ code: '', name: '', scope: 'employee', employeeVisible: true, employeeUpload: false, restricted: false, requiresExpiry: false, status: 'active' })}>New category</button></div>
      {!data.items.length ? <Empty>No categories yet. Create e.g. Contracts, Certifications, Medical (restricted), Policies (company).</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Scope</th><th>Rules</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((c: any) => <tr key={c.id}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.scope}</td>
            <td className="muted" style={{ fontSize: 12 }}>{[c.employee_visible ? 'visible to employee' : 'HR only', c.employee_upload && 'employee can upload', c.restricted && 'restricted', c.requires_expiry && 'expiry required'].filter(Boolean).join(' · ')}</td>
            <td>{c.status}</td><td><button className="btn sm" onClick={() => setEdit({ id: c.id, code: c.code, name: c.name, scope: c.scope, employeeVisible: c.employee_visible, employeeUpload: c.employee_upload,
              restricted: c.restricted, requiresExpiry: c.requires_expiry, status: c.status })}>Edit</button></td></tr>)}
        </tbody></table></div>)}
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.code}` : 'New category'} onClose={() => setEdit(null)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const { id, ...body } = edit;
            try { if (id) await api.put(`/api/v1/documents/categories/${id}`, body); else await api.post('/api/v1/documents/categories', body); toast('Saved'); setEdit(null); reload(); }
            catch (x) { toast(errText(x), 'error'); }
          }}>
            <div className="form-grid">
              <Field label="Code"><input required value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Scope"><select disabled={!!edit.id} value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value, employeeUpload: e.target.value === 'company' ? false : edit.employeeUpload })}>
                <option value="employee">Employee documents</option><option value="company">Company documents</option></select></Field>
              <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            </div>
            {[['employeeVisible', edit.scope === 'company' ? 'Visible to all employees' : 'Employee can see their own'], ['employeeUpload', 'Employee can upload their own', edit.scope === 'company'],
              ['restricted', 'Restricted (e.g. medical, identity): only HR with restricted access'], ['requiresExpiry', 'Expiry date required (reminders at 30 and 7 days)']].map(([k, l, dis]) => (
              <label key={k as string} className="row"><input type="checkbox" disabled={!!dis} checked={edit[k as string]} onChange={(e) => setEdit({ ...edit, [k as string]: e.target.checked })} />{l}</label>))}
            <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Documents tab on an employee profile. */
export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const cats = useLoad(() => api.get('/api/v1/documents/categories'), []);
  const docs = useLoad(() => api.get(`/api/v1/documents${qs({ employeeId, pageSize: 100 })}`), [employeeId]);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<any>(null);
  const self = me!.user.employeeId === employeeId;
  const uploadable = (cats.data?.items ?? []).filter((c: any) => c.scope === 'employee' && c.status === 'active' && (can('documents.manage') || (self && c.employee_upload)));
  return (
    <div className="stack">
      <div className="row"><span className="spacer" />{uploadable.length > 0 && <button className="btn primary sm" onClick={() => setUploading(true)}>Upload</button>}</div>
      <ErrorBox error={docs.error} />
      {docs.loading ? <Loading /> : <DocumentTable items={docs.data.items} onArchive={can('documents.manage') ? setArchive : undefined} />}
      {uploading && <UploadDialog categories={uploadable} employeeId={employeeId} onClose={() => setUploading(false)} onDone={docs.reload} />}
      {archive && <Confirm title="Archive document" message={`Archive “${archive.title}”?`} confirmLabel="Archive" danger onClose={() => setArchive(null)}
        onConfirm={async () => { await api.post(`/api/v1/documents/${archive.id}/archive`); toast('Archived'); docs.reload(); }} />}
    </div>
  );
}
