import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { OWNER, type Checklist, type ChecklistTask } from './types';

export const reloadLifecycle = () => invalidateApi('/api/v1/lifecycle', '/api/v1/dashboard');

export function ChecklistDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { run, isBusy } = useAction();
  const query = useApiQuery<Checklist>(`/api/v1/lifecycle/checklists/${id}`, { staleTime: 0 });
  const c = query.data;
  const manage = can('lifecycle.manage');
  const [skip, setSkip] = useState<ChecklistTask | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [joining, setJoining] = useState(false);
  const reopen = (t: ChecklistTask) => run(t.id, async () => { await api.post(`/api/v1/lifecycle/tasks/${t.id}/reopen`, {}); await reloadLifecycle(); }, 'Reopened');
  const columns: Column<ChecklistTask>[] = [
    { key: 'task', header: 'Task', card: 'title', cell: (t) => <>{t.title}{t.note && <div className="table__cell-sub">{t.note}</div>}</> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'owner', header: 'Owner', cell: (t) => OWNER[t.owner] ?? t.owner },
    { key: 'due', header: 'Due', cell: (t) => fmtDate(t.due_date) },
    { key: 'by', header: 'Completed by', cell: (t) => (t.done_by_name ? <span className="text-sm">{t.done_by_name} · {fmtDateTime(t.done_at)}</span> : '—') },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (t) => (
        <div className="table__actions">
          {t.status === 'pending' && t.canAct && c?.status === 'open' && <Button size="sm" variant="primary" loading={isBusy(t.id)} aria-label={`Done: ${t.title}`} onClick={() => void run(t.id, async () => { await api.post(`/api/v1/lifecycle/tasks/${t.id}/done`, {}); await reloadLifecycle(); }, 'Done', manage ? { label: 'Undo', onClick: () => void reopen(t) } : undefined)}>Done</Button>}
          {t.status === 'pending' && manage && t.canAct && c?.status === 'open' && <Button size="sm" onClick={() => setSkip(t)}>Skip</Button>}
          {t.status !== 'pending' && manage && t.canAct && <Button size="sm" loading={isBusy(t.id)} onClick={() => void reopen(t)}>Reopen</Button>}
        </div>
      ),
    },
  ];
  return (
    <Modal title={c ? `${c.kind === 'onboarding' ? 'Onboarding' : 'Exit clearance'} — ${c.employee.name}` : 'Checklist'} size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster-between">
              <span className="cluster"><StatusBadge status={d.status} /><span className="text-sm text-2">{d.kind === 'onboarding' ? 'Joining' : 'Last working day'} {fmtDate(d.anchor_date)}</span></span>
              <div className="cluster">
                {d.kind === 'onboarding' && d.employee.status === 'pre_joining' && manage && <Button size="sm" variant="primary" onClick={() => setJoining(true)}>Confirm joining</Button>}
                {d.kind === 'onboarding' && !d.separation_id && d.status === 'open' && manage && <Button size="sm" variant="danger-ghost" onClick={() => setCancelling(true)}>Cancel checklist</Button>}
              </div>
            </div>
            <Table label="Checklist tasks" columns={columns} rows={d.tasks} rowKey={(t) => t.id} />
          </div>
        )}
      </QueryState>
      {skip && (
        <ConfirmDialog
          title="Skip task"
          requireComment
          confirmLabel="Skip"
          message={`Why is "${skip.title}" not needed?`}
          onClose={() => setSkip(null)}
          onConfirm={async (note) => {
            await api.post(`/api/v1/lifecycle/tasks/${skip.id}/skip`, { note });
            const task = skip;
            toast('Skipped', 'ok', { label: 'Undo', onClick: () => void reopen(task) });
            await reloadLifecycle();
          }}
        />
      )}
      {cancelling && c && (
        <ConfirmDialog
          title="Cancel onboarding"
          danger
          requireComment
          confirmLabel="Cancel onboarding"
          message={`Stop the onboarding checklist for ${c.employee.name}? Open tasks stop reminding their owners. The reason is kept in the audit history.`}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => { await api.post(`/api/v1/lifecycle/checklists/${id}/cancel`, { reason }); toast('Checklist cancelled'); await reloadLifecycle(); }}
        />
      )}
      {joining && c && (
        <ConfirmDialog
          title="Confirm joining"
          confirmLabel="Confirm joining"
          message={`${c.employee.name} becomes an active employee.`}
          onClose={() => setJoining(false)}
          onConfirm={async () => { await api.post(`/api/v1/lifecycle/employees/${c.employee.id}/joined`); toast('Joining confirmed; employee is active'); await invalidateApi('/api/v1/lifecycle', '/api/v1/employees'); }}
        />
      )}
    </Modal>
  );
}
