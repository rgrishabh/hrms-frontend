import { CalendarClock } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { fmtDateTime } from '../../format';
import { useApiQuery } from '../../lib/query';
import { KINDS, personName, type MyInterview } from './types';

const feedbackBadge = (i: MyInterview) => (i.submitted_at ? <Badge tone="ok">Submitted</Badge> : new Date(i.scheduled_at) > new Date() ? <Badge>Upcoming</Badge> : <Badge tone="warn">Due</Badge>);

export function MyInterviews({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const query = useApiQuery<{ items: MyInterview[] }>('/api/v1/recruitment/interviews/mine');
  const columns: Column<MyInterview>[] = [
    { key: 'candidate', header: 'Candidate', card: 'title', cell: (i) => <Button variant="link" onClick={() => onOpenApp(i.application_id)}>{personName(i)}</Button> },
    { key: 'feedback', header: 'Your feedback', card: 'status', cell: feedbackBadge },
    { key: 'when', header: 'When', cell: (i) => <>{fmtDateTime(i.scheduled_at)}{i.location && <div className="table__cell-sub">{i.location}</div>}</> },
    { key: 'position', header: 'Position', cell: (i) => <><span className="mono">{i.requisition_code}</span> {i.requisition_title}</> },
    { key: 'round', header: 'Round', cell: (i) => `${i.round} · ${KINDS[i.kind] ?? i.kind}` },
  ];
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<CalendarClock />} title="You are not on any interview panel" />}>
      {(d) => <Table label="My interviews" columns={columns} rows={d.items} rowKey={(i) => i.id} />}
    </QueryState>
  );
}
