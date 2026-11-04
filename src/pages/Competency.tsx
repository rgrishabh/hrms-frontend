import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, todayLocal } from '../format';
import { useLoad, LoadFailed, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, useToast, errText } from '../ui';

type Tab = 'mine' | 'matrix' | 'authorizations' | 'assessments' | 'training' | 'setup';
const ACTIVITY: Record<string, string> = { sampling: 'Sampling', perform: 'Perform test', review: 'Review results', authorize_report: 'Authorize reports' };
const APPROACH: Record<string, string> = { witnessed: 'Witnessed performance', replicate: 'Replicate / CRM analysis', retained_sample: 'Retained sample retest', proficiency_test: 'Proficiency test',
  interlab_comparison: 'Interlaboratory comparison', written: 'Written / oral test', other: 'Other' };
const KINDS = ['induction', 'safety', 'method', 'instrument', 'quality', 'external', 'other'];
const VALIDITY_BADGE: Record<string, string> = { valid: 'ok', expiring: 'warn', expired: 'danger', failed: 'danger', revoked: '' };

export function Competency() {
  const { can, canAny, hasModule, me } = useAuth();
  const lab = hasModule('lab.competency');
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('competency.self')) tabs.push({ key: 'mine', label: 'My competence' });
  if (lab && can('competency.read')) tabs.push({ key: 'matrix', label: 'Competence matrix' });
  if (lab && canAny('competency.read', 'competency.authorize')) tabs.push({ key: 'authorizations', label: 'Authorizations' });
  if (lab && canAny('competency.read', 'competency.assess')) tabs.push({ key: 'assessments', label: 'Assessments' });
  if (canAny('training.manage', 'competency.read')) tabs.push({ key: 'training', label: 'Training records' });
  if (canAny('training.manage', 'competency.manage')) tabs.push({ key: 'setup', label: lab ? 'Courses & methods' : 'Courses' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to training and competency records.</Empty>;
  return (
    <div className="stack">
      <div><h1>{lab ? 'Training & competency' : 'Training'}</h1>
        <p className="sub">{lab ? 'Training records, competency assessments and quality-approved technical authorizations for laboratory methods.' : 'Training courses and employee training records.'}</p></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'mine' && <Mine />}
      {tab === 'matrix' && <Matrix />}
      {tab === 'authorizations' && <Authorizations />}
      {tab === 'assessments' && <Assessments />}
      {tab === 'training' && <TrainingRecords />}
      {tab === 'setup' && <Setup />}
    </div>
  );
}

function Validity({ v }: { v: string }) { return <span className={`badge ${VALIDITY_BADGE[v] ?? ''}`}>{v}</span>; }

function Mine() {
  const { hasModule } = useAuth();
  const { data, loading, error } = useLoad(() => api.get('/api/v1/competency/me'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      {hasModule('lab.competency') && <div className="card stack"><h3>My technical authorizations</h3>
        {!data.authorizations.length ? <div className="muted">None yet. Your laboratory manager records competency assessments; quality grants authorizations.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Method</th><th>Activity</th><th>Status</th><th>Since</th><th>Review due</th></tr></thead><tbody>
            {data.authorizations.map((a: any) => <tr key={a.id}><td><span className="mono">{a.method_code}</span> {a.method_name}{a.standard_ref && <div className="muted" style={{ fontSize: 12 }}>{a.standard_ref}</div>}</td>
              <td>{ACTIVITY[a.activity]}</td><td><StatusBadge status={a.status} /></td><td>{fmtDate(a.valid_from)}</td><td>{fmtDate(a.review_due)}</td></tr>)}
          </tbody></table></div>)}</div>}
      <div className="card stack"><h3>My training</h3>
        {!data.training.length ? <div className="muted">No training recorded.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Course</th><th>Completed</th><th>Valid until</th><th>Status</th></tr></thead><tbody>
            {data.training.map((t: any) => <tr key={t.id}><td><span className="mono">{t.course_code}</span> {t.course_name}</td><td>{fmtDate(t.completed_on)}</td>
              <td>{t.expires_on ? fmtDate(t.expires_on) : 'No expiry'}</td><td><Validity v={t.validity} /></td></tr>)}
          </tbody></table></div>)}</div>
    </div>
  );
}

function Matrix() {
  const [discipline, setDiscipline] = useState('');
  const methods = useLoad(() => api.get('/api/v1/competency/methods'), []);
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/competency/matrix${qs({ discipline: discipline || undefined })}`), [discipline]);
  const disciplines = [...new Set((methods.data?.items ?? []).map((m: any) => m.discipline).filter(Boolean))] as string[];
  const short: Record<string, string> = { sampling: 'S', perform: 'P', review: 'R', authorize_report: 'A' };
  return (
    <div className="stack">
      <div className="row">
        <Field label="Discipline"><select value={discipline} onChange={(e) => setDiscipline(e.target.value)}><option value="">All</option>{disciplines.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <span className="spacer" /><span className="muted" style={{ fontSize: 12 }}>S sampling · P perform · R review · A authorize reports. Green = in force; amber = pending; red = suspended, review overdue or required training lapsed.</span>
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? null : !data.methods.length ? <Empty>No active methods.</Empty> : !data.rows.length ? <Empty>No authorizations yet.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th>{data.methods.map((m: any) => <th key={m.id} title={m.name} className="mono">{m.code}</th>)}</tr></thead><tbody>
          {data.rows.map((r: any) => <tr key={r.employeeId}><td>{r.name} <span className="muted mono">{r.employeeCode}</span></td>
            {data.methods.map((m: any) => <td key={m.id}>{Object.entries(r.cells[m.id] ?? {}).map(([act, c]: [string, any]) =>
              <span key={act} title={`${ACTIVITY[act]}: ${c.status}${c.reviewDue ? `, review ${c.reviewDue}` : ''}${c.status === 'authorized' && !c.inForce ? ' — NOT in force' : ''}`}
                className={`badge ${c.inForce ? 'ok' : c.status === 'pending' ? 'warn' : 'danger'}`} style={{ marginRight: 3 }}>{short[act]}</span>)}</td>)}</tr>)}
        </tbody></table></div>)}
    </div>
  );
}

function Authorizations() {
  const [status, setStatus] = useState('in_force');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/competency/authorizations${qs({ status: status || undefined, page, pageSize: 25 })}`), [status, page]);
  return (
    <div className="stack">
      <div className="row"><Field label="Show"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="in_force">In force (incl. suspended)</option><option value="pending">Awaiting quality approval</option><option value="review_due">Review due within 30 days</option>
        <option value="suspended">Suspended</option><option value="ended">Ended</option><option value="">All</option></select></Field></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? null : !data.items.length ? <Empty>Nothing to show.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Method</th><th>Activity</th><th>Status</th><th>Review due</th><th>Training</th></tr></thead><tbody>
            {data.items.map((a: any) => <tr key={a.id} className="clickable" onClick={() => setOpen(a.id)}>
              <td>{a.employee_name} <span className="muted mono">{a.employee_code}</span></td><td><span className="mono">{a.method_code}</span> {a.method_name}</td>
              <td>{ACTIVITY[a.activity]}</td><td><StatusBadge status={a.status} /></td><td>{fmtDate(a.review_due)}</td>
              <td>{a.missing_training ? <span className="badge danger">{a.missing_training} lapsed</span> : <span className="badge ok">OK</span>}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {open && <AuthorizationDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function AuthorizationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: a, loading, error, reload } = useLoad(() => api.get(`/api/v1/competency/authorizations/${id}`), [id]);
  const [act, setAct] = useState<'suspend' | 'reinstate' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const mayAct = can('competency.authorize') && a && a.employee_id !== me!.user.employeeId;
  return (
    <Modal title="Technical authorization" onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><strong>{a.employee_name}</strong><StatusBadge status={a.status} /><span className="spacer" /><span className="muted">{ACTIVITY[a.activity]}</span></div>
          <div><span className="mono">{a.method_code}</span> {a.method_name}</div>
          {a.check && <div className={`alert ${a.check.authorized ? 'ok' : 'error'}`}>{a.check.authorized ? `In force today (review due ${fmtDate(a.check.reviewDue)}).` : `Not in force: ${a.check.reasons.join('; ')}.`}</div>}
          {a.assessment && <div className="card"><div className="muted" style={{ fontSize: 12 }}>Assessment · {APPROACH[a.assessment.approach]} · {fmtDate(a.assessment.assessed_on)} · by {a.assessment.assessor_name}</div><div>{a.assessment.evidence}</div></div>}
          <div className="stack" style={{ gap: 4 }}><strong>History</strong>
            {a.events.map((e: any, i: number) => <div key={i} style={{ fontSize: 13 }}><span className="muted">{fmtDateTime(e.at)}</span> · {e.action} · {e.actor_name ?? 'Scheduled review'}{e.reason ? ` — ${e.reason}` : ''}</div>)}</div>
          {mayAct && <div className="row"><span className="spacer" />
            {a.status === 'authorized' && <button className="btn" onClick={() => setAct('suspend')}>Suspend</button>}
            {a.status === 'suspended' && <button className="btn" onClick={() => setAct('reinstate')}>Reinstate</button>}
            {['authorized', 'suspended'].includes(a.status) && <button className="btn danger" onClick={() => setAct('withdraw')}>Withdraw</button>}</div>}
          {act && <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            try { await api.post(`/api/v1/competency/authorizations/${id}/${act}`, { reason }); toast('Saved; the employee has been notified'); setAct(null); setReason(''); reload(); }
            catch (x) { toast(errText(x), 'error'); }
          }}>
            <Field label={`Reason to ${act}`}><textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setAct(null)}>Cancel</button><button className="btn primary">Confirm</button></div>
          </form>}
        </div>
      )}
    </Modal>
  );
}

function EmployeeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const { data } = useLoad(() => api.get(`/api/v1/employees${qs({ search: search || undefined, pageSize: 20 })}`), [search]);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select required value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select employee…</option>
        {(data?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''} ({e.employee_code})</option>)}</select>
    </div>
  );
}

function Assessments() {
  const { can, me } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const methods = useLoad(() => api.get('/api/v1/competency/methods'), []);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/competency/assessments${qs({ page, pageSize: 25 })}`), [page]);
  const requestAuth = async (s: any) => {
    try { await api.post('/api/v1/competency/authorizations', { assessmentId: s.id }); toast('Sent to quality for authorization'); reload(); }
    catch (x) { toast(errText(x), 'error'); }
  };
  return (
    <div className="stack">
      {can('competency.assess') && <div className="row"><span className="spacer" /><button className="btn primary" onClick={() => setAdding(true)}>Record assessment</button></div>}
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? null : !data.items.length ? <Empty>No assessments recorded.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Employee</th><th>Method</th><th>Activity</th><th>Approach</th><th>Result</th><th>Assessor</th><th /></tr></thead><tbody>
            {data.items.map((s: any) => <tr key={s.id}><td>{fmtDate(s.assessed_on)}</td><td>{s.employee_name}</td><td className="mono">{s.method_code}</td><td>{ACTIVITY[s.activity]}</td>
              <td title={s.evidence}>{APPROACH[s.approach]}</td><td><span className={`badge ${s.result === 'competent' ? 'ok' : 'danger'}`}>{s.result.replace(/_/g, ' ')}</span></td><td>{s.assessor_name}</td>
              <td>{can('competency.assess') && s.result === 'competent' && !s.used && s.employee_id !== me!.user.employeeId &&
                <button className="btn sm" onClick={() => requestAuth(s)}>Request authorization</button>}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {adding && methods.data && <AssessmentForm methods={methods.data.items.filter((m: any) => m.status === 'active')} onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}

function AssessmentForm({ methods, onClose, onDone }: { methods: any[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ employeeId: '', methodId: methods[0]?.id ?? '', activity: 'perform', approach: 'replicate', assessedOn: todayLocal(), result: 'competent', evidence: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Record competency assessment" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try { await api.post('/api/v1/competency/assessments', f); toast('Assessment recorded'); onDone(); onClose(); } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Employee"><EmployeeSelect value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /></Field>
        <div className="form-grid">
          <Field label="Method"><select value={f.methodId} onChange={(e) => setF({ ...f, methodId: e.target.value })}>{methods.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></Field>
          <Field label="Activity"><select value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })}>{Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="How competence was assessed"><select value={f.approach} onChange={(e) => setF({ ...f, approach: e.target.value })}>{Object.entries(APPROACH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Date"><input type="date" required max={todayLocal()} value={f.assessedOn} onChange={(e) => setF({ ...f, assessedOn: e.target.value })} /></Field>
          <Field label="Result"><select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })}><option value="competent">Competent</option><option value="not_yet_competent">Not yet competent</option></select></Field>
        </div>
        <Field label="Evidence" hint="e.g. PT scheme and round with z-score, replicate RSD against the method limit, witnessed run reference"><textarea required minLength={3} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function TrainingRecords() {
  const { can } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [expiring, setExpiring] = useState(false);
  const [adding, setAdding] = useState(false);
  const courses = useLoad(() => api.get('/api/v1/competency/courses'), []);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/competency/training-records${qs({ page, pageSize: 25, expiringWithinDays: expiring ? 30 : undefined })}`), [page, expiring]);
  const revoke = async (t: any) => {
    const reason = window.prompt(`Revoke ${t.course_code} for ${t.employee_name}? Give a reason:`);
    if (!reason) return;
    try { await api.post(`/api/v1/competency/training-records/${t.id}/revoke`, { reason }); toast('Record revoked'); reload(); } catch (x) { toast(errText(x), 'error'); }
  };
  return (
    <div className="stack">
      <div className="row"><label className="row"><input type="checkbox" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); setPage(1); }} /> Expired or expiring within 30 days</label>
        <span className="spacer" />{can('training.manage') && <button className="btn primary" onClick={() => setAdding(true)}>Record training</button>}</div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? null : !data.items.length ? <Empty>No training records.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Course</th><th>Completed</th><th>Valid until</th><th>Status</th><th>Trainer</th><th /></tr></thead><tbody>
            {data.items.map((t: any) => <tr key={t.id}><td>{t.employee_name} <span className="muted mono">{t.employee_code}</span></td><td><span className="mono">{t.course_code}</span> {t.course_name}</td>
              <td>{fmtDate(t.completed_on)}</td><td>{t.expires_on ? fmtDate(t.expires_on) : '—'}</td><td><Validity v={t.validity} /></td><td>{t.trainer ?? t.provider ?? '—'}</td>
              <td>{can('training.manage') && t.status === 'active' && <button className="btn sm" onClick={() => revoke(t)}>Revoke</button>}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {adding && courses.data && <TrainingForm courses={courses.data.items.filter((c: any) => c.status === 'active')} onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}

function TrainingForm({ courses, onClose, onDone }: { courses: any[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ employeeId: '', courseId: courses[0]?.id ?? '', completedOn: todayLocal(), result: 'passed', trainer: '', provider: '', hours: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Record training" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api.post('/api/v1/competency/training-records', { ...f, hours: f.hours ? Number(f.hours) : null });
          toast(r.expiresOn ? `Recorded; valid until ${fmtDate(r.expiresOn)}` : 'Recorded'); onDone(); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Employee"><EmployeeSelect value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /></Field>
        <div className="form-grid">
          <Field label="Course"><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></Field>
          <Field label="Completed on"><input type="date" required max={todayLocal()} value={f.completedOn} onChange={(e) => setF({ ...f, completedOn: e.target.value })} /></Field>
          <Field label="Result"><select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })}><option value="passed">Passed</option><option value="completed">Completed (no test)</option><option value="failed">Failed</option></select></Field>
          <Field label="Hours"><input type="number" min={0.1} step={0.1} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
          <Field label="Trainer"><input value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
          <Field label="Provider (external)"><input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></Field>
        </div>
        <Field label="Notes" hint="Certificates can be uploaded to the employee's documents"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function Setup() {
  const { can, hasModule } = useAuth();
  const toast = useToast();
  const courses = useLoad(() => api.get('/api/v1/competency/courses'), []);
  const methods = useLoad(() => (hasModule('lab.competency') ? api.get('/api/v1/competency/methods') : Promise.resolve({ items: [] })), []);
  const [course, setCourse] = useState<any>(null);
  const [method, setMethod] = useState<any>(null);
  const save = async (url: string, id: string | undefined, body: unknown, done: () => void) => {
    try { if (id) await api.put(`${url}/${id}`, body); else await api.post(url, body); toast('Saved'); done(); } catch (x) { toast(errText(x), 'error'); }
  };
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Training courses</h3><span className="spacer" />
          {can('training.manage') && <button className="btn sm primary" onClick={() => setCourse({ code: '', name: '', kind: 'method', description: '', validityMonths: '', status: 'active' })}>New course</button>}</div>
        {courses.loading ? <Loading /> : !courses.data ? <LoadFailed error={courses.error} onRetry={courses.reload} /> : !courses.data.items.length ? <div className="muted">No courses yet (e.g. lab induction, chemical safety, instrument operation per method).</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Validity</th><th>Records</th><th>Status</th><th /></tr></thead><tbody>
            {courses.data.items.map((c: any) => <tr key={c.id}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.kind}</td><td>{c.validity_months ? `${c.validity_months} months` : 'No expiry'}</td><td>{c.records}</td><td>{c.status}</td>
              <td>{can('training.manage') && <button className="btn sm" onClick={() => setCourse({ id: c.id, code: c.code, name: c.name, kind: c.kind, description: c.description ?? '', validityMonths: c.validity_months ?? '', status: c.status })}>Edit</button>}</td></tr>)}
          </tbody></table></div>)}
      </div>
      {hasModule('lab.competency') && <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Laboratory methods</h3><span className="spacer" />
          {can('competency.manage') && <button className="btn sm primary" onClick={() => setMethod({ code: '', name: '', standardRef: '', discipline: '', matrix: '', reviewMonths: 12, status: 'active', requiredCourseIds: [] })}>New method</button>}</div>
        {methods.loading ? <Loading /> : !methods.data ? <LoadFailed error={methods.error} onRetry={methods.reload} /> : !methods.data.items.length ? <div className="muted">No methods yet. Add the test methods in your scope with the training each one requires.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Code</th><th>Method</th><th>Standard</th><th>Discipline / matrix</th><th>Required training</th><th>Review</th><th /></tr></thead><tbody>
            {methods.data.items.map((m: any) => <tr key={m.id}><td className="mono">{m.code}</td><td>{m.name}{m.status !== 'active' && <span className="badge" style={{ marginLeft: 6 }}>inactive</span>}</td><td>{m.standard_ref ?? '—'}</td>
              <td>{[m.discipline, m.matrix].filter(Boolean).join(' · ') || '—'}</td><td>{m.requirements.map((r: any) => r.code).join(', ') || '—'}</td><td>{m.review_months} mo</td>
              <td>{can('competency.manage') && <button className="btn sm" onClick={() => setMethod({ id: m.id, code: m.code, name: m.name, standardRef: m.standard_ref ?? '', discipline: m.discipline ?? '', matrix: m.matrix ?? '',
                reviewMonths: m.review_months, status: m.status, requiredCourseIds: m.requirements.map((r: any) => r.id) })}>Edit</button>}</td></tr>)}
          </tbody></table></div>)}
      </div>}
      {course && <Modal title={course.id ? `Edit ${course.code}` : 'New training course'} onClose={() => setCourse(null)}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); const { id, ...b } = course;
          save('/api/v1/competency/courses', id, { ...b, validityMonths: b.validityMonths === '' ? null : Number(b.validityMonths) }, () => { setCourse(null); courses.reload(); }); }}>
          <div className="form-grid">
            <Field label="Code"><input required value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input required value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} /></Field>
            <Field label="Type"><select value={course.kind} onChange={(e) => setCourse({ ...course, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Valid for (months)" hint="Blank = does not expire"><input type="number" min={1} max={120} value={course.validityMonths} onChange={(e) => setCourse({ ...course, validityMonths: e.target.value })} /></Field>
            <Field label="Status"><select value={course.status} onChange={(e) => setCourse({ ...course, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
          <Field label="Description"><input value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setCourse(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
      {method && <Modal title={method.id ? `Edit ${method.code}` : 'New laboratory method'} onClose={() => setMethod(null)}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); const { id, ...b } = method; save('/api/v1/competency/methods', id, b, () => { setMethod(null); methods.reload(); }); }}>
          <div className="form-grid">
            <Field label="Code"><input required value={method.code} onChange={(e) => setMethod({ ...method, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input required value={method.name} onChange={(e) => setMethod({ ...method, name: e.target.value })} /></Field>
            <Field label="Standard reference" hint="As cited in your scope"><input value={method.standardRef} onChange={(e) => setMethod({ ...method, standardRef: e.target.value })} /></Field>
            <Field label="Discipline"><input value={method.discipline} onChange={(e) => setMethod({ ...method, discipline: e.target.value })} /></Field>
            <Field label="Matrix / product"><input value={method.matrix} onChange={(e) => setMethod({ ...method, matrix: e.target.value })} /></Field>
            <Field label="Review authorizations every (months)"><input type="number" min={1} max={60} required value={method.reviewMonths} onChange={(e) => setMethod({ ...method, reviewMonths: Number(e.target.value) })} /></Field>
            <Field label="Status"><select value={method.status} onChange={(e) => setMethod({ ...method, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
          <Field label="Required training" hint="Authorization is possible only while all of these are valid">
            <div className="stack" style={{ gap: 2 }}>{(courses.data?.items ?? []).filter((c: any) => c.status === 'active' || method.requiredCourseIds.includes(c.id)).map((c: any) =>
              <label key={c.id} className="row"><input type="checkbox" checked={method.requiredCourseIds.includes(c.id)} onChange={(e) => setMethod({ ...method,
                requiredCourseIds: e.target.checked ? [...method.requiredCourseIds, c.id] : method.requiredCourseIds.filter((x: string) => x !== c.id) })} /> <span className="mono">{c.code}</span> {c.name}</label>)}</div></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setMethod(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}
