import { Link, useSearchParams } from 'react-router-dom';
import { InlineError } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Catalogue, SentToMe } from '../features/reports/Catalogue';
import { ReportView, SnapshotView } from '../features/reports/ReportView';
import { SavedReports } from '../features/reports/SavedReports';
import type { ReportInfo } from '../features/reports/types';
import { useApiQuery } from '../lib/query';
import '../features/reports/Reports.css';

export function Reports() {
  const [params] = useSearchParams();
  const key = params.get('r');
  const snapshot = params.get('snapshot');
  const query = useApiQuery<{ items: ReportInfo[]; today: string; advanced: boolean }>('/api/v1/reports');
  return (
    <div className="stack-4">
      <PageHeader title="Reports" description="Headcount, attrition, attendance, leave, pay and compliance reports. View on screen or download as Excel or CSV; downloads are recorded." />
      <QueryState query={query}>
        {(d) => {
          if (snapshot) return <SnapshotView id={snapshot} />;
          if (!d.items.length) return <EmptyState title="No reports are available for your role." />;
          const def = key ? d.items.find((i) => i.key === key) : undefined;
          if (key && !def) return <div className="stack-3"><InlineError error="This report is not available to you." /><div><Link to="/reports">All reports</Link></div></div>;
          if (def) return <ReportView key={def.key} def={def} advanced={d.advanced} />;
          return (
            <div className="stack-6">
              {d.advanced && <SentToMe />}
              {d.advanced && <SavedReports items={d.items} />}
              <Catalogue items={d.items} />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
