import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';
import { EmployeePicker } from '../features/employees/EmployeePicker';

type Tab = 'mine' | 'team' | 'all';
export const PURPOSE: Record<string, string> = {
  field_sampling: 'Field sampling', client_visit: 'Client visit', site_audit: 'Site audit', training: 'Training', official_work: 'Official work', other: 'Other',
};
const OUTCOME: Record<string, string> = { completed: 'Completed', partly_completed: 'Partly completed', not_done: 'Not done' };
const PART: Record<string, string> = { full: 'Full day', first_half: 'First half', second_half: 'Second half' };

const when = (d: any) => d.start_date === d.end_date
  ? `${fmtDate(d.start_date)}${d.day_part === 'full' ? '' : ` · ${PART[d.day_part]!.toLowerCase()}`}`
  : `${fmtDate(d.start_date)} – ${fmtDate(d.end_date)}`;

export function FieldDuty() {
  const { canAny, can, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('field_duty.self')) tabs.push({ key: 'mine', label: 'My field duty' });
  if (can('field_duty.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('field_duty.read', 'field_duty.approve', 'field_duty.manage')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to field duty.</Empty>;
  return (
    <div className="stack">
      <div><h1>Field duty</h1><p className="sub">Work away from the workplace — field sampling, client sites, audits, training. Approved days count as on duty in attendance, without office punches.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' ? <Mine /> : <Everyone scope={tab} />}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/field-duty/requests?scope=mine&pageSize=50'), []);
  const [form, setForm] = useState(false);
  const [withdraw, setWithdraw] = useState<any | null>(null);
  const [cancel, setCancel] = useState<any | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const today = data?.today ?? todayLocal();
  return (
    <section className="card stack" aria-labelledby="fd-mine">
      <div className="row"><h2 id="fd-mine" style={{ margin: 0 }}>My field duty</h2><span className="spacer" />
        <button className="btn primary" onClick={() => setForm(true)}>Request field duty</button></div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No field duty yet.</Empty> : (
        <div className="table-wrap"><table className="t" aria-label="My field duty"><thead><tr><th>When</th><th>Purpose</th><th>Place</th><th>Status</th><th>Report</th><th /></tr></thead><tbody>
          {data.items.map((d: any) => <tr key={d.id}>
            <td>{when(d)}</td><td>{PURPOSE[d.purpose]}</td>
            <td>{d.place}{d.client_name && <div className="muted" style={{ fontSize: 12 }}>{d.client_name}{d.reference ? ` · ${d.reference}` : ''}</div>}</td>
            <td><StatusBadge status={d.status} />{d.recorded_by_other && <div className="muted" style={{ fontSize: 12 }}>Recorded by HR</div>}</td>
            <td><ReportCell d={d} /></td>
            <td className="row" style={{ gap: 4 }}>
              {d.status === 'pending' && <button className="btn sm" onClick={() => setWithdraw(d)}>Withdraw</button>}
              {d.status === 'approved' && d.start_date > today && <button className="btn sm" onClick={() => setCancel(d)}>Cancel</button>}
              {d.status === 'approved' && d.start_date <= today && <button className="btn sm primary" onClick={() => setReport(d)}>{d.outcome ? 'Edit report' : 'Report'}</button>}
            </td></tr>)}
        </tbody></table></div>)}
      {form && <RequestForm onClose={() => setForm(false)} onSaved={() => { toast('Field duty requested; sent for approval'); reload(); }} />}
      {withdraw && <Confirm title="Withdraw field duty request" message={`Withdraw your field duty for ${when(withdraw)}?`} confirmLabel="Withdraw" onClose={() => setWithdraw(null)}
        onConfirm={async () => { await api.post(`/api/v1/field-duty/requests/${withdraw.id}/withdraw`); toast('Request withdrawn'); reload(); }} />}
      {cancel && <Confirm title="Cancel field duty" requireComment confirmLabel="Cancel field duty" danger onClose={() => setCancel(null)}
        message={`Cancel your approved field duty for ${when(cancel)}?`}
        onConfirm={async (reason) => { await api.post(`/api/v1/field-duty/requests/${cancel.id}/cancel`, { reason }); toast('Field duty cancelled'); reload(); }} />}
      {report && <ReportForm duty={report} onClose={() => setReport(null)} onSaved={() => { toast('Report saved'); reload(); }} />}
    </section>
  );
}

function ReportCell({ d }: { d: any }) {
  if (d.status === 'cancelled' && d.cancel_reason) return <span className="muted">Cancelled: {d.cancel_reason}</span>;
  if (!d.outcome) return <span className="muted">—</span>;
  return <><StatusBadge status={d.outcome} />{d.outcome_note && <div className="muted" style={{ fontSize: 12, maxWidth: 260 }}>{d.outcome_note}</div>}</>;
}

function RequestForm({ forOthers, onClose, onSaved }: { forOthers?: boolean; onClose: () => void; onSaved: () => void }) {
  const today = todayLocal();
  const [f, setF] = useState({ employeeId: '', startDate: today, endDate: today, dayPart: 'full', purpose: 'field_sampling', place: '', clientName: '', reference: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => {
    const n = { ...x, ...p };
    if (p.startDate && n.endDate < p.startDate) n.endDate = p.startDate;
    if (n.startDate !== n.endDate) n.dayPart = 'full';
    return n;
  });
  const single = f.startDate === f.endDate;
  return (
    <Modal title={forOthers ? 'Record field duty for an employee' : 'Request field duty'} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try {
          await api.post('/api/v1/field-duty/requests', { ...f, employeeId: forOthers ? f.employeeId : undefined, clientName: f.clientName || undefined, reference: f.reference || undefined });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        {forOthers && <Field label="Employee"><EmployeePicker value={f.employeeId} onChange={(employeeId) => set({ employeeId })} /></Field>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="From"><input type="date" required value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          <Field label="To"><input type="date" required min={f.startDate} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
          <Field label="Day" hint={single ? undefined : 'Half days are for a single date'}>
            <select value={f.dayPart} disabled={!single} onChange={(e) => set({ dayPart: e.target.value })}>
              {Object.entries(PART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="Purpose"><select value={f.purpose} onChange={(e) => set({ purpose: e.target.value })}>
          {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Place" hint="Site, client premises or town"><input required minLength={2} maxLength={200} value={f.place} onChange={(e) => set({ place: e.target.value })} /></Field>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="Client (optional)"><input maxLength={200} value={f.clientName} onChange={(e) => set({ clientName: e.target.value })} /></Field>
          <Field label="Work order / reference (optional)"><input maxLength={100} value={f.reference} onChange={(e) => set({ reference: e.target.value })} /></Field>
        </div>
        <Field label="Reason"><textarea required minLength={3} maxLength={1000} value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="What the duty is for (samples to collect, meeting, audit…)" /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (forOthers && !f.employeeId)}>{busy ? 'Sending…' : 'Submit for approval'}</button></div>
      </form>
    </Modal>
  );
}

function ReportForm({ duty, onClose, onSaved }: { duty: any; onClose: () => void; onSaved: () => void }) {
  const [outcome, setOutcome] = useState<string>(duty.outcome ?? 'completed');
  const [note, setNote] = useState<string>(duty.outcome_note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Field duty report — ${when(duty)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try { await api.post(`/api/v1/field-duty/requests/${duty.id}/report`, { outcome, note: note || undefined }); onSaved(); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <div className="muted">{PURPOSE[duty.purpose]} at {duty.place}</div>
        <Field label="Outcome"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={outcome === 'completed' ? 'Notes (optional)' : 'What was not done, and why'}>
          <textarea required={outcome !== 'completed'} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save report'}</button></div>
      </form>
    </Modal>
  );
}

function Everyone({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me } = useAuth();
  const [f, setF] = useState({ on: '', status: '' });
  const [page, setPage] = useState(1);
  const [record, setRecord] = useState(false);
  const [cancel, setCancel] = useState<any | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/field-duty/requests${qs({ scope, on: f.on || undefined, status: f.status || undefined, page, pageSize: 25 })}`), [scope, f, page]);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const manage = scope === 'all' && can('field_duty.manage');
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="On date"><input type="date" value={f.on} onChange={(e) => set({ on: e.target.value })} /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>
          {['pending', 'approved', 'returned', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</select></Field>
        <button className="btn sm" onClick={() => set({ on: data?.today ?? todayLocal() })}>Out today</button>
        <span className="spacer" />
        {manage && <button className="btn primary" onClick={() => setRecord(true)}>Record field duty</button>}
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No field duty matches.</Empty> : (<>
        <div className="table-wrap"><table className="t" aria-label="Field duty"><thead><tr><th>Employee</th><th>When</th><th>Purpose</th><th>Place</th><th>Reason</th><th>Status</th><th>Report</th><th /></tr></thead><tbody>
          {data.items.map((d: any) => <tr key={d.id}>
            <td>{d.name}<div className="muted mono" style={{ fontSize: 12 }}>{d.employee_code}{d.department ? ` · ${d.department}` : ''}</div></td>
            <td>{when(d)}</td><td>{PURPOSE[d.purpose]}</td>
            <td>{d.place}{d.client_name && <div className="muted" style={{ fontSize: 12 }}>{d.client_name}{d.reference ? ` · ${d.reference}` : ''}</div>}</td>
            <td style={{ maxWidth: 260 }}>{d.reason}</td>
            <td><StatusBadge status={d.status} /></td><td><ReportCell d={d} /></td>
            <td>{manage && d.status === 'approved' && d.employee_id !== me!.user.employeeId && <button className="btn sm danger" onClick={() => setCancel(d)}>Cancel</button>}</td></tr>)}
        </tbody></table></div>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>)}
      {record && <RequestForm forOthers onClose={() => setRecord(false)} onSaved={() => { toast('Field duty recorded; sent to the manager for approval'); reload(); }} />}
      {cancel && <Confirm title="Cancel approved field duty" danger requireComment confirmLabel="Cancel field duty" onClose={() => setCancel(null)}
        message={<>Cancel {cancel.name}'s field duty for {when(cancel)}? Attendance for those days is recalculated.</>}
        onConfirm={async (reason) => { await api.post(`/api/v1/field-duty/requests/${cancel.id}/cancel`, { reason }); toast('Field duty cancelled'); reload(); }} />}
    </div>
  );
}
