import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';
import { ButtonLink } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { StatGrid, StatTile } from '../components/StatTile';
import { PunchCard } from '../features/attendance/PunchCard';
import { SummaryBlocks } from '../features/dashboard/SummaryBlocks';
import type { ApiResponse } from '../lib/api-types';
import { useApiQuery } from '../lib/query';

export function Dashboard() {
  const { me, hasFeature, can } = useAuth();
  const inbox = useApiQuery<ApiResponse<'/api/v1/approvals/inbox'>>('/api/v1/approvals/inbox');
  const mine = useApiQuery<ApiResponse<'/api/v1/approvals/mine'>>('/api/v1/approvals/mine');
  const hasEmployee = !!me?.user.employeeId;
  const showPolicies = hasFeature('FEATURE_POLICIES') && can('policies.self') && hasEmployee;
  const policies = useApiQuery<ApiResponse<'/api/v1/policies/mine'>>(showPolicies ? '/api/v1/policies/mine' : null);
  const attendance = hasFeature('FEATURE_ATTENDANCE') && can('attendance.self');
  const awaiting = inbox.data?.items.length ?? 0;
  const pendingMine = mine.data?.items.filter((x) => x.status === 'pending').length ?? 0;
  const dash = (q: { data: unknown }, n: number) => (q.data ? n : '—');
  const pendingPolicies = policies.data?.pending ?? 0;
  return (
    <div className="stack-6">
      <PageHeader title={`Welcome, ${me?.user.displayName}`} description={me?.organization.name} />
      {me?.mfa.suggested && !me.mfa.enabled && <Alert tone="info"><Link to="/account">You can read pay or bank details. Consider turning on two-factor authentication.</Link></Alert>}
      {pendingPolicies > 0 && (
        <Alert tone="warn">
          <Link to="/policies">
            {pendingPolicies} {pendingPolicies === 1 ? 'policy needs' : 'policies need'} your acknowledgement{policies.data?.overdue ? `, ${policies.data.overdue} overdue` : ''}.
          </Link>
        </Alert>
      )}
      <div className="columns-2">
        {attendance && <PunchCard />}
        <Card title="Requests">
          <div className="stack-3">
            <StatGrid>
              <StatTile tileKey="awaiting" label="Awaiting your approval" value={dash(inbox, awaiting)} href="/approvals" tone={awaiting ? 'warn' : 'neutral'} />
              <StatTile tileKey="mine" label="Your pending requests" value={dash(mine, pendingMine)} href="/approvals?tab=mine" />
            </StatGrid>
            {(inbox.isError || mine.isError) && <ErrorState compact error={inbox.error ?? mine.error} onRetry={() => { void inbox.refetch(); void mine.refetch(); }} />}
            {hasEmployee && (
              <div className="cluster">
                {hasFeature('FEATURE_LEAVE') && <ButtonLink to="/leave" size="sm">Apply for leave</ButtonLink>}
                {hasFeature('FEATURE_ATTENDANCE_REGULARIZATION') && <ButtonLink to="/attendance/me" size="sm">Request attendance correction</ButtonLink>}
                {hasFeature('FEATURE_EXPENSE_CLAIMS') && can('expenses.self') && <ButtonLink to="/expenses" size="sm">New expense claim</ButtonLink>}
              </div>
            )}
          </div>
        </Card>
      </div>
      <SummaryBlocks />
    </div>
  );
}
