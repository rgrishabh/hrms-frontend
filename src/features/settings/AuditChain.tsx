import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { api, qs } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { fmtDateTime, fmtNumber } from '../../format';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';

type ChainRow = ApiItem<'/api/v1/tenant/audit/chain'>;
type Verification = ApiResponse<'/api/v1/tenant/audit/chain/verify'>;

const short = (hash: string | null) => (hash ? `${hash.slice(0, 12)}…` : '—');

const columns: Column<ChainRow>[] = [
  { key: 'seq', header: 'No.', card: 'subtitle', align: 'right', cell: (r) => <span className="tnum">{r.chain_seq ?? '—'}</span> },
  { key: 'action', header: 'Action', card: 'title', cell: (r) => <span className="settings-wrap">{r.action}</span> },
  { key: 'category', header: 'Category', card: 'status', cell: (r) => <Badge>{r.category}</Badge> },
  { key: 'when', header: 'When', cell: (r) => <span className="nowrap">{fmtDateTime(r.created_at)}</span> },
  { key: 'previous', header: 'Previous hash', cell: (r) => <span className="mono" title={r.prev_hash ?? undefined}>{short(r.prev_hash)}</span> },
  { key: 'hash', header: 'Hash', cell: (r) => <span className="mono" title={r.row_hash ?? undefined}>{short(r.row_hash)}</span> },
];

/** The append-only hash chain behind the audit log, and the check that walks it. Owner and Super-admin only, enforced by the server. */
export function AuditChain() {
  const [page, setPage] = useState(1);
  const query = useApiQuery<ApiResponse<'/api/v1/tenant/audit/chain'>>(`/api/v1/tenant/audit/chain${qs({ page, pageSize: 50 })}`, { placeholderData: (p) => p });
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try { setResult(await api.get<Verification>('/api/v1/tenant/audit/chain/verify')); } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <p className="text-sm text-2">Each entry carries a hash of the one before it, so a change to an old entry shows up here.</p>
        <Button variant="primary" loading={busy} onClick={() => void verify()}>Verify chain</Button>
      </div>
      <InlineError error={error} />
      {result && (result.ok
        ? <Alert tone="ok" live>The chain is intact. {fmtNumber(result.checked)} entries checked.</Alert>
        : <div role="alert"><Alert tone="warn">The chain is broken at entry {result.brokenAt}: {result.reason}. {fmtNumber(result.checked)} entries checked.</Alert></div>)}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Link2 />} title="No entries in the chain yet." />}>
        {(d) => <Table label="Audit chain" columns={columns} rows={d.items} rowKey={(r) => r.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
    </div>
  );
}
