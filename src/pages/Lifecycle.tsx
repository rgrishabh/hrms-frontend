import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, todayLocal, addDays } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';
import { EmployeePicker } from '../features/employees/EmployeePicker';

type Tab = 'tasks' | 'onboarding' | 'probation' | 'separations' | 'templates';
const OWNER: Record<string, string> = { hr: 'HR', it: 'IT', admin: 'Admin', finance: 'Finance', manager: 'Manager', employee: 'New joiner / leaver' };
const SEP_KIND: Record<string, string> = { resignation: 'Resignation', termination: 'Termination', retirement: 'Retirement', contract_end: 'Contract end', death: 'Death', absconding: 'Absconding', mutual: 'Mutual separation' };
const REC: Record<string, string> = { confirm: 'Confirm', extend: 'Extend', terminate: 'Terminate' };

export function Lifecycle() {
  const { can, canAny, hasModule, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const hr = canAny('lifecycle.manage', 'lifecycle.read');
  const tabs: { key: Tab; label: string }[] = [{ key: 'tasks', label: 'My tasks' }];
  if (hasModule('core.onboarding') && hr) tabs.push({ key: 'onboarding', label: 'Onboarding' });
  if (hasModule('core.onboarding')) tabs.push({ key: 'probation', label: 'Probation' });
  if (hasModule('core.offboarding') && (hr || me!.user.employeeId)) tabs.push({ key: 'separations', label: 'Separations' });
  if (can('lifecycle.manage')) tabs.push({ key: 'templates', label: 'Checklist templates' });
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? 'tasks') as Tab;
  return (
    <div className="stack">
      <div><h1>Onboarding &amp; exit</h1><p className="sub">Joining checklists, probation reviews, resignations and exit clearance.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'tasks' && <MyTasks />}
      {tab === 'onboarding' && <Onboarding />}
      {tab === 'probation' && <Probation />}
      {tab === 'separations' && <Separations />}
      {tab === 'templates' && <Templates />}
    </div>
  );
}

function MyTasks() {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/lifecycle/tasks/mine'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      {!data.items.length ? <Empty>No open tasks for you.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Task</th><th>For</th><th>Checklist</th><th>Due</th><th /></tr></thead><tbody>
          {data.items.map((t: any) => <tr key={t.id}><td>{t.title}{t.description && <div className="muted" style={{ fontSize: 12 }}>{t.description}</div>}</td>
            <td><button className="btn sm" onClick={() => setOpen(t.checklist_id)}>{t.employee_name}</button></td><td>{t.kind === 'onboarding' ? 'Onboarding' : 'Exit clearance'} · {OWNER[t.owner]}</td>
            <td><span className={`badge ${t.due_date < data.date ? 'danger' : t.due_date === data.date ? 'warn' : ''}`}>{fmtDate(t.due_date)}</span></td>
            <td><button className="btn sm primary" onClick={async () => { try { await api.post(`/api/v1/lifecycle/tasks/${t.id}/done`, {}); toast('Done'); reload(); } catch (x) { toast(errText(x), 'error'); } }}>Mark done</button></td></tr>)}
        </tbody></table></div>)}
      {open && <ChecklistDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function ChecklistDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, loading, error, reload } = useLoad(() => api.get(`/api/v1/lifecycle/checklists/${id}`), [id]);
  const [skip, setSkip] = useState<any>(null);
  const run = async (url: string, body: unknown, msg: string) => { try { await api.post(url, body); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  return (
    <Modal title={c ? `${c.kind === 'onboarding' ? 'Onboarding' : 'Exit clearance'} — ${c.employee.name}` : 'Checklist'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={c.status} /><span className="muted">{c.kind === 'onboarding' ? 'Joining' : 'Last working day'} {fmtDate(c.anchor_date)}</span><span className="spacer" />
            {c.kind === 'onboarding' && c.employee.status === 'pre_joining' && can('lifecycle.manage') &&
              <button className="btn sm primary" onClick={() => run(`/api/v1/lifecycle/employees/${c.employee.id}/joined`, undefined, 'Joining confirmed; employee is active')}>Confirm joining</button>}</div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th /></tr></thead><tbody>
            {c.tasks.map((t: any) => <tr key={t.id}><td>{t.title}{t.note && <div className="muted" style={{ fontSize: 12 }}>{t.note}</div>}</td><td>{OWNER[t.owner]}</td><td>{fmtDate(t.due_date)}</td>
              <td><StatusBadge status={t.status} />{t.done_by_name && <div className="muted" style={{ fontSize: 11 }}>{t.done_by_name} · {fmtDateTime(t.done_at)}</div>}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                {t.status === 'pending' && t.canAct && c.status === 'open' && <button className="btn sm primary" onClick={() => run(`/api/v1/lifecycle/tasks/${t.id}/done`, {}, 'Done')}>Done</button>}
                {t.status === 'pending' && can('lifecycle.manage') && c.status === 'open' && <button className="btn sm" onClick={() => setSkip(t)}>Skip</button>}
                {t.status !== 'pending' && can('lifecycle.manage') && <button className="btn sm" onClick={() => run(`/api/v1/lifecycle/tasks/${t.id}/reopen`, {}, 'Reopened')}>Reopen</button>}
              </div></td></tr>)}
          </tbody></table></div>
        </div>
      )}
      {skip && <Confirm title="Skip task" requireComment confirmLabel="Skip" message={`Why is "${skip.title}" not needed?`} onClose={() => setSkip(null)}
        onConfirm={async (note) => run(`/api/v1/lifecycle/tasks/${skip.id}/skip`, { note }, 'Skipped')} />}
    </Modal>
  );
}

function Onboarding() {
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [emp, setEmp] = useState('');
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/lifecycle/checklists${qs({ kind: 'onboarding', status: status || undefined, page, pageSize: 25 })}`), [status, page]);
  return (
    <div className="stack">
      <div className="row"><Field label="Status"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="open">Open</option><option value="completed">Completed</option><option value="">All</option></select></Field>
        <span className="spacer" />{can('lifecycle.manage') && <button className="btn primary" onClick={() => setStarting(true)}>Start onboarding</button>}</div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No onboarding checklists. New hires from Recruitment get one automatically once a default template exists.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Joining</th><th>Progress</th><th>Overdue</th><th>Status</th></tr></thead><tbody>
            {data.items.map((c: any) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}><td>{c.employee_name} <span className="muted mono">{c.employee_code}</span></td>
              <td>{fmtDate(c.anchor_date)}</td><td>{c.done}/{c.tasks}</td><td>{c.overdue ? <span className="badge danger">{c.overdue}</span> : '—'}</td><td><StatusBadge status={c.status} /></td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {starting && <Modal title="Start onboarding" onClose={() => setStarting(false)}>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { const r = await api.post('/api/v1/lifecycle/checklists', { employeeId: emp }); toast('Onboarding started; owners notified'); setStarting(false); reload(); setOpen(r.id); } catch (x) { toast(errText(x), 'error'); } }}>
          <Field label="Employee"><EmployeePicker value={emp} onChange={setEmp} /></Field>
          <div className="muted" style={{ fontSize: 12 }}>Uses the default onboarding template; due dates count from the employee's joining date.</div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setStarting(false)}>Cancel</button><button className="btn primary">Start</button></div>
        </form></Modal>}
      {open && <ChecklistDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function Probation() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [review, setReview] = useState<any>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/lifecycle/probation${qs({ status: status || undefined })}`), [status]);
  const [f, setF] = useState({ recommendation: 'confirm', extendMonths: 3, comments: '' });
  return (
    <div className="stack">
      <div className="row"><Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">Waiting for recommendation</option><option value="pending">Waiting for HR</option><option value="approved">Decided</option><option value="">All</option></select></Field></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No probation reviews.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Joined</th><th>Probation ends</th><th>Recommendation</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((r: any) => <tr key={r.id}><td>{r.employee_name} <span className="muted mono">{r.employee_code}</span><div className="muted" style={{ fontSize: 12 }}>{r.designation ?? ''}</div></td>
            <td>{fmtDate(r.date_of_joining)}</td><td>{fmtDate(r.probation_end)}</td>
            <td>{r.recommendation ? `${REC[r.recommendation]}${r.extend_months ? ` (${r.extend_months} mo)` : ''}` : '—'}{r.comments && <div className="muted" style={{ fontSize: 12 }}>{r.comments}</div>}</td>
            <td><StatusBadge status={r.status} /></td>
            <td>{r.status === 'open' && <button className="btn sm primary" onClick={() => { setReview(r); setF({ recommendation: 'confirm', extendMonths: 3, comments: '' }); }}>Recommend</button>}</td></tr>)}
        </tbody></table></div>)}
      {review && <Modal title={`Probation — ${review.employee_name}`} onClose={() => setReview(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.post(`/api/v1/lifecycle/probation/${review.id}/submit`, { ...f, extendMonths: f.recommendation === 'extend' ? Number(f.extendMonths) : null }); toast('Sent to HR for approval'); setReview(null); reload(); }
          catch (x) { toast(errText(x), 'error'); }
        }}>
          <Field label="Recommendation"><select value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })}>{Object.entries(REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {f.recommendation === 'extend' && <Field label="Extend by (months)"><input type="number" min={1} max={6} value={f.extendMonths} onChange={(e) => setF({ ...f, extendMonths: Number(e.target.value) })} /></Field>}
          <Field label="Comments" hint="Evidence: performance against SOPs, authorizations obtained, conduct"><textarea required minLength={10} rows={5} value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} /></Field>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setReview(null)}>Cancel</button><button className="btn primary">Submit</button></div>
        </form></Modal>}
    </div>
  );
}

function Separations() {
  const { can, canAny, me } = useAuth();
  const toast = useToast();
  const hr = canAny('lifecycle.manage', 'lifecycle.read');
  const [scope, setScope] = useState(hr ? 'all' : 'mine');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<'resign' | 'hr' | null>(null);
  const [f, setF] = useState({ employeeId: '', kind: 'termination', reason: '', noticeDate: todayLocal(), requestedLwd: addDays(todayLocal(), 30) });
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/lifecycle/separations${qs({ scope, page, pageSize: 25 })}`), [scope, page]);
  return (
    <div className="stack">
      <div className="row">
        <Field label="Show"><select value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }}>{hr && <option value="all">All</option>}<option value="mine">Mine</option><option value="team">My team</option></select></Field>
        <span className="spacer" />
        {me!.user.employeeId && can('lifecycle.self') && <button className="btn" onClick={() => setForm('resign')}>Resign</button>}
        {can('lifecycle.manage') && <button className="btn primary" onClick={() => setForm('hr')}>Start separation</button>}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No separations.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Kind</th><th>Notice</th><th>Last working day</th><th>Shortfall</th><th>F&amp;F</th><th>Status</th></tr></thead><tbody>
            {data.items.map((s: any) => <tr key={s.id} className="clickable" onClick={() => setOpen(s.id)}><td>{s.employee_name} <span className="muted mono">{s.employee_code}</span></td><td>{SEP_KIND[s.kind]}</td>
              <td>{fmtDate(s.notice_date)}</td><td>{fmtDate(s.approved_lwd ?? s.requested_lwd)}</td><td>{s.shortfall_days ? `${s.shortfall_days} d${s.waive_shortfall ? ' (waived)' : ''}` : '—'}</td>
              <td>{s.fnf_status.replace('_', ' ')}</td><td><StatusBadge status={s.status} /></td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {form && <Modal title={form === 'resign' ? 'Resign' : 'Start separation'} onClose={() => setForm(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = form === 'resign' ? await api.post('/api/v1/lifecycle/separations/resign', { reason: f.reason, requestedLwd: f.requestedLwd }) : await api.post('/api/v1/lifecycle/separations', f);
            toast(r.shortfallDays ? `Submitted. Notice short by ${r.shortfallDays} day(s) of the ${r.noticeDaysRequired} required.` : 'Submitted for approval'); setForm(null); reload(); setOpen(r.id);
          } catch (x) { toast(errText(x), 'error'); }
        }}>
          {form === 'hr' && <>
            <Field label="Employee"><EmployeePicker value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /></Field>
            <div className="form-grid">
              <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(SEP_KIND).filter(([k]) => k !== 'resignation').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Notice date"><input type="date" required value={f.noticeDate} onChange={(e) => setF({ ...f, noticeDate: e.target.value })} /></Field>
            </div></>}
          <Field label="Proposed last working day"><input type="date" required min={form === 'resign' ? todayLocal() : f.noticeDate} value={f.requestedLwd} onChange={(e) => setF({ ...f, requestedLwd: e.target.value })} /></Field>
          <Field label="Reason"><textarea required minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <div className="muted" style={{ fontSize: 12 }}>{form === 'resign' ? 'Your reporting manager and then HR approve. You can withdraw while it is pending.' : 'A second HR approver must approve HR-initiated separations.'}</div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary">Submit</button></div>
        </form></Modal>}
      {open && <SeparationDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function SeparationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: s, loading, error, reload } = useLoad(() => api.get(`/api/v1/lifecycle/separations/${id}`), [id]);
  const [lwd, setLwd] = useState<string | null>(null);
  const [waive, setWaive] = useState(false);
  const [exit, setExit] = useState<Record<string, string> | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | 'complete' | null>(null);
  const [rehire, setRehire] = useState(true);
  const [checklistOpen, setChecklistOpen] = useState<string | null>(null);
  const run = async (method: 'post' | 'put', url: string, body: unknown, msg: string) => { try { await (method === 'post' ? api.post(url, body) : api.put(url, body)); toast(msg); reload(); } catch (x) { toast(errText(x), 'error'); } };
  const mine = s && s.employee.id === me!.user.employeeId;
  return (
    <Modal title={s ? `${SEP_KIND[s.kind]} — ${s.employee.name}` : 'Separation'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={s.status} /><span className="muted">Notice {fmtDate(s.notice_date)} · last day {fmtDate(s.approved_lwd ?? s.requested_lwd)}</span>
            {s.shortfall_days > 0 && <span className="badge warn">Notice short by {s.shortfall_days} d{s.waive_shortfall ? ' (waived)' : ''}</span>}</div>
          <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{s.reason}</div>
          <div className="muted" style={{ fontSize: 12 }}>Initiated by {s.initiated_by_name} · {s.notice_days_required} days notice required · F&amp;F {s.fnf_status.replace('_', ' ')}{s.fnf_note ? ` — ${s.fnf_note}` : ''}</div>
          <div className="row">
            {s.status === 'pending' && <button className="btn sm" onClick={() => run('post', `/api/v1/lifecycle/separations/${id}/withdraw`, undefined, 'Withdrawn')}>Withdraw request</button>}
            {s.status === 'pending' && can('lifecycle.manage') && <button className="btn sm" onClick={() => { setLwd(s.approved_lwd ?? s.requested_lwd); setWaive(s.waive_shortfall); }}>Set last working day</button>}
            {['approved', 'completed'].includes(s.status) && (mine || can('lifecycle.manage')) && <button className="btn sm" onClick={() => setExit({ reasonForLeaving: '', whatWentWell: '', whatToImprove: '', wouldRecommend: '' })}>Exit interview</button>}
            {s.status === 'approved' && can('lifecycle.manage') && <><button className="btn sm danger" onClick={() => setConfirm('cancel')}>Cancel separation</button>
              <button className="btn sm primary" onClick={() => setConfirm('complete')}>Complete exit</button></>}
            {can('lifecycle.manage') && ['approved', 'completed'].includes(s.status) && <select value={s.fnf_status} onChange={(e) => run('post', `/api/v1/lifecycle/separations/${id}/fnf`, { status: e.target.value, note: s.fnf_note }, 'F&F status saved')}>
              <option value="not_started">F&amp;F not started</option><option value="in_progress">F&amp;F in progress</option><option value="settled">F&amp;F settled</option></select>}
          </div>
          {s.checklist && <div className="card stack" style={{ gap: 4 }}><div className="row"><strong>Exit clearance</strong><StatusBadge status={s.checklist.status} /><span className="spacer" />
            <button className="btn sm" onClick={() => setChecklistOpen(s.checklist.id)}>Open checklist</button></div>
            <div className="muted" style={{ fontSize: 12 }}>{s.checklist.tasks.filter((t: any) => t.status !== 'pending').length}/{s.checklist.tasks.length} cleared</div></div>}
          {s.leaveBalances?.length > 0 && <div style={{ fontSize: 13 }}><strong>Leave balance at exit:</strong> {s.leaveBalances.map((l: any) => `${l.code} ${l.balance}`).join(' · ')}</div>}
          {s.exit_interview && <div className="card stack" style={{ gap: 4 }}><strong>Exit interview</strong>{Object.entries(s.exit_interview).filter(([k]) => !k.startsWith('_')).map(([k, v]) =>
            <div key={k} style={{ fontSize: 13 }}><span className="muted">{k}:</span> {String(v)}</div>)}</div>}
        </div>
      )}
      {lwd !== null && <Modal title="Last working day" onClose={() => setLwd(null)}>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); await run('put', `/api/v1/lifecycle/separations/${id}/lwd`, { approvedLwd: lwd, waiveShortfall: waive }, 'Saved'); setLwd(null); }}>
          <Field label="Approved last working day"><input type="date" required value={lwd} onChange={(e) => setLwd(e.target.value)} /></Field>
          <label className="row"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive any notice shortfall</label>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setLwd(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
      {exit && <Modal title="Exit interview" onClose={() => setExit(null)}>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); const answers = Object.fromEntries(Object.entries(exit).filter(([, v]) => v.trim()));
          await run('post', `/api/v1/lifecycle/separations/${id}/exit-interview`, { answers }, 'Exit interview recorded'); setExit(null); }}>
          {([['reasonForLeaving', 'Main reason for leaving'], ['whatWentWell', 'What worked well'], ['whatToImprove', 'What should we improve'], ['wouldRecommend', 'Would you recommend us as an employer? Why?']] as const).map(([k, label]) =>
            <Field key={k} label={label}><textarea value={exit[k]} onChange={(e) => setExit({ ...exit, [k]: e.target.value })} /></Field>)}
          <div className="muted" style={{ fontSize: 12 }}>Visible to HR only.</div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setExit(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
      {confirm === 'cancel' && <Confirm title="Cancel separation" danger requireComment confirmLabel="Cancel separation" message="The employee returns to active and the exit clearance is cancelled."
        onClose={() => setConfirm(null)} onConfirm={async (reason) => run('post', `/api/v1/lifecycle/separations/${id}/cancel`, { reason }, 'Separation cancelled')} />}
      {confirm === 'complete' && <Modal title="Complete exit" onClose={() => setConfirm(null)}>
        <div className="stack"><p className="muted" style={{ margin: 0 }}>Marks the employee as exited and disables their login. Requires the last working day to have passed and every clearance task to be done.</p>
          <label className="row"><input type="checkbox" checked={rehire} onChange={(e) => setRehire(e.target.checked)} /> Eligible for rehire</label>
          <div className="row"><span className="spacer" /><button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => { await run('post', `/api/v1/lifecycle/separations/${id}/complete`, { rehireEligible: rehire }, 'Exit completed'); setConfirm(null); }}>Complete</button></div></div></Modal>}
      {checklistOpen && <ChecklistDetail id={checklistOpen} onClose={() => { setChecklistOpen(null); reload(); }} />}
    </Modal>
  );
}

function Templates() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get('/api/v1/lifecycle/templates'), []);
  const [edit, setEdit] = useState<any>(null);
  const blank = (kind: string) => ({ kind, name: '', isDefault: true, status: 'active', tasks: [{ title: '', description: '', owner: 'hr', offsetDays: 0 }] });
  return (
    <div className="stack">
      <div className="row"><span className="spacer" /><button className="btn" onClick={() => setEdit(blank('onboarding'))}>New onboarding template</button><button className="btn" onClick={() => setEdit(blank('offboarding'))}>New exit template</button></div>
      {loading ? <Loading /> : !data.items.length ? <Empty>No templates yet. Create one onboarding and one exit template and mark them default.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Kind</th><th>Name</th><th>Tasks</th><th>Default</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((t: any) => <tr key={t.id}><td>{t.kind === 'onboarding' ? 'Onboarding' : 'Exit'}</td><td>{t.name}</td><td>{t.tasks.length}</td><td>{t.is_default ? '✓' : ''}</td><td>{t.status}</td>
            <td><button className="btn sm" onClick={() => setEdit({ id: t.id, kind: t.kind, name: t.name, isDefault: t.is_default, status: t.status, tasks: t.tasks.map((k: any) => ({ ...k, description: k.description ?? '' })) })}>Edit</button></td></tr>)}
        </tbody></table></div>)}
      {edit && <Modal title={edit.id ? `Edit ${edit.name}` : `New ${edit.kind === 'onboarding' ? 'onboarding' : 'exit'} template`} onClose={() => setEdit(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const { id, ...b } = edit;
          const body = { ...b, tasks: b.tasks.map((t: any) => ({ ...t, description: t.description || null, offsetDays: Number(t.offsetDays) })) };
          try { if (id) await api.put(`/api/v1/lifecycle/templates/${id}`, body); else await api.post('/api/v1/lifecycle/templates', body); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          <div className="form-grid"><Field label="Name"><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div>
          <label className="row"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} /> Default template (used automatically)</label>
          <strong>Tasks</strong>
          <div className="muted" style={{ fontSize: 12 }}>Days are counted from the {edit.kind === 'onboarding' ? 'joining date' : 'last working day'}; negative = before.</div>
          {edit.tasks.map((t: any, i: number) => <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <input required placeholder="Task" value={t.title} style={{ flex: 2 }} onChange={(e) => { const tasks = [...edit.tasks]; tasks[i] = { ...t, title: e.target.value }; setEdit({ ...edit, tasks }); }} />
            <select value={t.owner} onChange={(e) => { const tasks = [...edit.tasks]; tasks[i] = { ...t, owner: e.target.value }; setEdit({ ...edit, tasks }); }}>{Object.entries(OWNER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input type="number" min={-90} max={180} value={t.offsetDays} style={{ width: 80 }} title="Days from anchor" onChange={(e) => { const tasks = [...edit.tasks]; tasks[i] = { ...t, offsetDays: e.target.value }; setEdit({ ...edit, tasks }); }} />
            <button type="button" className="btn sm" disabled={edit.tasks.length === 1} onClick={() => setEdit({ ...edit, tasks: edit.tasks.filter((_: any, j: number) => j !== i) })}>×</button></div>)}
          <div><button type="button" className="btn sm" onClick={() => setEdit({ ...edit, tasks: [...edit.tasks, { title: '', description: '', owner: 'hr', offsetDays: 0 }] })}>+ Add task</button></div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}
