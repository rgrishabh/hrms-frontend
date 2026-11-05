import { BookOpenCheck } from 'lucide-react';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { fmtDate, fmtDateOfInstant } from '../../format';
import { useApiQuery } from '../../lib/query';
import { CATEGORY, POLICIES_URL, type MyPolicies as Mine, type MyPolicy } from './types';

function AckStatus({ policy, today }: { policy: MyPolicy; today: string }) {
  if (!policy.requires_ack) return <Badge>For information</Badge>;
  if (policy.acknowledged_at) return <Badge tone="ok">Acknowledged {fmtDateOfInstant(policy.acknowledged_at)}</Badge>;
  return <Badge tone={policy.due_on && policy.due_on < today ? 'danger' : 'warn'}>Due {fmtDate(policy.due_on)}</Badge>;
}

export function MyPolicies({ onOpen }: { onOpen: (versionId: string) => void }) {
  const query = useApiQuery<Mine>(`${POLICIES_URL}/mine`);
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<BookOpenCheck />} title="No policies have been published for you yet." />}>
      {(d) => {
        const columns: Column<MyPolicy>[] = [
          { key: 'policy', header: 'Policy', card: 'title', cell: (p) => <><Button variant="link" onClick={() => onOpen(p.id)}>{p.title}</Button><div className="table__cell-sub">{p.change_summary}</div></> },
          { key: 'status', header: 'Status', card: 'status', cell: (p) => <AckStatus policy={p} today={d.date} /> },
          { key: 'category', header: 'Category', cell: (p) => CATEGORY[p.category] ?? p.category },
          { key: 'version', header: 'Version', cell: (p) => `v${p.version_no}` },
          { key: 'effective', header: 'Effective', cell: (p) => fmtDate(p.effective_from) },
        ];
        const message = `${d.pending} ${d.pending === 1 ? 'policy needs' : 'policies need'} your acknowledgement${d.overdue ? ` (${d.overdue} overdue)` : ''}.`;
        return (
          <div className="stack-3">
            {d.pending > 0 && <Alert tone="warn">{message}</Alert>}
            <Table label="My policies" columns={columns} rows={d.items} rowKey={(p) => p.id} />
          </div>
        );
      }}
    </QueryState>
  );
}
