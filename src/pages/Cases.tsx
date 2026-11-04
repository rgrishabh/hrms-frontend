import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, todayLocal } from '../format';
import { useLoad, LoadFailed, Loading, ErrorBox, Empty, Modal, Field, Tabs, StatusBadge, Confirm, useToast, errText } from '../ui';

type Tab = 'mine' | 'grievances' | 'posh' | 'committee';
const POSH_CAT: Record<string, string> = { verbal: 'Verbal', physical: 'Physical', non_verbal: 'Non-verbal / gestures', quid_pro_quo: 'Quid pro quo', hostile_environment: 'Hostile environment', online: 'Online / messages', other: 'Other' };
const GR_CAT: Record<string, string> = { pay: 'Pay', leave: 'Leave', workload: 'Workload', manager: 'Manager', colleague: 'Colleague', safety: 'Safety', facilities: 'Facilities', discrimination: 'Discrimination', policy: 'Policy', other: 'Other' };
const STATUS: Record<string, string> = { received: 'Received', conciliation: 'Conciliation', inquiry: 'Inquiry', report_submitted: 'Report submitted', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', reopened: 'Reopened', closed: 'Closed', withdrawn: 'Withdrawn' };

export function Cases() {
  const { can, hasModule } = useAuth();
  const [params, setParams] = useSearchParams();
  const ic = useLoad(() => (hasModule('posh') ? api.get('/api/v1/cases/committee') : Promise.resolve(null)), []);
  const { me } = useAuth();
  const onIc = !!ic.data?.members.some((m: any) => m.user_id === me!.user.id);
  const tabs: { key: Tab; label: string }[] = [{ key: 'mine', label: 'My cases' }];
  if (hasModule('grievance') && can('grievance.manage')) tabs.push({ key: 'grievances', label: 'Grievances' });
  if (hasModule('posh') && onIc) tabs.push({ key: 'posh', label: 'POSH complaints (IC)' });
  if (hasModule('posh')) tabs.push({ key: 'committee', label: 'Internal Committee' });
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? 'mine') as Tab;
  const open = params.get('case');
  return (
    <div className="stack">
      <div><h1>Grievances &amp; POSH</h1><p className="sub">Confidential. POSH complaints go only to the Internal Committee; grievances to HR. Details are encrypted.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'mine' && <Mine onOpen={(id) => setParams({ tab, case: id })} />}
      {tab === 'grievances' && <Handling kind="grievance" onOpen={(id) => setParams({ tab, case: id })} />}
      {tab === 'posh' && <Handling kind="posh" onOpen={(id) => setParams({ tab, case: id })} />}
      {tab === 'committee' && (ic.error ? <LoadFailed error={ic.error} onRetry={ic.reload} /> : <Committee data={ic.data} reload={ic.reload} />)}
      {open && <CaseDetail id={open} onClose={() => setParams({ tab })} />}
    </div>
  );
}

function Mine({ onOpen }: { onOpen: (id: string) => void }) {
  const { hasModule } = useAuth();
  const [filing, setFiling] = useState<'posh' | 'grievance' | null>(null);
  const g = useLoad(() => (hasModule('grievance') ? api.get('/api/v1/cases?kind=grievance&scope=mine') : Promise.resolve({ items: [] })), []);
  const p = useLoad(() => (hasModule('posh') ? api.get('/api/v1/cases?kind=posh&scope=mine') : Promise.resolve({ items: [] })), []);
  const items = [...(g.data?.items ?? []), ...(p.data?.items ?? [])];
  return (
    <div className="stack">
      <div className="row"><span className="spacer" />
        {hasModule('grievance') && <button className="btn" onClick={() => setFiling('grievance')}>Raise a grievance</button>}
        {hasModule('posh') && <button className="btn primary" onClick={() => setFiling('posh')}>File a POSH complaint</button>}</div>
      <ErrorBox error={g.error ?? p.error} />
      {g.loading || p.loading ? <Loading /> : g.error || p.error ? null : !items.length ? <Empty>You have not raised any case.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Reference</th><th>Kind</th><th>Category</th><th>Filed</th><th>Status</th></tr></thead><tbody>
          {items.map((c: any) => <tr key={c.id} className="clickable" onClick={() => onOpen(c.id)}><td className="mono">{c.reference}</td><td>{c.kind === 'posh' ? 'POSH' : 'Grievance'}{c.anonymous ? ' (anonymous)' : ''}</td>
            <td>{(c.kind === 'posh' ? POSH_CAT : GR_CAT)[c.category]}</td><td>{fmtDate(c.received_at.slice(0, 10))}</td><td><StatusBadge status={c.status} /></td></tr>)}
        </tbody></table></div>)}
      {filing && <FileCase kind={filing} onClose={() => setFiling(null)} onDone={(id) => { g.reload(); p.reload(); onOpen(id); }} />}
    </div>
  );
}

function FileCase({ kind, onClose, onDone }: { kind: 'posh' | 'grievance'; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const cats = kind === 'posh' ? POSH_CAT : GR_CAT;
  const [f, setF] = useState({ category: Object.keys(cats)[0]!, description: '', incidentDate: '', respondentText: '', anonymous: false, lateReason: '' });
  const [respondent, setRespondent] = useState('');
  const [search, setSearch] = useState('');
  const emps = useLoad(() => (search.length >= 2 ? api.get(`/api/v1/employees${qs({ search, pageSize: 10 })}`) : Promise.resolve({ items: [] })), [search]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={kind === 'posh' ? 'File a POSH complaint' : 'Raise a grievance'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api.post('/api/v1/cases', { kind, category: f.category, description: f.description, incidentDate: f.incidentDate || null, respondentEmployeeId: respondent || null,
            respondentText: f.respondentText || null, anonymous: kind === 'grievance' && f.anonymous, lateReason: f.lateReason || null });
          toast(`Filed as ${r.reference}`); onDone(r.id); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        {kind === 'posh' && <div className="alert info">Your complaint goes only to the Internal Committee. HR and administrators cannot see it. You will be updated here.</div>}
        <div className="form-grid">
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="When did it happen?"><input type="date" max={todayLocal()} required={kind === 'posh'} value={f.incidentDate} onChange={(e) => setF({ ...f, incidentDate: e.target.value })} /></Field>
        </div>
        <Field label="What happened" hint="Facts: what, where, who was present. At least 20 characters."><textarea required minLength={20} rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={kind === 'posh' ? 'Respondent (the person complained against)' : 'Person involved (optional)'}>
          <div className="stack" style={{ gap: 4 }}><input placeholder="Search employee (optional)" aria-label="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label={kind === 'posh' ? 'Respondent' : 'Person involved'} value={respondent} onChange={(e) => setRespondent(e.target.value)}><option value="">— not an employee / not named —</option>
              {(emps.data?.items ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name ?? ''} ({x.employee_code})</option>)}</select>
            <input placeholder="Or describe (e.g. a visitor or contractor)" aria-label="Or describe the person" value={f.respondentText} onChange={(e) => setF({ ...f, respondentText: e.target.value })} /></div></Field>
        {kind === 'posh' && <Field label="If this is more than three months after the incident, why?" hint="The Committee may extend the time limit for reasons recorded"><textarea value={f.lateReason} onChange={(e) => setF({ ...f, lateReason: e.target.value })} /></Field>}
        {kind === 'grievance' && <label className="row"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> Raise anonymously (HR will not see your name; you can still follow it here)</label>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Submit</button></div>
      </form>
    </Modal>
  );
}

function Handling({ kind, onOpen }: { kind: 'posh' | 'grievance'; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('');
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/cases${qs({ kind, scope: 'handling', status: status || undefined })}`), [kind, status]);
  const today = todayLocal();
  return (
    <div className="stack">
      <div className="row"><Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>
        {Object.entries(STATUS).filter(([k]) => (kind === 'posh' ? ['received', 'conciliation', 'inquiry', 'report_submitted', 'closed', 'withdrawn'] : ['open', 'in_progress', 'resolved', 'reopened', 'closed', 'withdrawn']).includes(k))
          .map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? null : !data.items.length ? <Empty>No cases.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Reference</th><th>Category</th><th>Complainant</th><th>Received</th><th>{kind === 'posh' ? 'Inquiry / report due' : 'Response due'}</th>{kind === 'grievance' && <th>Handler</th>}<th>Status</th></tr></thead><tbody>
          {data.items.map((c: any) => { const due = kind === 'posh' ? (c.status === 'report_submitted' ? c.report_due : c.inquiry_due) : c.sla_due; const open = !['closed', 'withdrawn'].includes(c.status);
            return <tr key={c.id} className="clickable" onClick={() => onOpen(c.id)}><td className="mono">{c.reference}</td><td>{(kind === 'posh' ? POSH_CAT : GR_CAT)[c.category]}</td>
              <td>{c.anonymous ? <span className="muted">Anonymous</span> : c.complainant_name}</td><td>{fmtDate(c.received_at.slice(0, 10))}</td>
              <td>{due && open ? <span className={`badge ${due < today ? 'danger' : ''}`}>{fmtDate(due)}</span> : '—'}</td>{kind === 'grievance' && <td>{c.assignee_name ?? '—'}</td>}<td><StatusBadge status={c.status} /></td></tr>; })}
        </tbody></table></div>)}
    </div>
  );
}

function CaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, loading, error, reload } = useLoad(() => api.get(`/api/v1/cases/${id}`), [id]);
  const [f, setF] = useState({ text: '', share: false, toStatus: '', outcome: '' });
  const [withdraw, setWithdraw] = useState(false);
  const [assign, setAssign] = useState(false);
  const [search, setSearch] = useState('');
  const users = useLoad(() => (assign ? api.get(`/api/v1/cases/people${qs({ search: search || undefined })}`).catch(() => ({ items: [] })) : Promise.resolve({ items: [] })), [assign, search]);
  const handler = c?.role === 'handler';
  const closed = c && ['closed', 'withdrawn'].includes(c.status);
  return (
    <Modal title={c ? `${c.reference} — ${c.kind === 'posh' ? 'POSH complaint' : 'Grievance'}` : 'Case'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={c.status} /><span className="muted">{(c.kind === 'posh' ? POSH_CAT : GR_CAT)[c.category]} · filed {fmtDateTime(c.receivedAt)}</span><span className="spacer" />
            {c.kind === 'posh' && !closed && <span className="badge">{c.status === 'report_submitted' ? `Report due ${fmtDate(c.reportDue)}` : `Inquiry due ${fmtDate(c.inquiryDue)}`}</span>}
            {c.kind === 'grievance' && !closed && c.slaDue && <span className="badge">Response due {fmtDate(c.slaDue)}</span>}</div>
          {handler && <div className="muted" style={{ fontSize: 13 }}>Complainant: {c.anonymous ? 'anonymous' : c.complainantName}{c.respondentName ? ` · Respondent: ${c.respondentName}` : ''}{c.respondentText ? ` · ${c.respondentText}` : ''}{c.assigneeName ? ` · Handler: ${c.assigneeName}` : ''}</div>}
          <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{c.description}{c.incidentDate && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Incident: {fmtDate(c.incidentDate)}</div>}</div>
          {c.lateReason && <div className="alert warn">Filed late: {c.lateReason}</div>}
          {c.outcome && <div className="alert ok">Outcome: {c.outcome}</div>}
          <div className="stack" style={{ gap: 4 }}><strong>Updates</strong>{!c.events.length ? <div className="muted">None yet.</div> : c.events.map((e: any, i: number) =>
            <div key={i} className="card" style={{ padding: 8 }}><div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(e.at)} · {e.actor ?? '—'}{e.to_status ? ` · ${STATUS[e.from_status] ?? ''} → ${STATUS[e.to_status]}` : ''}
              {handler && !e.visible_to_complainant && <span className="badge" style={{ marginLeft: 6 }}>internal</span>}</div>{e.text && <div style={{ whiteSpace: 'pre-wrap' }}>{e.text}</div>}</div>)}</div>
          {!closed || (c.kind === 'grievance' && c.status === 'resolved') ? (
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              try { await api.post(`/api/v1/cases/${id}/events`, { text: f.text, visibleToComplainant: handler ? f.share : true, toStatus: f.toStatus || undefined, outcome: f.outcome || undefined, expectedVersion: c.version });
                toast('Saved'); setF({ text: '', share: false, toStatus: '', outcome: '' }); reload(); } catch (x) { toast(errText(x), 'error'); }
            }}>
              <Field label={handler ? 'Add a note or update' : 'Add a comment'}><textarea required minLength={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
              <div className="row">
                {handler && <label className="row"><input type="checkbox" checked={f.share} onChange={(e) => setF({ ...f, share: e.target.checked })} /> Share with the complainant</label>}
                {handler && c.allowedMoves.length > 0 && <select value={f.toStatus} onChange={(e) => setF({ ...f, toStatus: e.target.value })}><option value="">Keep status</option>
                  {c.allowedMoves.map((s: string) => <option key={s} value={s}>Move to {STATUS[s]}</option>)}</select>}
                {!handler && c.kind === 'grievance' && c.status === 'resolved' && <label className="row"><input type="checkbox" checked={f.toStatus === 'reopened'} onChange={(e) => setF({ ...f, toStatus: e.target.checked ? 'reopened' : '' })} /> Not resolved — reopen</label>}
                <span className="spacer" /><button className="btn primary">Save</button></div>
              {handler && f.toStatus === 'closed' && <Field label="Outcome / recommendations"><textarea required={c.kind === 'posh'} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} /></Field>}
            </form>) : null}
          <div className="row">
            {c.role === 'complainant' && !closed && <button className="btn sm danger" onClick={() => setWithdraw(true)}>Withdraw</button>}
            {c.kind === 'grievance' && can('grievance.manage') && !closed && <button className="btn sm" onClick={() => setAssign(true)}>Assign handler</button>}</div>
        </div>
      )}
      {withdraw && <Confirm title="Withdraw case" danger requireComment confirmLabel="Withdraw" message="Tell us why (optional details help us improve)." onClose={() => setWithdraw(false)}
        onConfirm={async (reason) => { try { await api.post(`/api/v1/cases/${id}/withdraw`, { reason }); toast('Withdrawn'); reload(); } catch (x) { toast(errText(x), 'error'); } }} />}
      {assign && <Modal title="Assign handler" onClose={() => setAssign(false)}>
        <div className="stack"><input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
          {(users.data?.items ?? []).map((u: any) => <div key={u.id} className="row"><span>{u.display_name}</span><span className="spacer" />
            <button className="btn sm" onClick={async () => { try { await api.post(`/api/v1/cases/${id}/assign`, { userId: u.id }); toast('Assigned'); setAssign(false); reload(); } catch (x) { toast(errText(x), 'error'); } }}>Assign</button></div>)}
          <div className="muted" style={{ fontSize: 12 }}>The complainant and the person named in the grievance cannot handle it.</div></div></Modal>}
    </Modal>
  );
}

function Committee({ data, reload }: { data: any; reload: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [search, setSearch] = useState('');
  const users = useLoad(() => (edit ? api.get(`/api/v1/cases/people${qs({ search: search || undefined })}`).catch(() => ({ items: [] })) : Promise.resolve({ items: [] })), [edit, search]);
  const report = useLoad(() => api.get(`/api/v1/cases/posh/annual-report?year=${new Date().getFullYear()}`).catch(() => null), []);
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row"><h3 style={{ margin: 0 }}>Internal Committee</h3><span className="spacer" />
          {can('posh.admin') && <button className="btn sm" onClick={() => setEdit({ members: data.members.map((m: any) => ({ userId: m.user_id, name: m.display_name, role: m.role })),
            external: data.external.map((x: any) => ({ name: x.name, organization: x.organization, since: x.since })) })}>Edit membership</button>}</div>
        {data.warnings.map((w: string) => <div key={w} className="alert warn">{w}</div>)}
        {data.members.map((m: any) => <div key={m.user_id}>{m.display_name} — {m.role === 'presiding_officer' ? 'Presiding officer' : 'Member'}</div>)}
        {data.external.map((x: any) => <div key={x.id}>{x.name} — External member ({x.organization})</div>)}
        <div className="muted" style={{ fontSize: 12 }}>Under the POSH Act the presiding officer is a senior woman employee and at least half the members are women; one member is from an NGO or association. Maintaining membership does not give access to complaints.</div>
      </div>
      {report.data && <div className="card"><strong>{report.data.year}: </strong>{report.data.received} received · {report.data.disposed} disposed · {report.data.pending} pending ({report.data.pending_over_90} beyond 90 days)</div>}
      {edit && <Modal title="Internal Committee membership" onClose={() => setEdit(null)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.put('/api/v1/cases/committee', { members: edit.members.map((m: any) => ({ userId: m.userId, role: m.role })), external: edit.external }); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(errText(x), 'error'); }
        }}>
          {edit.members.map((m: any, i: number) => <div key={m.userId} className="row"><span style={{ flex: 1 }}>{m.name}</span>
            <select value={m.role} onChange={(e) => { const members = [...edit.members]; members[i] = { ...m, role: e.target.value }; setEdit({ ...edit, members }); }}><option value="presiding_officer">Presiding officer</option><option value="member">Member</option></select>
            <button type="button" className="btn sm" onClick={() => setEdit({ ...edit, members: edit.members.filter((_: any, j: number) => j !== i) })}>×</button></div>)}
          <input placeholder="Add a member: search people" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="stack" style={{ gap: 2, maxHeight: 140, overflow: 'auto' }}>{(users.data?.items ?? []).filter((u: any) => !edit.members.some((m: any) => m.userId === u.id)).map((u: any) =>
            <button type="button" key={u.id} className="btn sm" style={{ textAlign: 'left' }} onClick={() => setEdit({ ...edit, members: [...edit.members, { userId: u.id, name: u.display_name, role: 'member' }] })}>+ {u.display_name}</button>)}</div>
          <strong>External member(s)</strong>
          {edit.external.map((x: any, i: number) => <div key={i} className="row">
            <input required placeholder="Name" value={x.name} onChange={(e) => { const external = [...edit.external]; external[i] = { ...x, name: e.target.value }; setEdit({ ...edit, external }); }} />
            <input required placeholder="NGO / association" value={x.organization} onChange={(e) => { const external = [...edit.external]; external[i] = { ...x, organization: e.target.value }; setEdit({ ...edit, external }); }} />
            <input type="date" required value={x.since} onChange={(e) => { const external = [...edit.external]; external[i] = { ...x, since: e.target.value }; setEdit({ ...edit, external }); }} />
            <button type="button" className="btn sm" onClick={() => setEdit({ ...edit, external: edit.external.filter((_: any, j: number) => j !== i) })}>×</button></div>)}
          <div><button type="button" className="btn sm" onClick={() => setEdit({ ...edit, external: [...edit.external, { name: '', organization: '', since: todayLocal() }] })}>+ External member</button></div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
        </form></Modal>}
    </div>
  );
}
