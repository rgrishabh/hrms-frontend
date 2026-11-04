import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, StatusBadge, Confirm, useToast, errText } from '../ui';

export const RATING: Record<number, string> = { 1: 'Unsatisfactory', 2: 'Needs improvement', 3: 'Meets expectations', 4: 'Exceeds expectations', 5: 'Outstanding' };
const REVIEW_STATUS: Record<string, string> = { not_started: 'Not started', self_submitted: 'Self-review done', manager_submitted: 'Manager review done', finalized: 'Finalized', acknowledged: 'Acknowledged' };
const rating = (n: number | null | undefined) => (n ? `${n} · ${RATING[n]}` : '—');
type Tab = 'mine' | 'team' | 'all' | 'cycles';

export function Performance() {
  const { can, me } = useAuth();
  const manage = can('performance.manage');
  const [params, setParams] = useSearchParams();
  const cycles = useLoad(() => api.get('/api/v1/performance/cycles'), []);
  const visible = (cycles.data?.items ?? []).filter((c: any) => c.status !== 'draft');
  const [cycleId, setCycleId] = useState('');
  useEffect(() => { if (!cycleId && visible.length) setCycleId((visible.find((c: any) => c.status === 'active') ?? visible[0]).id); }, [visible, cycleId]);
  const team = useLoad(() => (cycleId ? api.get(`/api/v1/performance/reviews${qs({ cycleId, scope: 'team' })}`) : Promise.resolve({ items: [] })), [cycleId]);

  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('performance.self')) tabs.push({ key: 'mine', label: 'My review' });
  if ((team.data?.items.length ?? 0) > 0) tabs.push({ key: 'team', label: `My team (${team.data!.items.length})` });
  if (manage) tabs.push({ key: 'all', label: 'All reviews' }, { key: 'cycles', label: 'Review cycles' });
  const tab = (params.get('tab') as Tab) && tabs.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : tabs[0]?.key;
  const setTab = (t: Tab) => setParams({ tab: t });

  if (cycles.loading) return <Loading />;
  if (cycles.error) return <ErrorBox error={cycles.error} />;
  if (!tabs.length) return <Empty>You do not have access to performance reviews.</Empty>;
  const cycle = visible.find((c: any) => c.id === cycleId);
  return (
    <div className="stack">
      <div className="row">
        <div><h1>Performance</h1><p className="sub">Goals agreed with your manager, self-review, manager review and the final rating.</p></div>
        <span className="spacer" />
        {visible.length > 0 && tab !== 'cycles' && <Field label="Review cycle"><select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          {visible.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}</select></Field>}
      </div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab!} onChange={setTab} />}
      {tab === 'cycles' ? <Cycles data={cycles.data.items} reload={cycles.reload} />
        : !cycle ? <Empty>No review cycle is open yet.{manage ? ' Create one under Review cycles.' : ''}</Empty>
        : tab === 'mine' ? <MyReview cycle={cycle} />
        : tab === 'team' ? <ReviewList cycle={cycle} scope="team" onChanged={team.reload} />
        : <ReviewList cycle={cycle} scope="all" />}
    </div>
  );
}

// ---------------------------------------------------------------- employee
function MyReview({ cycle }: { cycle: any }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/performance/reviews${qs({ cycleId: cycle.id, scope: 'mine' })}`), [cycle.id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const r = data.items[0];
  if (!r) return <Empty>You are not part of {cycle.name}. Reviews are created for staff who joined before the period ended.</Empty>;
  return <ReviewDetail id={r.id} selfReview={cycle.self_review} onChanged={reload} />;
}

// ---------------------------------------------------------------- lists (manager / HR)
function ReviewList({ cycle, scope, onChanged }: { cycle: any; scope: 'team' | 'all'; onChanged?: () => void }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/performance/reviews${qs({ cycleId: cycle.id, scope })}`), [cycle.id, scope]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const items = data.items.filter((r: any) => (!status || r.status === status) && (!search || `${r.employee_name} ${r.employee_code}`.toLowerCase().includes(search.toLowerCase())));
  const counts = data.items.reduce((m: Record<string, number>, r: any) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(REVIEW_STATUS).map(([k, label]) => <span key={k} className="badge">{label}: {counts[k] ?? 0}</span>)}
      </div>
      <div className="row">
        <Field label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" /></Field>
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>
          {Object.entries(REVIEW_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      {!items.length ? <Empty>No reviews match.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Employee</th><th>Designation</th>{scope === 'all' && <th>Reviewer</th>}<th>Status</th><th>Self</th><th>Manager</th><th>Final</th></tr></thead><tbody>
          {items.map((r: any) => <tr key={r.id} className="clickable" onClick={() => setOpen(r.id)}>
            <td>{r.employee_name}<div className="muted" style={{ fontSize: 12 }}>{r.employee_code}</div></td><td>{r.designation ?? '—'}</td>
            {scope === 'all' && <td>{r.reviewer_name ?? <span className="badge warn">No manager</span>}</td>}
            <td><StatusBadge status={r.status} /></td><td>{r.self_rating ?? '—'}</td><td>{r.manager_rating ?? '—'}</td><td>{r.final_rating ?? '—'}</td></tr>)}
        </tbody></table></div>)}
      {open && <Modal title="Performance review" onClose={() => setOpen(null)}><ReviewDetail id={open} selfReview={cycle.self_review} onChanged={() => { reload(); onChanged?.(); }} /></Modal>}
    </div>
  );
}

// ---------------------------------------------------------------- one review (all roles)
function ReviewDetail({ id, selfReview, onChanged }: { id: string; selfReview: boolean; onChanged?: () => void }) {
  const { data: r, loading, error, reload } = useLoad(() => api.get(`/api/v1/performance/reviews/${id}`), [id]);
  const done = () => { reload(); onChanged?.(); };
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const final = ['finalized', 'acknowledged'].includes(r.status);
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>{r.employee_name}</h2><div className="muted">{r.cycle_name} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}</div></div>
        <span className="spacer" /><StatusBadge status={r.status} />
      </div>
      <Goals cycleId={r.cycle_id} employeeId={r.employee_id} role={r.role} editable={!final} goalRatings={r.goal_ratings ?? {}} />
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Section title="Self-review" rating={r.self_rating} comments={r.self_comments} empty={selfReview ? 'Not submitted yet' : 'No self-review in this cycle'} />
        <Section title="Manager review" rating={r.manager_rating} comments={r.manager_comments} empty={r.role === 'employee' && !final ? 'Shown once the review is finalized' : 'Not submitted yet'} />
        <Section title="Final rating" rating={r.final_rating} comments={r.final_comments} empty={r.role === 'employee' && !final ? 'Shown once finalized' : 'Not finalized'} />
      </div>
      {r.status === 'acknowledged' && <div className="alert">Acknowledged by the employee{r.employee_ack_note ? `: “${r.employee_ack_note}”` : ''}.</div>}
      <StepForm r={r} selfReview={selfReview} onDone={done} />
    </div>
  );
}

function Section({ title, rating: n, comments, empty }: { title: string; rating: number | null; comments: string | null; empty: string }) {
  return (
    <div className="card"><h3 style={{ marginTop: 0 }}>{title}</h3>
      {n ? <><div><strong>{rating(n)}</strong></div>{comments && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{comments}</p>}</> : <p className="muted" style={{ margin: 0 }}>{empty}</p>}
    </div>
  );
}

function StepForm({ r, selfReview, onDone }: { r: any; selfReview: boolean; onDone: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [n, setN] = useState(0);
  const [comments, setComments] = useState('');
  const [goalRatings, setGoalRatings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const step: 'self' | 'manager' | 'finalize' | 'acknowledge' | null =
    r.role === 'employee' && r.status === 'not_started' && selfReview ? 'self'
    : r.role === 'employee' && r.status === 'finalized' ? 'acknowledge'
    : (r.role === 'manager' || (r.role === 'hr' && !r.reviewer_id)) && (r.status === 'self_submitted' || (!selfReview && r.status === 'not_started')) ? 'manager'
    : r.role !== 'employee' && can('performance.manage') && r.status === 'manager_submitted' ? 'finalize' : null;
  if (!step) return r.role !== 'employee' && r.status === 'not_started' ? <div className="alert">Waiting for {r.employee_name}'s self-review.</div> : null;
  const needsRating = step !== 'acknowledge';
  const minComments = step === 'self' || step === 'manager' ? 20 : 0;
  const TITLE = { self: 'Your self-review', manager: 'Manager review', finalize: 'Finalize the rating (HR)', acknowledge: 'Acknowledge your review' }[step];
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post(`/api/v1/performance/reviews/${r.id}/${step}`, { ...(needsRating ? { rating: n } : {}), comments: comments.trim() || undefined, ...(step === 'manager' ? { goalRatings } : {}), expectedVersion: r.version });
      toast(step === 'acknowledge' ? 'Acknowledged' : 'Submitted'); onDone();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>{TITLE}</h3>
      {step === 'finalize' && <p className="muted" style={{ margin: 0 }}>Manager's rating: {rating(r.manager_rating)}. Change it only after calibration, and say why.</p>}
      {step === 'manager' && r.goals.length > 0 && <div className="stack" style={{ gap: 6 }}>
        <div className="muted">Rate each agreed goal (optional)</div>
        {r.goals.map((g: any) => <div key={g.id} className="row"><span style={{ flex: 1 }}>{g.title} <span className="muted">({g.weight}%)</span></span>
          <select value={goalRatings[g.id] ?? ''} onChange={(e) => setGoalRatings({ ...goalRatings, [g.id]: Number(e.target.value) })}><option value="">—</option>
            {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x} · {RATING[x]}</option>)}</select></div>)}
      </div>}
      {needsRating && <Field label={step === 'finalize' ? 'Final rating' : 'Overall rating'}><select value={n || ''} onChange={(e) => setN(Number(e.target.value))}><option value="">Select…</option>
        {[5, 4, 3, 2, 1].map((x) => <option key={x} value={x}>{x} · {RATING[x]}</option>)}</select></Field>}
      <Field label={step === 'acknowledge' ? 'Your comments (optional)' : step === 'finalize' ? 'Calibration note (optional)' : 'Comments'} hint={minComments ? `At least ${minComments} characters: what went well, what to improve, with examples.` : undefined}>
        <textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} maxLength={5000} /></Field>
      <ErrorBox error={err} />
      <div className="row"><span className="spacer" />
        <button className="btn primary" disabled={busy || (needsRating && !n) || comments.trim().length < minComments} onClick={submit}>{busy ? 'Submitting…' : step === 'acknowledge' ? 'Acknowledge' : 'Submit'}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- goals
function Goals({ cycleId, employeeId, role, editable, goalRatings }: { cycleId: string; employeeId: string; role: 'employee' | 'manager' | 'hr'; editable: boolean; goalRatings: Record<string, number> }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/performance/cycles/${cycleId}/goals/${employeeId}`), [cycleId, employeeId]);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const act = async (id: string, action: 'agree' | 'drop', ok: string) => { try { await api.post(`/api/v1/performance/goals/${id}/${action}`); toast(ok); reload(); } catch (e) { toast(errText(e), 'error'); } };
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const left = 100 - data.totalWeight;
  return (
    <div className="card stack">
      <div className="row"><h3 style={{ margin: 0 }}>Goals</h3><span className={`badge ${data.totalWeight === 100 ? 'ok' : 'warn'}`}>Weight {data.totalWeight}% of 100%</span><span className="spacer" />
        {editable && left > 0 && <button className="btn sm" onClick={() => setAdding(true)}>{role === 'employee' ? 'Propose a goal' : 'Add goal'}</button>}</div>
      {!data.items.length ? <p className="muted" style={{ margin: 0 }}>{role === 'employee' ? 'No goals yet. Propose goals and your manager agrees them.' : 'No goals yet.'}</p> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Goal</th><th>Weight</th><th>Status</th><th>Progress</th>{Object.keys(goalRatings).length > 0 && <th>Rating</th>}{editable && <th />}</tr></thead><tbody>
          {data.items.map((g: any) => <tr key={g.id}>
            <td>{g.title}{g.measure && <div className="muted" style={{ fontSize: 12 }}>Measured by: {g.measure}</div>}</td><td>{g.weight}%</td>
            <td><span className={`badge ${g.status === 'agreed' ? 'ok' : 'warn'}`}>{g.status === 'agreed' ? 'Agreed' : 'Proposed'}</span></td>
            <td><div className="row" style={{ gap: 6 }}><progress max={100} value={g.progress} style={{ width: 80 }} /> {g.progress}%</div></td>
            {Object.keys(goalRatings).length > 0 && <td>{goalRatings[g.id] ?? '—'}</td>}
            {editable && <td><div className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              {g.status === 'agreed' && <button className="btn sm" onClick={() => setProgress(g)}>Update progress</button>}
              {g.status === 'proposed' && role !== 'employee' && <button className="btn sm primary" onClick={() => act(g.id, 'agree', 'Goal agreed')}>Agree</button>}
              {(g.status === 'proposed' || role !== 'employee') && <button className="btn sm" onClick={() => act(g.id, 'drop', 'Goal dropped')}>Drop</button>}
            </div></td>}</tr>)}
        </tbody></table></div>)}
      {adding && <GoalForm cycleId={cycleId} employeeId={employeeId} maxWeight={left} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {progress && <ProgressForm g={progress} onClose={() => setProgress(null)} onSaved={() => { setProgress(null); toast('Progress saved'); reload(); }} />}
    </div>
  );
}
function ProgressForm({ g, onClose, onSaved }: { g: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<number>(g.progress);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`Progress — ${g.title}`} onClose={onClose}>
      <div className="stack">
        <Field label={`Progress: ${v}%`}><input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} /></Field>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={async () => { try { await api.post(`/api/v1/performance/goals/${g.id}/progress`, { progress: v }); onSaved(); } catch (e) { setErr(errText(e)); } }}>Save</button></div>
      </div>
    </Modal>
  );
}
function GoalForm({ cycleId, employeeId, maxWeight, onClose, onSaved }: { cycleId: string; employeeId: string; maxWeight: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', measure: '', description: '', weight: Math.min(maxWeight, 25) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Goal" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
        try { await api.post(`/api/v1/performance/cycles/${cycleId}/goals/${employeeId}`, { title: f.title, measure: f.measure || null, description: f.description || null, weight: f.weight }); onSaved(); }
        catch (x) { setErr(errText(x)); } finally { setBusy(false); } }}>
        <Field label="Goal" hint="Specific and measurable, e.g. “Report turnaround within 3 working days for 95% of water samples”"><input required minLength={3} maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="How it is measured"><input maxLength={500} value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} placeholder="LIMS TAT report, audit findings, authorization register…" /></Field>
        <Field label="Details (optional)"><textarea maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={`Weight (%) — up to ${maxWeight}% left`}><input type="number" required min={1} max={maxWeight} value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) })} /></Field>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</button></div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- cycles (HR)
function Cycles({ data, reload }: { data: any[]; reload: () => void }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ c: any; action: 'activate' | 'close' } | null>(null);
  return (
    <div className="stack">
      <div className="row"><p className="muted" style={{ margin: 0 }}>Activating a cycle creates a review for every active employee who joined before the period ends, with their reporting manager as reviewer.</p>
        <span className="spacer" /><button className="btn primary" onClick={() => setCreating(true)}>New cycle</button></div>
      {!data.length ? <Empty>No review cycles yet.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Cycle</th><th>Period</th><th>Self-review</th><th>Status</th><th>Finalized</th><th /></tr></thead><tbody>
          {data.map((c) => <tr key={c.id}><td>{c.name}</td><td>{fmtDate(c.period_start)} – {fmtDate(c.period_end)}</td><td>{c.self_review ? 'Yes' : 'No'}</td><td><StatusBadge status={c.status} /></td>
            <td>{c.status === 'draft' ? '—' : `${c.finalized} / ${c.reviews}`}</td>
            <td>{c.status === 'draft' && <button className="btn sm primary" onClick={() => setConfirm({ c, action: 'activate' })}>Activate</button>}
              {c.status === 'active' && <button className="btn sm" disabled={c.finalized < c.reviews} title={c.finalized < c.reviews ? 'Finalize every review first' : ''} onClick={() => setConfirm({ c, action: 'close' })}>Close</button>}</td></tr>)}
        </tbody></table></div>)}
      {creating && <CycleForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {confirm && <Confirm title={`${confirm.action === 'activate' ? 'Activate' : 'Close'} ${confirm.c.name}?`}
        message={confirm.action === 'activate' ? 'Reviews are created for all eligible staff and everyone is notified. This cannot be undone.' : 'No further changes can be made to reviews or goals in this cycle.'}
        confirmLabel={confirm.action === 'activate' ? 'Activate' : 'Close cycle'} onClose={() => setConfirm(null)}
        onConfirm={async () => { const r = await api.post(`/api/v1/performance/cycles/${confirm.c.id}/${confirm.action}`); toast(confirm.action === 'activate' ? `Activated: ${r.reviews} reviews created` : 'Cycle closed'); reload(); }} />}
    </div>
  );
}
function CycleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [f, setF] = useState({ name: `FY ${y}-${String(y + 1).slice(2)}`, periodStart: `${y}-04-01`, periodEnd: `${y + 1}-03-31`, selfReview: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="New review cycle" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.post('/api/v1/performance/cycles', f); onSaved(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } }}>
        <Field label="Name"><input required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="row"><Field label="Period start"><input type="date" required value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="Period end"><input type="date" required value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field></div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.selfReview} onChange={(e) => setF({ ...f, selfReview: e.target.checked })} /> Employees write a self-review first</label>
        <p className="muted" style={{ margin: 0 }}>The cycle is created as a draft; nobody sees it until you activate it.</p>
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create draft'}</button></div>
      </form>
    </Modal>
  );
}
