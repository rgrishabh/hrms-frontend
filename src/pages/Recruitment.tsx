import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, money, todayLocal, addDays, localInputToIso } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';

type Tab = 'requisitions' | 'candidates' | 'interviews';
const STAGE_LABEL: Record<string, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected', withdrawn: 'Withdrawn' };
const SOURCES: Record<string, string> = { job_portal: 'Job portal', referral: 'Employee referral', website: 'Company website', agency: 'Agency', campus: 'Campus', walk_in: 'Walk-in', other: 'Other' };
const KINDS: Record<string, string> = { phone: 'Phone screen', technical: 'Technical', practical_lab: 'Practical / lab', hr: 'HR', panel: 'Panel', other: 'Other' };
const REC: Record<string, string> = { strong_yes: 'Strong yes', yes: 'Yes', no: 'No', strong_no: 'Strong no' };
const EMP_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];
const name = (c: { first_name: string; last_name?: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(' ');
const years = (m: number | null | undefined) => (m == null ? '—' : `${(m / 12).toFixed(1)} yrs`);

export function Recruitment() {
  const { canAny } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: { key: Tab; label: string }[] = [];
  if (canAny('recruitment.requisition', 'recruitment.read', 'recruitment.manage', 'recruitment.approve')) tabs.push({ key: 'requisitions', label: 'Requisitions' });
  if (canAny('recruitment.read', 'recruitment.manage')) tabs.push({ key: 'candidates', label: 'Candidates' });
  tabs.push({ key: 'interviews', label: 'My interviews' });
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? tabs[0]!.key) as Tab;
  const openApp = params.get('application');
  return (
    <div className="stack">
      <div><h1>Recruitment</h1><p className="sub">Approved requisitions, candidates, interviews and offers. Hiring creates the employee record.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'requisitions' && <Requisitions onOpenApp={(id) => setParams({ tab, application: id })} />}
      {tab === 'candidates' && <Candidates />}
      {tab === 'interviews' && <MyInterviews onOpenApp={(id) => setParams({ tab, application: id })} />}
      {openApp && <ApplicationDetail id={openApp} onClose={() => setParams({ tab })} />}
    </div>
  );
}

// ------------------------------------------------------------------ pickers
function OrgFields({ v, set }: { v: any; set: (p: any) => void }) {
  const org = useLoad(() => api.get('/api/v1/org'), []);
  if (!org.data) return <Loading />;
  const branches = org.data.branches.filter((b: any) => !v.legalEntityId || b.legal_entity_id === v.legalEntityId);
  return (
    <div className="form-grid">
      <Field label="Legal entity"><select required value={v.legalEntityId} onChange={(e) => set({ legalEntityId: e.target.value, branchId: '' })}>
        <option value="">Select…</option>{org.data.legalEntities.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Branch"><select required value={v.branchId} onChange={(e) => set({ branchId: e.target.value })}>
        <option value="">Select…</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Department"><select value={v.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || null })}>
        <option value="">—</option>{org.data.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Employment type"><select value={v.employmentType} onChange={(e) => set({ employmentType: e.target.value })}>{EMP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
    </div>
  );
}

function EmployeePicker({ value, onChange, label }: { value: string | null; onChange: (id: string | null) => void; label: string }) {
  const [search, setSearch] = useState('');
  const { data } = useLoad(() => api.get(`/api/v1/employees${qs({ search: search || undefined, pageSize: 20 })}`), [search]);
  return (
    <Field label={label}><div className="stack" style={{ gap: 4 }}>
      <input placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}><option value="">—</option>
        {(data?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''} ({e.employee_code})</option>)}</select>
    </div></Field>
  );
}

// ------------------------------------------------------------------ requisitions
function Requisitions({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const { canAny } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/recruitment/requisitions${qs({ status: status || undefined, page, pageSize: 25 })}`), [status, page]);
  return (
    <div className="stack">
      <div className="row">
        <Field label="Status"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>
          {['draft', 'pending', 'approved', 'on_hold', 'closed', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
        <span className="spacer" />
        {canAny('recruitment.requisition', 'recruitment.manage') && <button className="btn primary" onClick={() => setEditing({ title: '', legalEntityId: '', branchId: '', departmentId: null, designation: '',
          employmentType: 'permanent', positions: 1, justification: '', budgetCtcMax: '', hiringManagerId: null, targetDate: '' })}>New requisition</button>}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No requisitions.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Req</th><th>Position</th><th>Branch</th><th>Hiring manager</th><th>Filled</th><th>Pipeline</th><th>Status</th></tr></thead><tbody>
            {data.items.map((r: any) => <tr key={r.id} className="clickable" onClick={() => setOpen(r.id)}>
              <td className="mono">{r.code}</td><td>{r.title}<div className="muted" style={{ fontSize: 12 }}>{r.designation ?? ''} · {r.employment_type}</div></td>
              <td>{r.branch_name}{r.department_name ? ` · ${r.department_name}` : ''}</td><td>{r.hiring_manager_name ?? '—'}</td><td>{r.filled}/{r.positions}</td>
              <td style={{ fontSize: 12 }}>{Object.entries(r.pipeline ?? {}).map(([s, n]) => `${STAGE_LABEL[s]} ${n}`).join(' · ') || '—'}</td><td><StatusBadge status={r.status} /></td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {editing && <RequisitionForm init={editing} onClose={() => setEditing(null)} onSaved={(id) => { reload(); setOpen(id); }} />}
      {open && <RequisitionDetail id={open} onClose={() => { setOpen(null); reload(); }} onEdit={(r) => setEditing(r)} onOpenApp={onOpenApp} />}
    </div>
  );
}

function RequisitionForm({ init, onClose, onSaved }: { init: any; onClose: () => void; onSaved: (id: string) => void }) {
  const { can } = useAuth();
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const set = (p: any) => setF({ ...f, ...p });
  return (
    <Modal title={init.id ? `Edit ${init.code}` : 'New job requisition'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const { id, code, version, ...b } = f; void code;
        const body = { ...b, positions: Number(b.positions), designation: b.designation || null, targetDate: b.targetDate || null,
          budgetCtcMax: b.budgetCtcMax === '' || b.budgetCtcMax == null ? null : Number(b.budgetCtcMax) };
        try {
          if (id) { await api.put(`/api/v1/recruitment/requisitions/${id}`, { ...body, expectedVersion: version }); onSaved(id); }
          else onSaved((await api.post('/api/v1/recruitment/requisitions', body)).id);
          onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Position title" hint="e.g. Senior Chemist — Water lab"><input required minLength={3} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <OrgFields v={f} set={set} />
        <div className="form-grid">
          <Field label="Designation"><input value={f.designation ?? ''} onChange={(e) => set({ designation: e.target.value })} /></Field>
          <Field label="Positions"><input type="number" min={1} max={100} required value={f.positions} onChange={(e) => set({ positions: e.target.value })} /></Field>
          <Field label="Target joining by"><input type="date" value={f.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value })} /></Field>
          {can('recruitment.compensation') && <Field label="Budget per position (annual CTC, ₹)"><input type="number" min={1} step="0.01" value={f.budgetCtcMax ?? ''} onChange={(e) => set({ budgetCtcMax: e.target.value })} /></Field>}
        </div>
        <EmployeePicker label="Hiring manager" value={f.hiringManagerId} onChange={(id) => set({ hiringManagerId: id })} />
        <Field label="Justification" hint="Why the position is needed (backfill, new scope, workload)"><textarea required minLength={3} value={f.justification} onChange={(e) => set({ justification: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save draft</button></div>
      </form>
    </Modal>
  );
}

function RequisitionDetail({ id, onClose, onEdit, onOpenApp }: { id: string; onClose: () => void; onEdit: (r: any) => void; onOpenApp: (id: string) => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: r, loading, error, reload } = useLoad(() => api.get(`/api/v1/recruitment/requisitions/${id}`), [id]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const run = async (url: string, body: unknown, msg: string) => { try { await api.post(url, body); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  const mine = r && r.created_by === me!.user.id;
  return (
    <Modal title={r ? `${r.code} — ${r.title}` : 'Requisition'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={r.status} /><span className="muted">{r.filled}/{r.positions} filled · {r.employment_type}</span><span className="spacer" />
            {['draft', 'rejected'].includes(r.status) && (mine || can('recruitment.manage')) && <>
              <button className="btn sm" onClick={() => onEdit({ id: r.id, code: r.code, version: r.version, title: r.title, legalEntityId: r.legal_entity_id, branchId: r.branch_id, departmentId: r.department_id,
                designation: r.designation ?? '', employmentType: r.employment_type, positions: r.positions, justification: r.justification, budgetCtcMax: r.budget_ctc_max ?? '',
                hiringManagerId: r.hiring_manager_id, targetDate: r.target_date ?? '' })}>Edit</button>
              <button className="btn sm primary" onClick={() => run(`/api/v1/recruitment/requisitions/${id}/submit`, {}, 'Sent for approval')}>Submit for approval</button></>}
            {can('recruitment.manage') && r.status === 'approved' && <button className="btn sm" onClick={() => setConfirm('hold')}>Hold</button>}
            {can('recruitment.manage') && ['on_hold', 'closed'].includes(r.status) && <button className="btn sm" onClick={() => setConfirm('reopen')}>Reopen</button>}
            {can('recruitment.manage') && ['approved', 'on_hold'].includes(r.status) && <button className="btn sm" onClick={() => setConfirm('close')}>Close</button>}
            {can('recruitment.manage') && !['closed', 'cancelled'].includes(r.status) && <button className="btn sm danger" onClick={() => setConfirm('cancel')}>Cancel</button>}</div>
          <div className="muted" style={{ fontSize: 13 }}>{r.legal_entity_name} · {r.branch_name}{r.department_name ? ` · ${r.department_name}` : ''} · hiring manager {r.hiring_manager_name ?? '—'}
            {r.budget_ctc_max ? ` · budget ${money(r.budget_ctc_max)}` : ''}{r.target_date ? ` · by ${fmtDate(r.target_date)}` : ''} · requested by {r.created_by_name}</div>
          <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{r.justification}</div>
          <div className="row"><h3 style={{ margin: 0 }}>Candidates</h3><span className="spacer" />
            {can('recruitment.manage') && r.status === 'approved' && <button className="btn sm primary" onClick={() => setAdding(true)}>Add candidate</button>}</div>
          {!r.applications.length ? <div className="muted">No candidates yet.</div> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Candidate</th><th>Experience</th><th>Source</th><th>Rating</th><th>Stage</th></tr></thead><tbody>
              {r.applications.map((a: any) => <tr key={a.id} className="clickable" onClick={() => onOpenApp(a.id)}><td>{name(a)}<div className="muted" style={{ fontSize: 12 }}>{a.current_company ?? ''}</div></td>
                <td>{years(a.experience_months)}</td><td>{SOURCES[a.source]}</td><td>{a.avg_rating ?? '—'}</td><td><StatusBadge status={a.stage} /></td></tr>)}
            </tbody></table></div>)}
        </div>
      )}
      {adding && <AddToRequisition requisitionId={id} onClose={() => setAdding(false)} onDone={reload} />}
      {confirm && <Confirm title={`${confirm[0]!.toUpperCase()}${confirm.slice(1)} requisition`} requireComment danger={confirm === 'cancel'} confirmLabel={confirm}
        message="A reason is recorded in the audit history." onClose={() => setConfirm(null)}
        onConfirm={async (reason) => run(`/api/v1/recruitment/requisitions/${id}/${confirm}`, { reason }, 'Updated')} />}
    </Modal>
  );
}

function AddToRequisition({ requisitionId, onClose, onDone }: { requisitionId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { data } = useLoad(() => api.get(`/api/v1/recruitment/candidates${qs({ search: search || undefined, pageSize: 15 })}`), [search]);
  const add = async (candidateId: string) => {
    try { await api.post('/api/v1/recruitment/applications', { requisitionId, candidateId }); toast('Added to the pipeline'); onDone(); onClose(); } catch (x) { toast(errText(x), 'error'); }
  };
  return (
    <Modal title="Add candidate" onClose={onClose}>
      <div className="stack">
        <div className="row"><input placeholder="Search existing candidates" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" onClick={() => setCreating(true)}>New candidate</button></div>
        {(data?.items ?? []).map((c: any) => <div key={c.id} className="row"><div>{name(c)} <span className="muted" style={{ fontSize: 12 }}>{c.email ?? c.phone} · {years(c.experience_months)}</span></div>
          <span className="spacer" /><button className="btn sm" onClick={() => add(c.id)}>Add</button></div>)}
      </div>
      {creating && <CandidateForm onClose={() => setCreating(false)} onSaved={(id) => add(id)} />}
    </Modal>
  );
}

// ------------------------------------------------------------------ candidates
function Candidates() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/recruitment/candidates${qs({ search: search || undefined, page, pageSize: 25 })}`), [search, page]);
  return (
    <div className="stack">
      <div className="row"><input placeholder="Search name, email, phone, company" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ flex: 1, maxWidth: 360 }} />
        <span className="spacer" />{can('recruitment.manage') && <button className="btn primary" onClick={() => setCreating(true)}>New candidate</button>}</div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No candidates.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Name</th><th>Contact</th><th>Current role</th><th>Experience</th><th>Source</th><th>Applications</th><th>Keep until</th></tr></thead><tbody>
            {data.items.map((c: any) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}><td>{name(c)}{c.employee_id && <span className="badge ok" style={{ marginLeft: 6 }}>Hired</span>}</td>
              <td style={{ fontSize: 12 }}>{c.email}<div>{c.phone}</div></td><td>{[c.current_designation, c.current_company].filter(Boolean).join(', ') || '—'}</td>
              <td>{years(c.experience_months)}</td><td>{SOURCES[c.source]}</td><td>{c.applications}</td><td className="muted">{fmtDate(c.retain_until)}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {creating && <CandidateForm onClose={() => setCreating(false)} onSaved={(id) => { reload(); setOpen(id); }} />}
      {open && <CandidateDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function CandidateForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { can } = useAuth();
  const [f, setF] = useState<Record<string, string>>({ firstName: '', lastName: '', email: '', phone: '', source: 'job_portal', currentCompany: '', currentDesignation: '',
    experienceMonths: '', noticeDays: '', expectedCtc: '', location: '', qualification: '', consentNote: '' });
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dups, setDups] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (confirmDuplicate: boolean) => {
    setError(null);
    const form = new FormData();
    for (const [k, v] of Object.entries(f)) if (v) form.append(k, v);
    form.append('consent', String(consent)); form.append('confirmDuplicate', String(confirmDuplicate));
    if (file) form.append('resume', file);
    try { const r = await api.upload('/api/v1/recruitment/candidates', form); onSaved(r.id); onClose(); }
    catch (x: any) { if (x?.code === 'conflict' && x?.details?.duplicates) setDups(x.details.duplicates); else setError(errText(x)); }
  };
  const input = (k: string, label: string, props: Record<string, unknown> = {}) => <Field label={label}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></Field>;
  return (
    <Modal title="New candidate" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="form-grid">
          {input('firstName', 'First name', { required: true })}{input('lastName', 'Last name')}
          {input('email', 'Email', { type: 'email' })}{input('phone', 'Phone')}
          <Field label="Source"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {input('qualification', 'Qualification', { placeholder: 'e.g. M.Sc. Chemistry' })}
          {input('currentCompany', 'Current company')}{input('currentDesignation', 'Current designation')}
          {input('experienceMonths', 'Experience (months)', { type: 'number', min: 0 })}{input('noticeDays', 'Notice period (days)', { type: 'number', min: 0 })}
          {input('location', 'Location')}
          {can('recruitment.compensation') && input('expectedCtc', 'Expected CTC (annual, ₹)', { type: 'number', min: 1, step: '0.01' })}
        </div>
        <Field label="Resume" hint="PDF, Word (DOCX) or image"><input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="card stack" style={{ gap: 6 }}>
          <label className="row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> The candidate agreed to us processing their data for this recruitment.</label>
          <Field label="How consent was obtained" hint="e.g. 'Applied on Naukri; consent checkbox' or 'Email of 2 Nov 2026'"><input required minLength={3} value={f.consentNote} onChange={(e) => setF({ ...f, consentNote: e.target.value })} /></Field>
          <div className="muted" style={{ fontSize: 12 }}>Data is anonymized and the resume deleted after the retention period unless the candidate is hired.</div>
        </div>
        {dups && <div className="alert warn">Possible duplicate: {dups.map((d) => d.name).join(', ')}. The same email is always the same person.
          <div className="row" style={{ marginTop: 6 }}><span className="spacer" /><button type="button" className="btn sm" onClick={() => submit(true)}>It's a different person — save</button></div></div>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!consent}>Save</button></div>
      </form>
    </Modal>
  );
}

function CandidateDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [, setParams] = useSearchParams();
  const { data: c, loading, error } = useLoad(() => api.get(`/api/v1/recruitment/candidates/${id}`), [id]);
  const [erase, setErase] = useState(false);
  return (
    <Modal title={c ? name(c) : 'Candidate'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>{[c.email, c.phone, c.location].filter(Boolean).join(' · ')}</div>
          <div className="form-grid" style={{ fontSize: 13 }}>
            <div><strong>Current</strong><div>{[c.current_designation, c.current_company].filter(Boolean).join(', ') || '—'}</div></div>
            <div><strong>Experience</strong><div>{years(c.experience_months)} · notice {c.notice_days ?? '—'} days</div></div>
            <div><strong>Qualification</strong><div>{c.qualification ?? '—'}</div></div>
            <div><strong>Source</strong><div>{SOURCES[c.source]}{c.referred_by_name ? ` (${c.referred_by_name})` : ''}</div></div>
            {c.expected_ctc && <div><strong>Expected CTC</strong><div>{money(c.expected_ctc)}</div></div>}
            <div><strong>Consent</strong><div>{fmtDateTime(c.consent_at)} — {c.consent_note}</div></div>
          </div>
          <div className="row">{c.has_resume && <a className="btn sm" href={`/api/v1/recruitment/candidates/${id}/resume`} style={{ textDecoration: 'none' }}>Download resume</a>}
            <span className="muted" style={{ fontSize: 12 }}>Kept until {fmtDate(c.retain_until)}</span><span className="spacer" />
            {can('recruitment.manage') && c.status === 'active' && <button className="btn sm danger" onClick={() => setErase(true)}>Erase personal data</button>}</div>
          {c.applications.length > 0 && <div className="table-wrap"><table className="t"><thead><tr><th>Requisition</th><th>Stage</th><th>Updated</th></tr></thead><tbody>
            {c.applications.map((a: any) => <tr key={a.id} className="clickable" onClick={() => setParams({ tab: 'candidates', application: a.id })}>
              <td><span className="mono">{a.requisition_code}</span> {a.title}</td><td><StatusBadge status={a.stage} /></td><td>{fmtDateTime(a.updated_at)}</td></tr>)}
          </tbody></table></div>}
        </div>
      )}
      {erase && <Confirm title="Erase candidate data" danger requireComment confirmLabel="Erase" message="Name, contact details and notes are cleared and the resume is deleted. This cannot be undone."
        onClose={() => setErase(false)} onConfirm={async (reason) => { try { await api.post(`/api/v1/recruitment/candidates/${id}/anonymize`, { reason }); toast('Personal data erased'); onClose(); } catch (x) { toast(errText(x), 'error'); } }} />}
    </Modal>
  );
}

// ------------------------------------------------------------------ application
function ApplicationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: a, loading, error, reload } = useLoad(() => api.get(`/api/v1/recruitment/applications/${id}`), [id]);
  const [moving, setMoving] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [hiring, setHiring] = useState<any>(null);
  const run = async (url: string, body: unknown, msg: string) => { try { await api.post(url, body); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  return (
    <Modal title={a ? `${name(a.candidate)} — ${a.requisition.code}` : 'Application'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={a.stage} /><span className="muted">{a.requisition.title}</span><span className="spacer" />
            {a.candidate.has_resume && <a className="btn sm" href={`/api/v1/recruitment/candidates/${a.candidate.id}/resume`} style={{ textDecoration: 'none' }}>Resume</a>}</div>
          <div className="muted" style={{ fontSize: 13 }}>{[a.candidate.current_designation, a.candidate.current_company, years(a.candidate.experience_months), a.candidate.qualification].filter(Boolean).join(' · ')}</div>
          {a.allowedMoves.length > 0 && <div className="row">{a.allowedMoves.map((s: string) => <button key={s} className={`btn sm ${s === 'rejected' ? 'danger' : ''}`} onClick={() => setMoving(s)}>→ {STAGE_LABEL[s]}</button>)}</div>}

          <div className="row"><h3 style={{ margin: 0 }}>Interviews</h3><span className="spacer" />
            {can('recruitment.manage') && a.stage === 'interview' && <button className="btn sm primary" onClick={() => setScheduling(true)}>Schedule interview</button>}</div>
          {!a.interviews.length ? <div className="muted">None yet.</div> : a.interviews.map((iv: any) => {
            const mine = iv.panel.find((p: any) => p.user_id === me!.user.id);
            return (
              <div key={iv.id} className="card stack" style={{ gap: 6 }}>
                <div className="row"><strong>Round {iv.round} · {KINDS[iv.kind]}</strong><StatusBadge status={iv.status} /><span className="muted">{fmtDateTime(iv.scheduled_at)}{iv.location ? ` · ${iv.location}` : ''}</span><span className="spacer" />
                  {mine && !mine.submitted_at && iv.status !== 'cancelled' && <button className="btn sm primary" onClick={() => setFeedback(iv)}>Give feedback</button>}
                  {can('recruitment.manage') && iv.status === 'scheduled' && <button className="btn sm" onClick={() => run(`/api/v1/recruitment/interviews/${iv.id}/cancel`, {}, 'Interview cancelled')}>Cancel</button>}</div>
                {iv.panel.map((p: any) => <div key={p.user_id} style={{ fontSize: 13 }}><strong>{p.name}</strong>: {p.submitted_at ? (p.hidden ? <span className="muted">submitted (hidden until you submit yours)</span>
                  : <>{'★'.repeat(p.rating)}{'☆'.repeat(5 - p.rating)} · {REC[p.recommendation]}<div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</div></>) : <span className="muted">pending</span>}</div>)}
              </div>
            );
          })}

          {a.access !== 'panel' && <>
            <div className="row"><h3 style={{ margin: 0 }}>Offer</h3><span className="spacer" />
              {can('recruitment.manage') && can('recruitment.compensation') && a.stage === 'offer' && !a.offers.some((o: any) => ['draft', 'pending', 'approved', 'sent', 'accepted'].includes(o.status)) &&
                <button className="btn sm primary" onClick={() => setOffer({ designation: '', legalEntityId: '', branchId: '', departmentId: null, employmentType: 'permanent', annualCtc: '', joiningDate: addDays(todayLocal(), 30), probationMonths: 6, contractEndDate: '', notes: '' })}>Draft offer</button>}</div>
            {a.offers.map((o: any) => (
              <div key={o.id} className="card stack" style={{ gap: 6 }}>
                <div className="row"><strong>{o.designation}</strong><StatusBadge status={o.status} />{o.above_budget && <span className="badge warn">Above budget</span>}<span className="spacer" />
                  {o.annual_ctc && <strong>{money(o.annual_ctc)} / yr</strong>}</div>
                <div className="muted" style={{ fontSize: 13 }}>{o.branch_name} · {o.employment_type} · joins {fmtDate(o.joining_date)}{o.probation_months ? ` · ${o.probation_months} months probation` : ''}</div>
                {can('recruitment.manage') && <div className="row">
                  {['draft', 'rejected'].includes(o.status) && <button className="btn sm primary" onClick={() => run(`/api/v1/recruitment/offers/${o.id}/submit`, {}, 'Sent for approval')}>Submit for approval</button>}
                  {o.status === 'approved' && <button className="btn sm primary" onClick={() => run(`/api/v1/recruitment/offers/${o.id}/sent`, {}, 'Marked as sent')}>Mark sent</button>}
                  {o.status === 'sent' && <><button className="btn sm primary" onClick={() => run(`/api/v1/recruitment/offers/${o.id}/accepted`, {}, 'Accepted')}>Accepted</button>
                    <button className="btn sm" onClick={() => run(`/api/v1/recruitment/offers/${o.id}/declined`, {}, 'Declined')}>Declined</button></>}
                  {o.status === 'accepted' && !o.employee_id && can('employees.manage') && <button className="btn sm primary" onClick={() => setHiring(o)}>Hire → create employee</button>}
                  {o.employee_id && <a className="btn sm" href={`/employees/${o.employee_id}`} style={{ textDecoration: 'none' }}>Open employee</a>}
                  {['draft', 'approved', 'sent', 'rejected'].includes(o.status) && <button className="btn sm danger" onClick={() => run(`/api/v1/recruitment/offers/${o.id}/withdraw`, {}, 'Offer withdrawn')}>Withdraw</button>}
                </div>}
              </div>))}
            {a.events.length > 0 && <div className="stack" style={{ gap: 2 }}><strong>History</strong>{a.events.map((e: any, i: number) => <div key={i} style={{ fontSize: 13 }}>
              <span className="muted">{fmtDateTime(e.at)}</span> · {e.from_stage ? `${STAGE_LABEL[e.from_stage]} → ` : ''}{STAGE_LABEL[e.to_stage]} · {e.actor_name ?? 'system'}{e.note ? ` — ${e.note}` : ''}</div>)}</div>}
          </>}
        </div>
      )}
      {moving && a && <Confirm title={`Move to ${STAGE_LABEL[moving]}`} danger={moving === 'rejected'} requireComment={moving === 'rejected'} confirmLabel="Move"
        message={moving === 'rejected' ? 'Give the reason for rejecting (kept in the history).' : 'Add an optional note in the history.'}
        onClose={() => setMoving(null)} onConfirm={async (comment) => run(`/api/v1/recruitment/applications/${id}/move`,
          { stage: moving, expectedVersion: a.version, ...(moving === 'rejected' ? { reason: comment } : { note: comment || null }) }, `Moved to ${STAGE_LABEL[moving]}`)} />}
      {scheduling && <ScheduleInterview applicationId={id} nextRound={(a?.interviews.length ?? 0) + 1} onClose={() => setScheduling(false)} onDone={reload} />}
      {feedback && <FeedbackForm interview={feedback} onClose={() => setFeedback(null)} onDone={reload} />}
      {offer && <OfferForm applicationId={id} init={offer} onClose={() => setOffer(null)} onDone={reload} />}
      {hiring && <HireForm offer={hiring} onClose={() => setHiring(null)} onDone={reload} />}
    </Modal>
  );
}

function ScheduleInterview({ applicationId, nextRound, onClose, onDone }: { applicationId: string; nextRound: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ round: nextRound, kind: 'technical', at: '', durationMin: 45, location: '' });
  const [panel, setPanel] = useState<{ id: string; display_name: string }[]>([]);
  const [search, setSearch] = useState('');
  const users = useLoad(() => api.get(`/api/v1/recruitment/panel-users${qs({ search: search || undefined })}`), [search]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Schedule interview" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await api.post(`/api/v1/recruitment/applications/${applicationId}/interviews`, { round: Number(f.round), kind: f.kind, scheduledAt: localInputToIso(f.at), durationMin: Number(f.durationMin),
          location: f.location || null, panelUserIds: panel.map((p) => p.id) }); toast('Interview scheduled; the panel was notified'); onDone(); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <div className="form-grid">
          <Field label="Round"><input type="number" min={1} max={20} value={f.round} onChange={(e) => setF({ ...f, round: Number(e.target.value) })} /></Field>
          <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Date and time"><input type="datetime-local" required value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
          <Field label="Duration (minutes)"><input type="number" min={10} max={480} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Room or meeting link"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Panel"><div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{panel.map((p) => <span key={p.id} className="badge info">{p.display_name} <button type="button" className="btn sm" onClick={() => setPanel(panel.filter((x) => x.id !== p.id))}>×</button></span>)}</div>
          <input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="stack" style={{ gap: 2, maxHeight: 160, overflow: 'auto' }}>{(users.data?.items ?? []).filter((u: any) => !panel.some((p) => p.id === u.id)).map((u: any) =>
            <button type="button" key={u.id} className="btn sm" style={{ textAlign: 'left' }} onClick={() => setPanel([...panel, u])}>+ {u.display_name}{u.designation ? ` · ${u.designation}` : ''}</button>)}</div>
        </div></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!panel.length}>Schedule</button></div>
      </form>
    </Modal>
  );
}

function FeedbackForm({ interview, onClose, onDone }: { interview: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ rating: 0, recommendation: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Feedback — round ${interview.round}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await api.post(`/api/v1/recruitment/interviews/${interview.id}/feedback`, f); toast('Feedback submitted'); onDone(); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Rating"><div className="row">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={`btn sm ${f.rating >= n ? 'primary' : ''}`} onClick={() => setF({ ...f, rating: n })}>★ {n}</button>)}</div></Field>
        <Field label="Recommendation"><select required value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })}><option value="">Select…</option>
          {Object.entries(REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Notes" hint="Evidence for your rating: what the candidate did well or not. Submitted once; colleagues see it after submitting theirs."><textarea required minLength={10} rows={6} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.rating}>Submit</button></div>
      </form>
    </Modal>
  );
}

function OfferForm({ applicationId, init, onClose, onDone }: { applicationId: string; init: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const set = (p: any) => setF({ ...f, ...p });
  return (
    <Modal title="Draft offer" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api.post(`/api/v1/recruitment/applications/${applicationId}/offers`, { ...f, annualCtc: Number(f.annualCtc), probationMonths: f.probationMonths === '' ? null : Number(f.probationMonths),
            contractEndDate: f.contractEndDate || null, notes: f.notes || null });
          toast(r.aboveBudget ? 'Draft saved — above the requisition budget' : 'Draft saved'); onDone(); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Designation"><input required value={f.designation} onChange={(e) => set({ designation: e.target.value })} /></Field>
        <OrgFields v={f} set={set} />
        <div className="form-grid">
          <Field label="Annual CTC (₹)"><input type="number" required min={1} step="0.01" value={f.annualCtc} onChange={(e) => set({ annualCtc: e.target.value })} /></Field>
          <Field label="Joining date"><input type="date" required min={todayLocal()} value={f.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} /></Field>
          <Field label="Probation (months)"><input type="number" min={0} max={24} value={f.probationMonths} onChange={(e) => set({ probationMonths: e.target.value })} /></Field>
          {f.employmentType === 'contract' && <Field label="Contract end"><input type="date" required value={f.contractEndDate} onChange={(e) => set({ contractEndDate: e.target.value })} /></Field>}
        </div>
        <Field label="Notes"><textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="muted" style={{ fontSize: 12 }}>The approval request shows candidate and designation only; compensation stays visible only to people with compensation access.</div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save draft</button></div>
      </form>
    </Modal>
  );
}

function HireForm({ offer, onClose, onDone }: { offer: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Hire — create employee record" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { const r = await api.post(`/api/v1/recruitment/offers/${offer.id}/hire`, { employeeCode: code, workEmail: email || undefined });
          toast(r.requisitionClosed ? 'Employee created (pre-joining); the requisition is now filled and closed' : 'Employee created (pre-joining)'); onDone(); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <p className="muted" style={{ margin: 0 }}>Creates the employee as <strong>pre-joining</strong> from the offer (designation, branch, joining date {fmtDate(offer.joining_date)}, probation) with the hiring manager as reporting manager.</p>
        <div className="form-grid">
          <Field label="Employee code"><input required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="Work email (optional)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Create employee</button></div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ my interviews
function MyInterviews({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/recruitment/interviews/mine'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.items.length) return <Empty>You are not on any interview panel.</Empty>;
  return (
    <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>Candidate</th><th>Position</th><th>Round</th><th>Your feedback</th></tr></thead><tbody>
      {data.items.map((i: any) => <tr key={i.id} className="clickable" onClick={() => onOpenApp(i.application_id)}><td>{fmtDateTime(i.scheduled_at)}<div className="muted" style={{ fontSize: 12 }}>{i.location ?? ''}</div></td>
        <td>{name(i)}</td><td><span className="mono">{i.requisition_code}</span> {i.requisition_title}</td><td>{i.round} · {KINDS[i.kind]}</td>
        <td>{i.submitted_at ? <span className="badge ok">Submitted</span> : new Date(i.scheduled_at) > new Date() ? <span className="badge">Upcoming</span> : <span className="badge warn">Due</span>}</td></tr>)}
    </tbody></table></div>
  );
}
