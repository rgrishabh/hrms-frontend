import { useState } from 'react';
import { History } from 'lucide-react';
import { qs, type Paged } from '../../api';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { fmtDateTime } from '../../format';
import { useApiQuery } from '../../lib/query';

interface Entry { id: string; created_at: string; actor_name: string | null; actor_type: string | null; category: string; action: string; setting_key: string | null; target_type: string | null; change_metadata: unknown }

const CATEGORIES = [{ value: 'auth', label: 'Sign-in' }, { value: 'configuration', label: 'Configuration' }, { value: 'data', label: 'Data' }, { value: 'security', label: 'Security' }, { value: 'access', label: 'Access' }];

const columns: Column<Entry>[] = [
  { key: 'action', header: 'Action', card: 'title', cell: (l) => <span className="settings-wrap">{l.action}</span> },
  { key: 'category', header: 'Category', card: 'status', cell: (l) => <Badge>{l.category}</Badge> },
  { key: 'when', header: 'When', card: 'subtitle', cell: (l) => <span className="nowrap">{fmtDateTime(l.created_at)}</span> },
  { key: 'actor', header: 'Actor', cell: (l) => l.actor_name ?? (l.actor_type === 'device' ? 'Device' : 'System') },
  { key: 'target', header: 'Target', cell: (l) => <span className="mono">{l.setting_key ?? l.target_type ?? '—'}</span> },
  { key: 'details', header: 'Details', cell: (l) => <details className="audit-details"><summary>View</summary><pre className="mono pre-wrap">{JSON.stringify(l.change_metadata, null, 2)}</pre></details> },
];

export function Audit() {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const query = useApiQuery<Paged<Entry>>(`/api/v1/tenant/audit${qs({ category, page, pageSize: 50 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-3">
      <FilterBar activeCount={category ? 1 : 0} onClear={() => { setCategory(''); setPage(1); }}>
        <Select label="Category" hideLabel placeholder="All categories" value={category} options={CATEGORIES} onChange={(e) => { setCategory(e.target.value); setPage(1); }} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<History />} title="No audit entries." />}>
        {(d) => <Table label="Audit history" columns={columns} rows={d.items} rowKey={(l) => l.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
    </div>
  );
}
