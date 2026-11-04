import { GraduationCap, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth';
import { Badge, StatusBadge, statusLabel } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { fmtDate } from '../../format';
import { useApiQuery } from '../../lib/query';
import { ACTIVITY, AUTH_URL, validityTone, type Mine, type MyAuthorization, type MyTraining } from './types';

const authColumns: Column<MyAuthorization>[] = [
  { key: 'method', header: 'Method', card: 'title', cell: (a) => <><span className="mono">{a.method_code}</span> {a.method_name}{a.standard_ref && <div className="table__cell-sub">{a.standard_ref}</div>}</> },
  { key: 'status', header: 'Status', card: 'status', cell: (a) => <StatusBadge status={a.status} /> },
  { key: 'activity', header: 'Activity', cell: (a) => ACTIVITY[a.activity] ?? a.activity },
  { key: 'since', header: 'Since', cell: (a) => fmtDate(a.valid_from) },
  { key: 'due', header: 'Review due', cell: (a) => fmtDate(a.review_due) },
];

const trainingColumns: Column<MyTraining>[] = [
  { key: 'course', header: 'Course', card: 'title', cell: (t) => <><span className="mono">{t.course_code}</span> {t.course_name}</> },
  { key: 'status', header: 'Status', card: 'status', cell: (t) => <Badge tone={validityTone(t.validity)}>{statusLabel(t.validity)}</Badge> },
  { key: 'completed', header: 'Completed', cell: (t) => fmtDate(t.completed_on) },
  { key: 'until', header: 'Valid until', cell: (t) => (t.expires_on ? fmtDate(t.expires_on) : 'No expiry') },
];

export function MyCompetence() {
  const { hasFeature } = useAuth();
  const lab = hasFeature('FEATURE_LAB_COMPETENCY');
  const query = useApiQuery<Mine>(`${AUTH_URL}/me`);
  return (
    <QueryState query={query}>
      {(d) => (
        <div className="stack-4">
          {lab && (
            <Card title="My technical authorizations" flush>
              {d.authorizations.length
                ? <Table label="My technical authorizations" columns={authColumns} rows={d.authorizations} rowKey={(a) => a.id} />
                : <EmptyState compact icon={<ShieldCheck />} title="No authorizations yet" description="Your laboratory manager records competency assessments, and quality grants authorizations." />}
            </Card>
          )}
          <Card title="My training" flush>
            {d.training.length
              ? <Table label="My training" columns={trainingColumns} rows={d.training} rowKey={(t) => t.id} />
              : <EmptyState compact icon={<GraduationCap />} title="No training recorded" />}
          </Card>
        </div>
      )}
    </QueryState>
  );
}
