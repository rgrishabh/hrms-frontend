import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useAction } from '../../components/useSubmit';
import { fmtDate } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import { ChecklistDetail, reloadLifecycle } from './Checklist';
import { OWNER, type MyTask } from './types';

export function MyTasks() {
  const { can } = useAuth();
  const { run, isBusy } = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const query = useApiQuery<ApiResponse<'/api/v1/lifecycle/tasks/mine'>>('/api/v1/lifecycle/tasks/mine');
  const today = query.data?.date ?? '';
  // Only lifecycle.manage may reopen, so only they get the undo.
  const undo = (t: MyTask) => (can('lifecycle.manage') ? { label: 'Undo', onClick: () => void run(t.id, async () => { await api.post(`/api/v1/lifecycle/tasks/${t.id}/reopen`, {}); await reloadLifecycle(); }, 'Reopened') } : undefined);
  const columns: Column<MyTask>[] = [
    { key: 'task', header: 'Task', card: 'title', cell: (t) => <>{t.title}{t.description && <div className="table__cell-sub">{t.description}</div>}</> },
    { key: 'due', header: 'Due', card: 'status', cell: (t) => <Badge tone={t.due_date < today ? 'danger' : t.due_date === today ? 'warn' : 'neutral'}>{t.due_date < today ? 'Overdue ' : ''}{fmtDate(t.due_date)}</Badge> },
    { key: 'for', header: 'For', cell: (t) => <Button variant="link" onClick={() => setOpen(t.checklist_id)}>{t.employee_name}</Button> },
    { key: 'checklist', header: 'Checklist', cell: (t) => `${t.kind === 'onboarding' ? 'Onboarding' : 'Exit clearance'} · ${OWNER[t.owner] ?? t.owner}` },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (t) => <div className="table__actions"><Button size="sm" variant="primary" loading={isBusy(t.id)} onClick={() => void run(t.id, async () => { await api.post(`/api/v1/lifecycle/tasks/${t.id}/done`, {}); await reloadLifecycle(); }, 'Done', undo(t))}>Mark done</Button></div> },
  ];
  return (
    <>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ListChecks />} title="No open tasks for you" />}>
        {(d) => <Table label="My tasks" columns={columns} rows={d.items} rowKey={(t) => t.id} />}
      </QueryState>
      {open && <ChecklistDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
