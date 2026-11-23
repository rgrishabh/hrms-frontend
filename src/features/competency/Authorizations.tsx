import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useTableState } from '../../components/useTableState';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { ACTIVITY, APPROACH, AUTH_URL, type AuthorizationDetailData, type AuthorizationPage, type AuthorizationRow } from './types';

const SHOW = [{ value: 'in_force', label: 'In force or suspended' }, { value: 'pending', label: 'Awaiting approval' }, { value: 'review_due', label: 'Review due in 30 days' }, { value: 'suspended', label: 'Suspended' }, { value: 'ended', label: 'Ended' }, { value: 'all', label: 'All' }];
const INITIAL = { filters: { status: 'in_force' } };

export function Authorizations() {
  const [open, setOpen] = useState<string | null>(null);
  const columns: Column<AuthorizationRow>[] = [
    { key: 'employee', header: 'Employee', card: 'title', required: true, cell: (a) => <><Button variant="link" onClick={() => setOpen(a.id)}>{a.employee_name}</Button> <span className="table__cell-sub mono">{a.employee_code}</span></> },
    { key: 'status', header: 'Status', card: 'status', cell: (a) => <StatusBadge status={a.status} /> },
    { key: 'method', header: 'Method', cell: (a) => <><span className="mono">{a.method_code}</span> {a.method_name}</> },
    { key: 'activity', header: 'Activity', cell: (a) => ACTIVITY[a.activity] ?? a.activity },
    { key: 'due', header: 'Review due', cell: (a) => fmtDate(a.review_due) },
    { key: 'training', header: 'Training', cell: (a) => (a.missing_training ? <Badge tone="danger">{a.missing_training} lapsed</Badge> : <Badge tone="ok">OK</Badge>) },
  ];
  const table = useTableState('competency-authorizations', columns, INITIAL);
  const status = table.filters['status'] ?? 'in_force';
  const query = useApiQuery<AuthorizationPage>(`${AUTH_URL}/authorizations${qs({ status: status === 'all' ? undefined : status, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-3">
      <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters}>
        <Select label="Show" hideLabel value={status} options={SHOW} onChange={(e) => table.setFilter('status', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ShieldCheck />} title="Nothing to show" description="Try a different filter." />}>
        {(d) => <Table label="Technical authorizations" columns={columns} rows={d.items} rowKey={(a) => a.id} hidden={table.hidden} onToggleColumn={table.toggleColumn} views={table.views} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {open && <AuthorizationDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Transition = 'suspend' | 'reinstate' | 'withdraw';
const TRANSITION: Record<Transition, { title: string; label: string; message: string; danger?: boolean }> = {
  suspend: { title: 'Suspend authorization', label: 'Suspend', message: 'The person cannot use this authorization until it is reinstated. They will be notified with your reason.' },
  reinstate: { title: 'Reinstate authorization', label: 'Reinstate', message: 'The authorization comes back into force. The person will be notified with your reason.' },
  withdraw: { title: 'Withdraw authorization', label: 'Withdraw', danger: true, message: 'This ends the authorization. A new assessment and approval are needed to grant it again. The person will be notified with your reason.' },
};

function AuthorizationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const query = useApiQuery<AuthorizationDetailData>(`${AUTH_URL}/authorizations/${id}`);
  const [act, setAct] = useState<Transition | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const refresh = () => invalidateApi(`${AUTH_URL}/authorizations`, `${AUTH_URL}/matrix`);
  const a = query.data;
  const mayDecide = !!a && can('competency.authorize') && a.employee_id !== me?.user.employeeId;
  const mayCancel = !!a && a.status === 'pending' && can('competency.assess') && a.requested_by === me?.user.id;
  return (
    <Modal title="Technical authorization" onClose={onClose}>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster-between"><strong>{d.employee_name}</strong><StatusBadge status={d.status} /></div>
            <KeyValue items={[{ label: 'Method', value: <><span className="mono">{d.method_code}</span> <span>{d.method_name}</span></> }, { label: 'Activity', value: ACTIVITY[d.activity] ?? d.activity }, { label: 'Review due', value: fmtDate(d.review_due) }]} />
            {d.check && <Alert tone={d.check.authorized ? 'ok' : 'warn'}>{d.check.authorized ? `In force today, review due ${fmtDate(d.check.reviewDue)}.` : `Not in force: ${d.check.reasons.join('; ')}.`}</Alert>}
            {d.assessment && (
              <div className="stack-1">
                <h3>Assessment</h3>
                <p className="text-sm text-2">{APPROACH[d.assessment.approach] ?? d.assessment.approach}, {fmtDate(d.assessment.assessed_on)}, by {d.assessment.assessor_name}</p>
                <p className="pre-wrap">{d.assessment.evidence}</p>
              </div>
            )}
            <div className="stack-1">
              <h3>History</h3>
              {d.events.length
                ? <ul className="list-plain history-list">{d.events.map((e, i) => <li key={i}><span className="text-2 tnum">{fmtDateTime(e.at)}</span> · {e.action} · {e.actor_name ?? 'Scheduled review'}{e.reason ? `: ${e.reason}` : ''}</li>)}</ul>
                : <p className="text-sm text-2">Nothing recorded yet.</p>}
            </div>
            {(mayCancel || mayDecide) && (
              <div className="cluster">
                {mayCancel && <Button onClick={() => setCancelling(true)}>Cancel request</Button>}
                {mayDecide && d.status === 'authorized' && <Button onClick={() => setAct('suspend')}>Suspend</Button>}
                {mayDecide && d.status === 'suspended' && <Button onClick={() => setAct('reinstate')}>Reinstate</Button>}
                {mayDecide && ['authorized', 'suspended'].includes(d.status) && <Button variant="danger-ghost" onClick={() => setAct('withdraw')}>Withdraw</Button>}
              </div>
            )}
          </div>
        )}
      </QueryState>
      {act && (
        <ConfirmDialog
          title={TRANSITION[act].title}
          message={TRANSITION[act].message}
          confirmLabel={TRANSITION[act].label}
          danger={TRANSITION[act].danger}
          requireComment
          onClose={() => setAct(null)}
          onConfirm={async (reason) => { await api.post(`${AUTH_URL}/authorizations/${id}/${act}`, { reason }); toast('Saved; the employee has been notified'); await refresh(); }}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel authorization request"
          message="The request is withdrawn from quality approval. The assessment stays on record."
          confirmLabel="Cancel request"
          onClose={() => setCancelling(false)}
          onConfirm={async () => { await api.post(`${AUTH_URL}/authorizations/${id}/cancel`); toast('Request cancelled'); await refresh(); }}
        />
      )}
    </Modal>
  );
}
