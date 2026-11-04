import { CalendarCheck } from 'lucide-react';
import { api, qs, type Paged } from '../api';
import { useAuth } from '../auth';
import { Badge, StatusBadge, statusLabel } from '../components/Badge';
import { Button, ButtonLink } from '../components/Button';
import { DatePicker } from '../components/DatePicker';
import { EmptyState } from '../components/EmptyState';
import { FilterBar } from '../components/FilterBar';
import { Checkbox } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { Table, type Column } from '../components/Table';
import { useToast } from '../components/Toast';
import { useAction } from '../components/useSubmit';
import { useTableState } from '../components/useTableState';
import { orgOptions, useOrg } from '../features/org/useOrg';
import { EXCEPTION_LABEL, fmtMinutes, fmtTime, todayLocal } from '../format';
import { invalidateApi, useApiQuery } from '../lib/query';
import '../features/attendance/Roster.css';

/** What a daily result can be: the labels table in format.ts also holds other modules' statuses. */
const ATTENDANCE_STATUSES = ['present', 'half_day', 'absent', 'missing_punch', 'weekly_off', 'holiday', 'on_leave', 'on_duty', 'not_calculated'];

interface DailyRow {
  employee_id: string; employee_code: string; name: string; branch_name: string; status: string; first_in: string | null; last_out: string | null; worked_minutes: number | null; late_minutes: number | null;
  exceptions: string[] | null; locked: boolean | null; shift_code: string | null;
}
type DailyResponse = Paged<DailyRow> & { summary: { status: string; count: number }[] };

const columns: Column<DailyRow>[] = [
  { key: 'employee', header: 'Employee', card: 'title', required: true, cell: (r) => <><ButtonLink variant="link" to={`/employees/${r.employee_id}?tab=attendance`}>{r.name}</ButtonLink><div className="table__cell-sub">{r.employee_code}</div></> },
  { key: 'branch', header: 'Branch', cell: (r) => r.branch_name },
  { key: 'shift', header: 'Shift', cell: (r) => r.shift_code ?? '—' },
  { key: 'status', header: 'Status', card: 'status', cell: (r) => <span className="cluster"><StatusBadge status={r.status} />{r.locked && <Badge tone="info">Locked</Badge>}</span> },
  { key: 'in', header: 'In', cell: (r) => <span className="nowrap">{fmtTime(r.first_in)}</span> },
  { key: 'out', header: 'Out', cell: (r) => <span className="nowrap">{fmtTime(r.last_out)}</span> },
  { key: 'worked', header: 'Worked', cell: (r) => <span className="nowrap">{r.worked_minutes != null ? fmtMinutes(r.worked_minutes) : '—'}</span> },
  { key: 'late', header: 'Late', cell: (r) => (r.late_minutes ? `${r.late_minutes}m` : '—') },
  { key: 'exceptions', header: 'Exceptions', cell: (r) => (r.exceptions?.length ? <span className="cluster">{r.exceptions.map((x) => <Badge key={x} tone="warn">{EXCEPTION_LABEL[x] ?? x}</Badge>)}</span> : '—') },
];

export function TeamAttendance() {
  const { can } = useAuth();
  const all = can('attendance.read');
  const table = useTableState('attendance.daily', columns, { filters: { date: todayLocal(), branchId: '', status: '', exceptionsOnly: '' } });
  const { date = todayLocal(), branchId, status, exceptionsOnly } = table.filters;
  const org = useOrg(all);
  const query = useApiQuery<DailyResponse>(`/api/v1/attendance/daily${qs({ date, branchId, status, exceptionsOnly: exceptionsOnly || undefined, page: table.page, pageSize: 50 })}`, { placeholderData: (p) => p });
  const toast = useToast();
  const { run, isBusy } = useAction();
  const recalculate = () => run('recalculate', async () => {
    const r = await api.post<{ daysCalculated: number; lockedDaysSkipped: number }>('/api/v1/attendance/recalculate', { from: date, to: date, branchId: branchId || undefined });
    toast(`Recalculated ${r.daysCalculated} day(s)${r.lockedDaysSkipped ? `, ${r.lockedDaysSkipped} locked day(s) skipped` : ''}`);
    await invalidateApi('/api/v1/attendance/daily');
  });
  return (
    <div className="stack-4">
      <PageHeader title={all ? 'Attendance' : 'Team attendance'} description={`${all ? 'All active employees' : 'Employees in your reporting line'}: daily results.`} />
      <div className="filters-labelled">
        <FilterBar
          activeCount={table.activeFilterCount}
          onClear={table.clearFilters}
          actions={can('attendance.recalculate') && <Button loading={isBusy('recalculate')} onClick={() => void recalculate()}>Recalculate this day</Button>}
        >
          <DatePicker label="Date" max={todayLocal()} value={date} onChange={(e) => { if (e.target.value) table.setFilter('date', e.target.value); }} />
          {all && <Select label="Branch" placeholder="All branches" value={branchId} options={orgOptions(org.data?.branches)} onChange={(e) => table.setFilter('branchId', e.target.value)} />}
          <Select label="Status" placeholder="Any status" value={status} options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
          <Checkbox label="Exceptions only" checked={exceptionsOnly === 'true'} onChange={(e) => table.setFilter('exceptionsOnly', e.target.checked ? 'true' : '')} />
        </FilterBar>
      </div>
      {!!query.data?.summary.length && <div className="cluster" role="group" aria-label="Summary for this day">{query.data.summary.map((s) => <Badge key={s.status}>{statusLabel(s.status)}: {s.count}</Badge>)}</div>}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<CalendarCheck />} title="No employees match these filters." />}>
        {(d) => <Table label="Daily attendance" columns={columns} rows={d.items} rowKey={(r) => r.employee_id} refreshing={query.isPlaceholderData} hidden={table.hidden} onToggleColumn={table.toggleColumn} views={table.views} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
    </div>
  );
}
