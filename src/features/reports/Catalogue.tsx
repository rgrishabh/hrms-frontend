import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { QueryState } from '../../components/QueryState';
import { Skeleton } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { fmtDateTime, fmtNumber } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import type { ReportInfo, Snapshot } from './types';

const SENT_COLUMNS: Column<Snapshot>[] = [
  { key: 'name', header: 'Report', card: 'title', cell: (s) => <Link to={`/reports?snapshot=${s.id}`}>{s.name}</Link> },
  { key: 'owner', header: 'From', cell: (s) => s.owner },
  { key: 'generated', header: 'Generated', cell: (s) => fmtDateTime(s.generated_at) },
  { key: 'rows', header: 'Rows', align: 'right', cell: (s) => fmtNumber(s.row_count) },
];

/** Scheduled copies other people sent. Nothing at all when there are none: this is an extra on the catalogue. */
export function SentToMe() {
  const query = useApiQuery<ApiResponse<'/api/v1/reports/snapshots'>>('/api/v1/reports/snapshots');
  return (
    <QueryState query={query} compact loading={<Skeleton height="block" />} isEmpty={(d) => !d.items.length}>
      {(d) => (
        <section className="stack-3" aria-labelledby="reports-sent">
          <h2 id="reports-sent">Sent to me</h2>
          <Table label="Reports sent to me" columns={SENT_COLUMNS} rows={d.items.slice(0, 10)} rowKey={(s) => s.id} />
        </section>
      )}
    </QueryState>
  );
}

export function Catalogue({ items }: { items: readonly ReportInfo[] }) {
  const groups = [...new Set(items.map((i) => i.category))];
  return (
    <div className="stack-6">
      {groups.map((g) => (
        <section key={g} aria-label={g} className="stack-3">
          <h2>{g}</h2>
          <ul className="report-grid list-plain">
            {items.filter((i) => i.category === g).map((i) => (
              <li key={i.key} className="report-tile" data-record>
                <span className="cluster">
                  <Link className="report-tile__link" to={`/reports?r=${i.key}`}>{i.name}</Link>
                  {i.scope === 'team' && <Badge tone="info">Your team</Badge>}
                </span>
                <span className="text-sm text-2">{i.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
