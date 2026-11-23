import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { qs } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { useDebouncedValue } from '../../components/hooks';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useTableState } from '../../components/useTableState';
import { fmtDate, todayLocal } from '../../format';
import { useApiQuery } from '../../lib/query';
import { AssetForm, AssetHistory, IssueForm, ReceiveForm } from './AssetForms';
import { useAssetTerms, type AssetTerms } from './terms';
import { ASSETS_URL, STATUS, type Asset, type AssetPage } from './types';
import './Assets.css';

/** Days from today to a YYYY-MM-DD date; negative is past. */
const daysTo = (d: string, today: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

function DueBadge({ due, today, terms }: { due: string | null; today: string; terms: AssetTerms }) {
  if (!due) return <span className="text-3">—</span>;
  const n = daysTo(due, today);
  return <Badge tone={n < 0 ? 'danger' : n <= 30 ? 'warn' : 'neutral'}>{fmtDate(due)}{n < 0 ? ` · ${terms.overdueWord}` : n <= 30 ? ` · ${n} d` : ''}</Badge>;
}

type Dialog = { kind: 'edit' | 'issue' | 'receive' | 'history'; asset: Asset } | { kind: 'add' };

export function AssetRegister() {
  const terms = useAssetTerms();
  const table = useTableState<Asset>('assets', [], { filters: { search: '', status: '', category: '', due: '' } });
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const { setFilter } = table;
  useEffect(() => { setFilter('search', debounced); }, [debounced, setFilter]);
  const { status, category, due } = table.filters;
  const query = useApiQuery<AssetPage>(`${ASSETS_URL}${qs({ search: table.filters['search'], status, category, calibrationWithinDays: due, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const today = query.data?.today ?? todayLocal();
  const close = () => setDialog(null);
  const columns: Column<Asset>[] = [
    { key: 'tag', header: 'Tag', card: 'title', cell: (x) => <strong className="mono asset-tag">{x.tag}</strong> },
    { key: 'name', header: 'Asset', card: 'subtitle', cell: (x) => <>{x.name}{x.serial_number && <div className="table__cell-sub">S/N {x.serial_number}</div>}</> },
    { key: 'category', header: 'Category', cell: (x) => terms.categoryLabel(x.category) },
    { key: 'location', header: 'Location', cell: (x) => x.branch_name ?? '—' },
    { key: 'due', header: terms.dueLabel, cell: (x) => <DueBadge due={x.calibration_due} today={today} terms={terms} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (x) => <StatusBadge status={x.status === 'assigned' ? 'issued' : x.status} /> },
    { key: 'holder', header: 'Holder', cell: (x) => (x.holder_name ? <>{x.holder_name}<div className="table__cell-sub">since {fmtDate(x.issued_at)}{!x.acknowledged_at && ' · receipt not confirmed'}</div></> : '—') },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (x) => (
        <div className="table__actions">
          {x.status === 'available' && <Button size="sm" variant="primary" onClick={() => setDialog({ kind: 'issue', asset: x })}>Issue</Button>}
          {x.status === 'assigned' && <Button size="sm" onClick={() => setDialog({ kind: 'receive', asset: x })}>Receive</Button>}
          <Button size="sm" onClick={() => setDialog({ kind: 'edit', asset: x })}>Edit</Button>
          <Button size="sm" onClick={() => setDialog({ kind: 'history', asset: x })}>History</Button>
        </div>
      ),
    },
  ];
  return (
    <div className="stack-3">
      <FilterBar
        search={{ label: 'Search', placeholder: 'Tag, name or serial', value: search, onChange: setSearch }}
        activeCount={table.activeFilterCount}
        onClear={() => { setSearch(''); table.clearFilters(); }}
        actions={<Button variant="primary" onClick={() => setDialog({ kind: 'add' })}>Add asset</Button>}
      >
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} onChange={(e) => table.setFilter('status', e.target.value)} />
        <Select label="Category" hideLabel placeholder="Any category" value={category} options={terms.categoryOptions()} onChange={(e) => table.setFilter('category', e.target.value)} />
        <Select label={terms.dueFilter} hideLabel placeholder={`${terms.dueFilter}: any`} value={due} options={[{ value: '0', label: terms.lab ? 'Expired or due today' : 'Overdue or due today' }, { value: '30', label: 'Due within 30 days' }, { value: '90', label: 'Due within 90 days' }]} onChange={(e) => table.setFilter('due', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Package />} title={table.activeFilterCount ? 'No assets match' : 'No assets yet'} description={table.activeFilterCount ? 'Try clearing the filters.' : 'Add the first asset to track who holds it.'} />}>
        {(d) => <Table label="Asset register" columns={columns} rows={d.items} rowKey={(x) => x.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {dialog?.kind === 'add' && <AssetForm asset={null} onClose={close} />}
      {dialog?.kind === 'edit' && <AssetForm asset={dialog.asset} onClose={close} />}
      {dialog?.kind === 'issue' && <IssueForm asset={dialog.asset} today={today} onClose={close} />}
      {dialog?.kind === 'receive' && <ReceiveForm asset={dialog.asset} today={today} onClose={close} />}
      {dialog?.kind === 'history' && <AssetHistory asset={dialog.asset} onClose={close} />}
    </div>
  );
}
