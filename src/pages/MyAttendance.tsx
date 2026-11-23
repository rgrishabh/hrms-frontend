import { History } from 'lucide-react';
import { useAuth } from '../auth';
import { StatusBadge } from '../components/Badge';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { MaskableText } from '../components/RevealToggle';
import { QueryState } from '../components/QueryState';
import { Table, type Column } from '../components/Table';
import { AttendanceCalendar } from '../features/attendance/AttendanceCalendar';
import { PunchCard } from '../features/attendance/PunchCard';
import type { Regularization } from '../features/attendance/types';
import { fmtDate, fmtTime } from '../format';
import type { ApiResponse, Refine } from '../lib/api-types';
import { useApiQuery } from '../lib/query';

const columns: Column<Regularization>[] = [
  { key: 'date', header: 'Date', card: 'title', cell: (r) => fmtDate(r.work_date) },
  { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
  { key: 'in', header: 'In', cell: (r) => fmtTime(r.requested_in) },
  { key: 'out', header: 'Out', cell: (r) => fmtTime(r.requested_out) },
  { key: 'reason', header: 'Reason', cell: (r) => <MaskableText row={r} field="reason" /> },
];

export function MyAttendance() {
  const { me, hasFeature } = useAuth();
  const regs = useApiQuery<Refine<ApiResponse<'/api/v1/attendance/regularizations'>, { items: Regularization[] }>>('/api/v1/attendance/regularizations?scope=mine&pageSize=10');
  return (
    <div className="stack-6">
      <PageHeader title="My attendance" description="Daily results are calculated from your punches, shift and holidays. Select a day for details." />
      {me?.user.employeeId && hasFeature('FEATURE_ATTENDANCE_WEB', 'FEATURE_ATTENDANCE_MOBILE') && <PunchCard />}
      {me?.user.employeeId && <AttendanceCalendar employeeId={me.user.employeeId} self />}
      <div className="stack-3">
        <h2>My correction requests</h2>
        <QueryState query={regs} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<History />} title="No requests yet." />}>
          {(d) => <Card flush aria-label="Correction requests"><Table label="My correction requests" columns={columns} rows={d.items} rowKey={(r) => r.id} /></Card>}
        </QueryState>
      </div>
    </div>
  );
}
