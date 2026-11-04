import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { qs } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { fmtDate, fmtDateTime, todayLocal } from '../../format';
import { useApiQuery } from '../../lib/query';
import { CASES_URL, categoryLabel, isClosed, STATUS, STATUS_BY_KIND, type CaseKind, type CaseRow } from './types';

const dueDate = (c: CaseRow) => (c.kind === 'posh' ? (c.status === 'report_submitted' ? c.report_due : c.inquiry_due) : c.sla_due);

/** The cases someone handles: every one for HR or the Committee, or those assigned to them. */
export function Handling({ kind, label, onOpen }: { kind: CaseKind; label: string; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('');
  const query = useApiQuery<{ items: CaseRow[] }>(`${CASES_URL}${qs({ kind, scope: 'handling', status })}`, { placeholderData: (p) => p });
  const today = todayLocal();
  const columns: Column<CaseRow>[] = [
    { key: 'reference', header: 'Reference', card: 'title', cell: (c) => <Button variant="link" onClick={() => onOpen(c.id)}>{c.reference}</Button> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'category', header: 'Category', cell: (c) => categoryLabel(c.kind, c.category) },
    { key: 'complainant', header: 'Complainant', cell: (c) => (c.anonymous ? 'Anonymous' : c.complainant_name ?? '—') },
    { key: 'received', header: 'Received', cell: (c) => fmtDateTime(c.received_at) },
    {
      key: 'due', header: kind === 'posh' ? 'Inquiry or report due' : 'Response due', cell: (c) => {
        const due = dueDate(c);
        if (!due || isClosed(c.status)) return '—';
        return due < today ? <Badge tone="danger">Overdue {fmtDate(due)}</Badge> : <Badge>{fmtDate(due)}</Badge>;
      },
    },
    ...(kind === 'grievance' ? [{ key: 'handler', header: 'Handler', cell: (c: CaseRow) => c.assignee_name ?? '—' }] : []),
  ];
  return (
    <div className="stack-3">
      <FilterBar activeCount={status ? 1 : 0} onClear={() => setStatus('')}>
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={STATUS_BY_KIND[kind].map((k) => ({ value: k, label: STATUS[k]! }))} onChange={(e) => setStatus(e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Inbox />} title="No cases" description={status ? 'Try a different status.' : undefined} />}>
        {(d) => <Table label={label} columns={columns} rows={d.items} rowKey={(c) => c.id} refreshing={query.isPlaceholderData} />}
      </QueryState>
    </div>
  );
}
