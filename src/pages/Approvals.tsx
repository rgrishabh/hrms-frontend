import { useState } from 'react';
import { Inbox, Send } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Stepper, type StepState } from '../components/Stepper';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { Delegations } from '../features/approvals/Delegations';
import { ReassignForm } from '../features/approvals/ReassignForm';
import { ProfileChangeView } from '../features/profile/PersonalDetails';
import { fmtDateTime } from '../format';
import type { ApiItem, ApiResponse, Refine } from '../lib/api-types';
import { invalidateApi, useApiQuery } from '../lib/query';

const ENTITY_LABEL: Record<string, string> = { attendance_regularization: 'Attendance correction', leave_request: 'Leave', expense_claim: 'Expense claim', lab_authorization: 'Technical authorization', job_requisition: 'Job requisition', job_offer: 'Job offer', separation: 'Separation', probation_review: 'Probation review', salary_change: 'Salary change', payroll_run: 'Payroll run', overtime_claim: 'Overtime', field_duty: 'Field duty', travel_request: 'Travel', employee_loan: 'Advance / loan', employee_profile_change: 'Personal details', employee_bank_change: 'Bank account change' };
const APPROVER_GROUP: Record<string, string> = { 'attendance.approve': 'HR approvers', 'leave.approve': 'HR approvers', 'expenses.approve': 'Finance approvers', 'competency.authorize': 'Quality', 'recruitment.approve': 'HR approvers', 'lifecycle.manage': 'HR approvers', 'profile.approve': 'HR approvers', 'payroll.approve': 'Payroll approvers', 'employees.bank.approve': 'Bank detail approvers', 'approvals.escalations': 'HR approvers' };

type InboxItem = ApiItem<'/api/v1/approvals/inbox'>;
type MineItem = ApiItem<'/api/v1/approvals/mine'>;
type StuckItem = ApiItem<'/api/v1/approvals/stuck'>;
type ApprovalAnswer = ApiResponse<'/api/v1/approvals/{id}'>;
/** The names come from left joins, so they are null when nobody is named, whatever the schema says. */
type Step = Refine<ApprovalAnswer['steps'][number], { approver_name: string | null; acted_by_name: string | null; acted_for_name: string | null }>;
type Approval = Refine<ApprovalAnswer, { steps: Step[] }>;
type Action = { id: string; kind: 'approve' | 'reject' | 'return'; summary: string };

const stepApprover = (s: Step) => s.approver_name ?? (s.approver_permission ? APPROVER_GROUP[s.approver_permission] ?? s.approver_permission : 'Approver');
const stepState = (status: string): StepState => (['approved', 'done', 'skipped'].includes(status) ? 'done' : ['rejected', 'returned', 'cancelled', 'failed'].includes(status) ? 'failed' : status === 'pending' ? 'current' : 'upcoming');

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useApiQuery<Approval>(`/api/v1/approvals/${id}`);
  return (
    <Modal title="Approval history" onClose={onClose}>
      <QueryState query={query}>
        {(data) => (
          <div className="stack-4">
            <div className="cluster"><strong>{data.summary}</strong><StatusBadge status={data.status} /></div>
            {data.entity_type === 'employee_profile_change' && <ProfileChangeView changeId={data.entity_id} />}
            <Stepper
              label="Approval steps"
              steps={data.steps.map((s) => ({
                key: String(s.step_index),
                state: stepState(s.status),
                title: <>Step {s.step_index + 1}: {stepApprover(s)}</>,
                meta: <StatusBadge status={s.status} />,
                description: (s.escalated_at || s.acted_by_name || s.comment) && (
                  <div className="stack-1">
                    {s.escalated_at && <div>Escalated to {s.escalated_to_name ?? 'HR'} · {fmtDateTime(s.escalated_at)}</div>}
                    {s.acted_by_name && <div>{s.acted_by_name}{s.acted_for_name ? ` for ${s.acted_for_name}` : ''}{s.acted_via === 'escalation' ? ' (escalated)' : ''} · {fmtDateTime(s.acted_at)}</div>}
                    {s.comment && <div>“{s.comment}”</div>}
                  </div>
                ),
              }))}
            />
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

const TABS = ['inbox', 'mine', 'away', 'stuck'] as const;
const PAGE_SIZE = 25;

export function Approvals() {
  const toast = useToast();
  const { can, canAny } = useAuth();
  const canReassign = canAny('approvals.escalations', 'users.manage');
  const [reassign, setReassign] = useState<{ id: string; summary: string } | null>(null);
  const [tab, setTab] = useTabParam(TABS);
  const [inboxPage, setInboxPage] = useState(1);
  const [minePage, setMinePage] = useState(1);
  const [stuckPage, setStuckPage] = useState(1);
  const showStuck = can('users.manage');
  const inbox = useApiQuery<ApiResponse<'/api/v1/approvals/inbox'>>(`/api/v1/approvals/inbox${qs({ page: inboxPage, pageSize: PAGE_SIZE })}`, { placeholderData: (p) => p });
  const mine = useApiQuery<ApiResponse<'/api/v1/approvals/mine'>>(`/api/v1/approvals/mine${qs({ page: minePage, pageSize: PAGE_SIZE })}`, { placeholderData: (p) => p });
  const stuck = useApiQuery<ApiResponse<'/api/v1/approvals/stuck'>>(showStuck && tab === 'stuck' ? `/api/v1/approvals/stuck${qs({ page: stuckPage, pageSize: PAGE_SIZE })}` : null, { placeholderData: (p) => p });
  const stuckColumns: Column<StuckItem>[] = [
    { key: 'summary', header: 'Request', card: 'title', cell: (r) => <span className="cell-wrap">{r.summary}</span> },
    { key: 'type', header: 'Type', card: 'subtitle', cell: (r) => ENTITY_LABEL[r.entity_type] ?? r.entity_type },
    { key: 'by', header: 'Requested by', cell: (r) => r.requester_name },
    { key: 'when', header: 'Waiting since', cell: (r) => <span className="nowrap">{fmtDateTime(r.created_at)}</span> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => <div className="table__actions"><Button size="sm" variant="primary" aria-label={`Reassign ${r.summary}`} onClick={() => setReassign({ id: r.id, summary: r.summary })}>Reassign</Button></div> },
  ];
  const [action, setAction] = useState<Action | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const inboxColumns: Column<InboxItem>[] = [
    {
      key: 'request', header: 'Request', card: 'title', cell: (r) => (
        <>
          <Button variant="link" onClick={() => setDetail(r.id)}>{r.summary}</Button>
          {r.via === 'delegation' && <div className="table__cell-sub">Covering for {r.on_behalf_of}</div>}
          {r.via === 'escalation' && <div className="table__cell-sub">Escalated: waiting on {r.on_behalf_of ?? 'the approver'}</div>}
        </>
      ),
    },
    { key: 'type', header: 'Type', cell: (r) => ENTITY_LABEL[r.entity_type] ?? r.entity_type },
    { key: 'from', header: 'From', cell: (r) => r.requester_name },
    { key: 'submitted', header: 'Submitted', cell: (r) => fmtDateTime(r.created_at) },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (
        <div className="table__actions">
          <Button size="sm" variant="primary" onClick={() => setAction({ id: r.id, kind: 'approve', summary: r.summary })}>Approve</Button>
          <Button size="sm" onClick={() => setAction({ id: r.id, kind: 'return', summary: r.summary })}>Return</Button>
          <Button size="sm" variant="danger-ghost" onClick={() => setAction({ id: r.id, kind: 'reject', summary: r.summary })}>Reject</Button>
          {canReassign && <Button size="sm" variant="ghost" onClick={() => setReassign({ id: r.id, summary: r.summary })}>Reassign</Button>}
        </div>
      ),
    },
  ];
  const mineColumns: Column<MineItem>[] = [
    { key: 'request', header: 'Request', card: 'title', cell: (r) => <Button variant="link" onClick={() => setDetail(r.id)}>{r.summary}</Button> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'submitted', header: 'Submitted', cell: (r) => fmtDateTime(r.created_at) },
    { key: 'decided', header: 'Decided', cell: (r) => fmtDateTime(r.decided_at) },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (r.status === 'pending' ? <div className="table__actions"><Button size="sm" onClick={() => setCancelId(r.id)}>Cancel</Button></div> : null) },
  ];

  return (
    <div className="stack-4">
      <PageHeader title="Approvals" description="You can never approve your own requests." />
      <Tabs
        label="Approvals"
        idBase="approvals"
        value={tab}
        onChange={setTab}
        tabs={[{ key: 'inbox', label: 'Awaiting me', count: inbox.data?.total }, { key: 'mine', label: 'My requests' }, { key: 'away', label: "While I'm away" }, ...(showStuck ? [{ key: 'stuck' as const, label: 'Stuck' }] : [])]}
      />
      <TabPanel idBase="approvals" tab={tab}>
        {tab === 'inbox' && (
          <QueryState query={inbox} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Inbox />} title="Nothing waiting for you" />}>
            {(d) => <Table label="Awaiting my approval" columns={inboxColumns} rows={d.items} rowKey={(r) => r.id} refreshing={inbox.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setInboxPage }} />}
          </QueryState>
        )}
        {tab === 'mine' && (
          <QueryState query={mine} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Send />} title="You have not submitted any requests" />}>
            {(d) => <Table label="My requests" columns={mineColumns} rows={d.items} rowKey={(r) => r.id} refreshing={mine.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setMinePage }} />}
          </QueryState>
        )}
        {tab === 'away' && <Delegations />}
        {tab === 'stuck' && showStuck && (
          <div className="stack-3">
            <p className="text-sm text-2">Requests nobody can decide, because the person they wait for has gone or cannot act. Reassign them to someone who can.</p>
            <QueryState query={stuck} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Inbox />} title="Nothing is stuck" />}>
              {(d) => <Table label="Stuck requests" columns={stuckColumns} rows={d.items} rowKey={(r) => r.id} refreshing={stuck.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setStuckPage }} />}
            </QueryState>
          </div>
        )}
      </TabPanel>
      {action && (
        <ConfirmDialog
          title={`${action.kind[0]!.toUpperCase()}${action.kind.slice(1)} request`}
          message={action.summary}
          confirmLabel={action.kind === 'approve' ? 'Approve' : action.kind === 'reject' ? 'Reject' : 'Return for correction'}
          danger={action.kind === 'reject'}
          requireComment={action.kind !== 'approve' ? true : undefined}
          onClose={() => setAction(null)}
          onConfirm={async (comment) => {
            const r = await api.post<ApiResponse<'/api/v1/approvals/{id}/act', 'post'>>(`/api/v1/approvals/${action.id}/act`, { action: action.kind, comment: comment || undefined });
            toast(`Request ${r.status}`);
            await invalidateApi('/api/v1/approvals', '/api/v1/dashboard');
          }}
        />
      )}
      {cancelId && (
        <ConfirmDialog
          title="Cancel request"
          message="Withdraw this request? This cannot be undone."
          confirmLabel="Withdraw request"
          danger
          onClose={() => setCancelId(null)}
          onConfirm={async () => { await api.post(`/api/v1/approvals/${cancelId}/cancel`); toast('Request cancelled'); await invalidateApi('/api/v1/approvals'); }}
        />
      )}
      {reassign && <ReassignForm request={reassign} onClose={() => setReassign(null)} />}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
