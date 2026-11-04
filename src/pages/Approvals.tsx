import { useState } from 'react';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Confirm, Tabs, Modal, useToast } from '../ui';

const ENTITY_LABEL: Record<string, string> = { attendance_regularization: 'Attendance correction', leave_request: 'Leave', expense_claim: 'Expense claim', lab_authorization: 'Technical authorization', job_requisition: 'Job requisition', job_offer: 'Job offer', separation: 'Separation', probation_review: 'Probation review', salary_change: 'Salary change', payroll_run: 'Payroll run', overtime_claim: 'Overtime', field_duty: 'Field duty' };

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/approvals/${id}`), [id]);
  return (
    <Modal title="Approval history" onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div><strong>{data.summary}</strong> <StatusBadge status={data.status} /></div>
          {data.steps.map((s: any) => (
            <div key={s.step_index} className="card" style={{ padding: 12 }}>
              <div className="row"><strong>Step {s.step_index + 1}</strong><span className="muted">{s.approver_name ?? (['attendance.approve', 'leave.approve'].includes(s.approver_permission) ? 'HR approvers' : s.approver_permission === 'expenses.approve' ? 'Finance approvers' : s.approver_permission === 'competency.authorize' ? 'Quality' : s.approver_permission === 'recruitment.approve' || s.approver_permission === 'lifecycle.manage' ? 'HR approvers' : s.approver_permission === 'payroll.approve' ? 'Payroll approvers' : s.approver_permission)}</span><span className="spacer" /><StatusBadge status={s.status} /></div>
              {s.acted_by_name && <div className="muted">{s.acted_by_name} · {fmtDateTime(s.acted_at)}</div>}
              {s.comment && <div>“{s.comment}”</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function Approvals() {
  const toast = useToast();
  const [tab, setTab] = useState<'inbox' | 'mine'>('inbox');
  const inbox = useLoad(() => api.get('/api/v1/approvals/inbox'), []);
  const mine = useLoad(() => api.get('/api/v1/approvals/mine'), []);
  const [action, setAction] = useState<{ id: string; kind: 'approve' | 'reject' | 'return'; summary: string } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <div className="stack">
      <div><h1>Approvals</h1><p className="sub">You can never approve your own requests.</p></div>
      <Tabs tabs={[{ key: 'inbox', label: `Awaiting me (${inbox.data?.items.length ?? 0})` }, { key: 'mine', label: 'My requests' }]} value={tab} onChange={setTab} />
      {tab === 'inbox' && (inbox.loading ? <Loading /> : inbox.error ? <ErrorBox error={inbox.error} /> : !inbox.data.items.length ? <Empty>Nothing waiting for you.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Request</th><th>Type</th><th>From</th><th>Submitted</th><th /></tr></thead><tbody>
          {inbox.data.items.map((r: any) => (
            <tr key={r.id}><td><button className="btn sm" style={{ border: 'none', padding: 0, background: 'none', color: 'var(--brand)', textAlign: 'left' }} onClick={() => setDetail(r.id)}>{r.summary}</button></td>
              <td>{ENTITY_LABEL[r.entity_type] ?? r.entity_type}</td><td>{r.requester_name}</td><td>{fmtDateTime(r.created_at)}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm primary" onClick={() => setAction({ id: r.id, kind: 'approve', summary: r.summary })}>Approve</button>
                <button className="btn sm" onClick={() => setAction({ id: r.id, kind: 'return', summary: r.summary })}>Return</button>
                <button className="btn sm danger" onClick={() => setAction({ id: r.id, kind: 'reject', summary: r.summary })}>Reject</button>
              </div></td></tr>))}
        </tbody></table></div>
      ))}
      {tab === 'mine' && (mine.loading ? <Loading /> : !mine.data?.items.length ? <Empty>You have not submitted any requests.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Request</th><th>Status</th><th>Submitted</th><th>Decided</th><th /></tr></thead><tbody>
          {mine.data.items.map((r: any) => (
            <tr key={r.id}><td><button className="btn sm" style={{ border: 'none', padding: 0, background: 'none', color: 'var(--brand)', textAlign: 'left' }} onClick={() => setDetail(r.id)}>{r.summary}</button></td>
              <td><StatusBadge status={r.status} /></td><td>{fmtDateTime(r.created_at)}</td><td>{fmtDateTime(r.decided_at)}</td>
              <td>{r.status === 'pending' && <button className="btn sm" onClick={() => setCancelId(r.id)}>Cancel</button>}</td></tr>))}
        </tbody></table></div>
      ))}
      {action && <Confirm title={`${action.kind[0]!.toUpperCase()}${action.kind.slice(1)} request`} message={action.summary}
        confirmLabel={action.kind === 'approve' ? 'Approve' : action.kind === 'reject' ? 'Reject' : 'Return for correction'} danger={action.kind === 'reject'}
        requireComment={action.kind !== 'approve'} onClose={() => setAction(null)}
        onConfirm={async (comment) => { const r = await api.post(`/api/v1/approvals/${action.id}/act`, { action: action.kind, comment: comment || undefined }); toast(`Request ${r.status}`); inbox.reload(); }} />}
      {cancelId && <Confirm title="Cancel request" message="Withdraw this request? This cannot be undone." confirmLabel="Withdraw request" danger onClose={() => setCancelId(null)}
        onConfirm={async () => { await api.post(`/api/v1/approvals/${cancelId}/cancel`); toast('Request cancelled'); mine.reload(); }} />}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
