import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { fmtDate } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { ChecklistDetail, reloadLifecycle } from './Checklist';
import type { ChecklistRow } from './types';

const INITIAL = { filters: { status: 'open' } };

export function Onboarding() {
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const columns = useMemo<Column<ChecklistRow>[]>(() => [
    { key: 'employee', header: 'Employee', required: true, card: 'title', cell: (c) => <><Button variant="link" onClick={() => setOpen(c.id)}>{c.employee_name}</Button><div className="table__cell-sub mono">{c.employee_code}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'joining', header: 'Joining', cell: (c) => fmtDate(c.anchor_date) },
    { key: 'progress', header: 'Progress', align: 'right', cell: (c) => `${c.done}/${c.tasks}` },
    { key: 'overdue', header: 'Overdue', align: 'right', cell: (c) => (c.overdue ? <Badge tone="danger">{c.overdue} overdue</Badge> : '—') },
  ], []);
  const table = useTableState('lifecycle.onboarding', columns, INITIAL);
  const status = table.filters['status'] ?? '';
  const query = useApiQuery<ApiResponse<'/api/v1/lifecycle/checklists'>>(`/api/v1/lifecycle/checklists${qs({ kind: 'onboarding', status, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-4">
      <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters} actions={can('lifecycle.manage') && <Button variant="primary" onClick={() => setStarting(true)}>Start onboarding</Button>}>
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={[{ value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} onChange={(e) => table.setFilter('status', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ClipboardList />} title="No onboarding checklists" description="New hires from Recruitment get one automatically once a default template exists." />}>
        {(d) => <Table label="Onboarding checklists" columns={columns} rows={d.items} rowKey={(c) => c.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {starting && <StartForm onClose={() => setStarting(false)} onStarted={(id) => { setStarting(false); setOpen(id); }} />}
      {open && <ChecklistDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StartForm({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const form = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/lifecycle/checklists', 'post'>>('/api/v1/lifecycle/checklists', { employeeId: employee!.id });
    toast('Onboarding started; owners notified');
    await reloadLifecycle();
    onStarted(r.id);
  }, { validate: (): Record<string, string> => (employee ? {} : { employeeId: 'Choose an employee.' }) });
  return (
    <Modal title="Start onboarding" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <EmployeeField required error={form.errors['employeeId']} value={employee} onChange={setEmployee} />
        <p className="text-xs text-3">Uses the default onboarding template. Due dates count from the employee's joining date.</p>
        <FormActions error={form.error} busy={form.busy} submitLabel="Start" onCancel={onClose} />
      </form>
    </Modal>
  );
}
