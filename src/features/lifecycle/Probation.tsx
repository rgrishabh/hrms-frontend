import { useMemo, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { fmtDate } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import { reloadLifecycle } from './Checklist';
import { options, RECOMMENDATION, type ProbationRow } from './types';

const INITIAL = { filters: { status: 'open' } };

export function Probation() {
  const { me } = useAuth();
  const [review, setReview] = useState<ProbationRow | null>(null);
  const columns = useMemo<Column<ProbationRow>[]>(() => [
    { key: 'employee', header: 'Employee', card: 'title', cell: (r) => <>{r.employee_name}<div className="table__cell-sub"><span className="mono">{r.employee_code}</span>{r.designation ? ` · ${r.designation}` : ''}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'joined', header: 'Joined', cell: (r) => fmtDate(r.date_of_joining) },
    { key: 'ends', header: 'Probation ends', cell: (r) => fmtDate(r.probation_end) },
    { key: 'recommendation', header: 'Recommendation', cell: (r) => (r.recommendation ? <>{RECOMMENDATION[r.recommendation]}{r.extend_months ? ` (${r.extend_months} months)` : ''}{r.comments && <div className="table__cell-sub">{r.comments}</div>}</> : '—') },
    // Nobody reviews their own probation; the server refuses it.
    { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (r.status === 'open' && r.employee_id !== me?.user.employeeId ? <div className="table__actions"><Button size="sm" variant="primary" onClick={() => setReview(r)}>Recommend</Button></div> : null) },
  ], [me?.user.employeeId]);
  const table = useTableState('lifecycle.probation', columns, INITIAL);
  const status = table.filters['status'] ?? '';
  const query = useApiQuery<ApiResponse<'/api/v1/lifecycle/probation'>>(`/api/v1/lifecycle/probation${qs({ status })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-4">
      <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters}>
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={[{ value: 'open', label: 'Waiting for recommendation' }, { value: 'pending', label: 'Waiting for HR' }, { value: 'approved', label: 'Decided' }]} onChange={(e) => table.setFilter('status', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<UserCheck />} title="No probation reviews" />}>
        {(d) => <Table label="Probation reviews" columns={columns} rows={d.items} rowKey={(r) => r.id} refreshing={query.isPlaceholderData} />}
      </QueryState>
      {review && <RecommendForm review={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function RecommendForm({ review, onClose }: { review: ProbationRow; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ recommendation: 'confirm', extendMonths: 3 as number | string, comments: '' });
  const form = useSubmit(async () => {
    await api.post(`/api/v1/lifecycle/probation/${review.id}/submit`, { recommendation: f.recommendation, comments: f.comments, extendMonths: f.recommendation === 'extend' ? Number(f.extendMonths) : null });
    toast('Sent to HR for approval');
    await reloadLifecycle();
    onClose();
  }, { validate: (): Record<string, string> => (f.comments.trim().length < 10 ? { comments: 'Write at least 10 characters.' } : {}) });
  return (
    <Modal title={`Probation — ${review.employee_name}`} onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Select label="Recommendation" value={f.recommendation} options={options(RECOMMENDATION)} onChange={(e) => setF({ ...f, recommendation: e.target.value })} />
        {f.recommendation === 'extend' && <Input label="Extend by (months)" type="number" inputMode="numeric" min={1} max={6} required error={form.errors['extendMonths']} value={f.extendMonths} onChange={(e) => setF({ ...f, extendMonths: e.target.value })} />}
        <Textarea label="Comments" hint="Evidence: performance against goals, training completed, conduct" required rows={5} error={form.errors['comments']} value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Submit" onCancel={onClose} />
      </form>
    </Modal>
  );
}
