import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';

const CATEGORY: Record<string, string> = { hr: 'HR', code_of_conduct: 'Code of conduct', posh: 'POSH', safety: 'Health & safety', quality: 'Quality',
  it_security: 'IT security', data_protection: 'Data protection', other: 'Other' };
type Tab = 'mine' | 'manage';

export function Policies() {
  const { can, canAny, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('policies.self')) tabs.push({ key: 'mine', label: 'My policies' });
  if (canAny('policies.read', 'policies.manage')) tabs.push({ key: 'manage', label: 'Manage policies' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  const viewing = params.get('version');
  if (!tabs.length && !viewing) return <Empty>You do not have access to policies.</Empty>;
  return (
    <div className="stack">
      <div><h1>Policies</h1><p className="sub">Read the policies that apply to you and confirm you have read them.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' && <Mine onOpen={(id) => setParams({ version: id })} />}
      {tab === 'manage' && <Manage />}
      {viewing && <Viewer id={viewing} onClose={() => setParams({})} />}
    </div>
  );
}

function Mine({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/policies/mine'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      {data.pending > 0 && <div className={`alert ${data.overdue ? 'error' : 'warn'}`}>{data.pending} polic{data.pending === 1 ? 'y needs' : 'ies need'} your acknowledgement{data.overdue ? ` (${data.overdue} overdue)` : ''}.</div>}
      {!data.items.length ? <Empty>No policies have been published for you yet.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Policy</th><th>Category</th><th>Version</th><th>Effective</th><th>Status</th></tr></thead><tbody>
          {data.items.map((p: any) => <tr key={p.id} className="clickable" onClick={() => onOpen(p.id)}>
            <td>{p.title}<div className="muted" style={{ fontSize: 12 }}>{p.change_summary}</div></td><td>{CATEGORY[p.category]}</td><td>v{p.version_no}</td><td>{fmtDate(p.effective_from)}</td>
            <td>{!p.requires_ack ? <span className="badge">For information</span> : p.acknowledged_at ? <span className="badge ok">Acknowledged {fmtDate(p.acknowledged_at.slice(0, 10))}</span>
              : <span className={`badge ${p.due_on < data.date ? 'danger' : 'warn'}`}>Due {fmtDate(p.due_on)}</span>}</td></tr>)}
        </tbody></table></div>)}
    </div>
  );
}

function Viewer({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const { me } = useAuth();
  const { data: v, loading, error, reload } = useLoad(() => api.get(`/api/v1/policies/versions/${id}`), [id]);
  const [read, setRead] = useState(false);
  return (
    <Modal title={v ? `${v.title} — v${v.versionNo}` : 'Policy'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={v.status} /><span className="muted">Effective {fmtDate(v.effectiveFrom)}</span></div>
          <div className="muted" style={{ fontSize: 13 }}>What changed: {v.changeSummary}</div>
          {v.body && <div className="card" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{v.body}</div>}
          {v.hasFile && <div className="row"><a className="btn" href={`/api/v1/policies/versions/${id}/file?inline=true`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open {v.fileName}</a></div>}
          {me!.user.employeeId && v.requiresAck && (v.acknowledgedAt ? <div className="alert ok">You acknowledged this version on {fmtDateTime(v.acknowledgedAt)}.</div>
            : v.status === 'published' && <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              try { await api.post(`/api/v1/policies/versions/${id}/acknowledge`, { contentSha256: v.contentSha256 }); toast('Thank you — acknowledgement recorded'); reload(); }
              catch (x) { toast(errText(x), 'error'); }
            }}>
              <label className="row"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read and understood this policy and agree to follow it.</label>
              <div className="row"><span className="spacer" /><button className="btn primary" disabled={!read}>Acknowledge</button></div>
            </form>)}
        </div>
      )}
    </Modal>
  );
}

function Manage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/policies'), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ code: '', title: '', category: 'hr', owner: '' });
  return (
    <div className="stack">
      {can('policies.manage') && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setCreating(true)}>New policy</button></div>}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No policies yet. Start with the code of conduct, POSH, leave and health & safety policies.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Policy</th><th>Category</th><th>Published</th><th>Acknowledged</th><th>Status</th></tr></thead><tbody>
          {data.items.map((p: any) => <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
            <td className="mono">{p.code}</td><td>{p.title}{p.drafts > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>Draft</span>}</td><td>{CATEGORY[p.category]}</td>
            <td>{p.published_version ? `v${p.published_version} · ${fmtDate(p.effective_from)}` : '—'}</td>
            <td>{p.published_version && p.requires_ack ? `${p.acknowledged} / ${p.audience}` : p.published_version ? 'Not required' : '—'}</td><td><StatusBadge status={p.status} /></td></tr>)}
        </tbody></table></div>)}
      {creating && <Modal title="New policy" onClose={() => setCreating(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { const r = await api.post('/api/v1/policies', { ...f, owner: f.owner || null }); setCreating(false); reload(); setOpen(r.id); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid">
            <Field label="Code"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="Title"><input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Owner (optional)" hint="e.g. HR, Quality"><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary">Create</button></div>
        </form></Modal>}
      {open && <PolicyDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function PolicyDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: p, loading, error, reload } = useLoad(() => api.get(`/api/v1/policies/${id}`), [id]);
  const [drafting, setDrafting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [confirm, setConfirm] = useState<{ kind: 'publish' | 'discard' | 'withdraw' | 'retire'; versionId?: string } | null>(null);
  const run = async (url: string, body: unknown, msg: string) => { try { const r = await api.post(url, body); toast(r.notified != null ? `${msg}; ${r.notified} people notified` : msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  return (
    <Modal title={p ? `${p.code} — ${p.title}` : 'Policy'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={p.status} /><span className="muted">{CATEGORY[p.category]}{p.owner ? ` · ${p.owner}` : ''}</span><span className="spacer" />
            {p.status === 'active' && can('policies.manage') && !p.versions.some((v: any) => v.status === 'draft') && <button className="btn sm primary" onClick={() => setDrafting(true)}>New version</button>}
            {p.status === 'active' && can('policies.publish') && <button className="btn sm danger" onClick={() => setConfirm({ kind: 'retire' })}>Retire</button>}</div>
          {!p.versions.length ? <div className="muted">No versions yet.</div> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Version</th><th>Status</th><th>Change</th><th>Drafted / published by</th><th>Acks</th><th /></tr></thead><tbody>
              {p.versions.map((v: any) => <tr key={v.id}><td>v{v.version_no}<div className="muted" style={{ fontSize: 12 }}>eff. {fmtDate(v.effective_from)}</div></td><td><StatusBadge status={v.status} /></td>
                <td>{v.change_summary}{(v.audience_branch_ids.length > 0 || v.audience_department_ids.length > 0) && <div className="muted" style={{ fontSize: 12 }}>Limited audience</div>}</td>
                <td className="muted" style={{ fontSize: 12 }}>{v.created_by_name}{v.published_by_name ? ` → ${v.published_by_name}` : ''}</td><td>{v.requires_ack ? v.acknowledgements : '—'}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <a className="btn sm" href={`/policies?version=${v.id}`} style={{ textDecoration: 'none' }}>View</a>
                  {v.status === 'draft' && can('policies.publish') && v.created_by !== me!.user.id && <button className="btn sm primary" onClick={() => setConfirm({ kind: 'publish', versionId: v.id })}>Publish</button>}
                  {v.status === 'draft' && v.created_by === me!.user.id && <span className="muted" style={{ fontSize: 12 }}>Needs another publisher</span>}
                  {v.status === 'draft' && can('policies.manage') && <button className="btn sm" onClick={() => setConfirm({ kind: 'discard', versionId: v.id })}>Discard</button>}
                  {v.status === 'published' && can('policies.publish') && <button className="btn sm" onClick={() => setConfirm({ kind: 'withdraw', versionId: v.id })}>Withdraw</button>}
                  {v.requires_ack && v.status !== 'draft' && <button className="btn sm" onClick={() => setReport(v)}>Report</button>}
                </div></td></tr>)}
            </tbody></table></div>)}
        </div>
      )}
      {drafting && <VersionForm policyId={id} onClose={() => setDrafting(false)} onDone={() => { reload(); toast('Draft saved; another publisher must publish it'); }} />}
      {report && <AckReport version={report} onClose={() => setReport(null)} />}
      {confirm && <Confirm title={{ publish: 'Publish version', discard: 'Discard draft', withdraw: 'Withdraw version', retire: 'Retire policy' }[confirm.kind]}
        danger={confirm.kind !== 'publish'} requireComment={confirm.kind === 'withdraw' || confirm.kind === 'retire'}
        confirmLabel={{ publish: 'Publish', discard: 'Discard', withdraw: 'Withdraw', retire: 'Retire' }[confirm.kind]}
        message={{ publish: 'Publishing replaces the current version and notifies everyone in the audience.', discard: 'Discard this draft?', withdraw: 'Staff will no longer see this version. Acknowledgements already given are kept.', retire: 'The policy and its current version are withdrawn. History and acknowledgements are kept.' }[confirm.kind]}
        onClose={() => setConfirm(null)} onConfirm={async (comment?: string) => {
          const c = confirm;
          if (c.kind === 'retire') await run(`/api/v1/policies/${id}/retire`, { reason: comment }, 'Policy retired');
          else await run(`/api/v1/policies/versions/${c.versionId}/${c.kind}`, c.kind === 'withdraw' ? { reason: comment } : undefined, c.kind === 'publish' ? 'Published' : c.kind === 'discard' ? 'Draft discarded' : 'Withdrawn');
        }} />}
    </Modal>
  );
}

function VersionForm({ policyId, onClose, onDone }: { policyId: string; onClose: () => void; onDone: () => void }) {
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const [f, setF] = useState({ changeSummary: '', effectiveFrom: todayLocal(), body: '', requiresAck: true, ackDueDays: 14 });
  const [branches, setBranches] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const multi = (vals: string[], set: (v: string[]) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { void vals; set([...e.target.selectedOptions].map((o) => o.value)); };
  return (
    <Modal title="New policy version" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const form = new FormData();
        form.append('changeSummary', f.changeSummary); form.append('effectiveFrom', f.effectiveFrom); form.append('requiresAck', String(f.requiresAck)); form.append('ackDueDays', String(f.ackDueDays));
        if (f.body.trim()) form.append('body', f.body);
        if (branches.length) form.append('audienceBranchIds', branches.join(','));
        if (depts.length) form.append('audienceDepartmentIds', depts.join(','));
        if (file) form.append('file', file);
        try { await api.upload(`/api/v1/policies/${policyId}/versions`, form); onDone(); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <Field label="What changed"><input required minLength={3} value={f.changeSummary} onChange={(e) => setF({ ...f, changeSummary: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Effective from"><input type="date" required value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
          <Field label="Acknowledge within (days)"><input type="number" min={1} max={180} value={f.ackDueDays} disabled={!f.requiresAck} onChange={(e) => setF({ ...f, ackDueDays: Number(e.target.value) })} /></Field>
        </div>
        <label className="row"><input type="checkbox" checked={f.requiresAck} onChange={(e) => setF({ ...f, requiresAck: e.target.checked })} /> Employees must acknowledge this version</label>
        <Field label="Policy text" hint="Plain text. You can also (or instead) attach the signed PDF."><textarea rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="PDF (optional)"><input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        {org.data && <div className="form-grid">
          <Field label="Branches" hint="None selected = all"><select multiple value={branches} onChange={multi(branches, setBranches)} style={{ minHeight: 80 }}>{org.data.branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Departments" hint="None selected = all"><select multiple value={depts} onChange={multi(depts, setDepts)} style={{ minHeight: 80 }}>{org.data.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        </div>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save draft</button></div>
      </form>
    </Modal>
  );
}

function AckReport({ version, onClose }: { version: any; onClose: () => void }) {
  const [status, setStatus] = useState<'pending' | 'acknowledged' | ''>('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/policies/versions/${version.id}/acknowledgements${qs({ status: status || undefined, page, pageSize: 25 })}`), [status, page]);
  return (
    <Modal title={`Acknowledgements — v${version.version_no}`} onClose={onClose}>
      <div className="stack">
        <div className="row"><select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}><option value="pending">Not yet acknowledged</option><option value="acknowledged">Acknowledged</option><option value="">Everyone in audience</option></select>
          <span className="spacer" /><a className="btn sm" href={`/api/v1/policies/versions/${version.id}/acknowledgements.xlsx`} style={{ textDecoration: 'none' }}>Export Excel</a>
            <a className="btn sm" href={`/api/v1/policies/versions/${version.id}/acknowledgements.csv`} style={{ textDecoration: 'none' }}>Export CSV</a></div>
        <ErrorBox error={error} />
        {loading ? <Loading /> : !data.items.length ? <Empty>Nobody here.</Empty> : (
          <>
            <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Branch / department</th><th>Acknowledged</th></tr></thead><tbody>
              {data.items.map((r: any) => <tr key={r.employee_id}><td>{r.name} <span className="muted mono">{r.employee_code}</span></td><td className="muted">{[r.branch, r.department].filter(Boolean).join(' · ')}</td>
                <td>{r.acknowledged_at ? fmtDateTime(r.acknowledged_at) : <span className="badge warn">Pending</span>}</td></tr>)}
            </tbody></table></div>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
    </Modal>
  );
}
