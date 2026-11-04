import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { qs } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useApiQuery } from '../../lib/query';
import { ReviewDetail } from './ReviewDetail';
import { REVIEW_STATUS, type Cycle, type ReviewRow } from './types';

const STATUS_OPTIONS = Object.entries(REVIEW_STATUS).map(([value, label]) => ({ value, label }));

export function ReviewList({ cycle, scope }: { cycle: Cycle; scope: 'team' | 'all' }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const query = useApiQuery<{ items: ReviewRow[] }>(`/api/v1/performance/reviews${qs({ cycleId: cycle.id, scope })}`);
  const columns: Column<ReviewRow>[] = [
    { key: 'employee', header: 'Employee', card: 'title', cell: (r) => <><Button variant="link" onClick={() => setOpen(r.id)}>{r.employee_name}</Button><div className="table__cell-sub mono">{r.employee_code}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'designation', header: 'Designation', cell: (r) => r.designation ?? '—' },
    ...(scope === 'all' ? [{ key: 'reviewer', header: 'Reviewer', cell: (r: ReviewRow) => r.reviewer_name ?? <Badge tone="warn">No manager</Badge> }] : []),
    { key: 'self', header: 'Self', align: 'right', cell: (r) => r.self_rating ?? '—' },
    { key: 'manager', header: 'Manager', align: 'right', cell: (r) => r.manager_rating ?? '—' },
    { key: 'final', header: 'Final', align: 'right', cell: (r) => r.final_rating ?? '—' },
  ];
  return (
    <div className="stack-4">
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ClipboardCheck />} title="No reviews in this cycle" />}>
        {(d) => {
          const needle = search.trim().toLowerCase();
          const items = d.items.filter((r) => (!status || r.status === status) && (!needle || `${r.employee_name} ${r.employee_code}`.toLowerCase().includes(needle)));
          const counts = d.items.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
          return (
            <>
              <div className="cluster" role="group" aria-label="Reviews by status">{Object.entries(REVIEW_STATUS).map(([k, label]) => <Badge key={k}>{label}: {counts[k] ?? 0}</Badge>)}</div>
              <FilterBar search={{ label: 'Search', placeholder: 'Name or code', value: search, onChange: setSearch }} activeCount={status ? 1 : 0} onClear={() => setStatus('')}>
                <Select label="Status" hideLabel placeholder="Any status" value={status} options={STATUS_OPTIONS} onChange={(e) => setStatus(e.target.value)} />
              </FilterBar>
              {items.length
                ? <Table label={scope === 'team' ? 'My team reviews' : 'All reviews'} columns={columns} rows={items} rowKey={(r) => r.id} />
                : <EmptyState compact title="No reviews match" description="Try a different search or clear the filter." />}
            </>
          );
        }}
      </QueryState>
      {open && <Modal title="Performance review" size="lg" onClose={() => setOpen(null)}><ReviewDetail id={open} selfReview={cycle.self_review} /></Modal>}
    </div>
  );
}
