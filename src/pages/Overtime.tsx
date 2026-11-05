import { useState } from 'react';
import { Clock, Hourglass } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';
import { StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DatePicker } from '../components/DatePicker';
import { EmptyState } from '../components/EmptyState';
import { FilterBar } from '../components/FilterBar';
import { FormActions } from '../components/FormActions';
import { Input, Textarea } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { MaskableText } from '../components/RevealToggle';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { StatGrid, StatTile } from '../components/StatTile';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { useSubmit, type FieldErrors } from '../components/useSubmit';
import { useTableState } from '../components/useTableState';
import { fmtDate, fmtMinutes, fmtTime } from '../format';
import type { ApiItem, ApiResponse } from '../lib/api-types';
import { invalidateApi, useApiQuery } from '../lib/query';
import '../features/attendance/Roster.css';

type Tab = 'mine' | 'team' | 'all';
type Payout = 'pay' | 'comp_off';
const PAYOUT: Record<string, string> = { pay: 'Pay', comp_off: 'Compensatory off' };
const STATUSES = ['pending', 'approved', 'returned', 'rejected', 'cancelled'];
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;
/** Days off earned (whole halves of the configured day), as the server computes it. */
const compDays = (minutes: number, dayMinutes: number) => Math.floor(minutes / (dayMinutes / 2)) / 2;
const reload = () => invalidateApi('/api/v1/overtime');

type Eligible = ApiResponse<'/api/v1/overtime/eligible'>;
type EligibleDay = Eligible['items'][number];
type PayoutOptions = Eligible['payout'];
type Claim = ApiItem<'/api/v1/overtime/claims'>;

export function Overtime() {
  const { canAny, can, me } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('overtime.self')) tabs.push({ key: 'mine', label: 'My overtime' });
  if (can('overtime.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('overtime.read', 'overtime.approve', 'overtime.manage')) tabs.push({ key: 'all', label: 'All claims' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['mine']);
  return (
    <div className="stack-4">
      <PageHeader title="Overtime" description="Overtime recorded by attendance, claimed as pay or compensatory off, approved by the manager and HR." />
      {!tabs.length ? <EmptyState title="You do not have access to overtime." /> : (
        <>
          {tabs.length > 1 && <Tabs label="Overtime" idBase="overtime" tabs={tabs} value={tab} onChange={setTab} />}
          <TabPanel idBase="overtime" tab={tab}>
            {/* The key resets filters and page: one tab's filters must not silently narrow another's list. */}
            {tab === 'mine' ? <Mine /> : <Claims key={tab} scope={tab} />}
          </TabPanel>
        </>
      )}
    </div>
  );
}

function outcome(c: Claim) {
  if (c.status === 'cancelled' && c.cancel_reason) return `Cancelled: ${c.cancel_reason}`;
  if (c.status !== 'approved') return '—';
  if (c.payout === 'comp_off' && c.comp_off_days === null) return 'Added to leave';
  if (c.payout === 'comp_off') return `${Number(c.comp_off_days)} day${Number(c.comp_off_days) === 1 ? '' : 's'} added to leave`;
  return c.payroll_period ? `In ${c.payroll_period} payroll${['finalized', 'paid'].includes(c.payroll_status ?? '') ? '' : ' (not final yet)'}` : 'In the next payroll';
}

function Mine() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const eligible = useApiQuery<Eligible>('/api/v1/overtime/eligible');
  const claims = useApiQuery<ApiResponse<'/api/v1/overtime/claims'>>(`/api/v1/overtime/claims${qs({ scope: 'mine', page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [claim, setClaim] = useState<EligibleDay | null>(null);
  const [withdraw, setWithdraw] = useState<Claim | null>(null);
  const can = (e: Eligible) => e.payout.pay || !!e.payout.compOff;
  const dayColumns = (e: Eligible): Column<EligibleDay>[] => [
    { key: 'date', header: 'Date', card: 'title', cell: (d) => <span className="tnum">{fmtDate(d.work_date)}</span> },
    { key: 'shift', header: 'Shift', cell: (d) => d.shift_code ?? '—' },
    { key: 'times', header: 'In – out', cell: (d) => `${fmtTime(d.first_in)} – ${fmtTime(d.last_out)}` },
    { key: 'worked', header: 'Worked', cell: (d) => fmtMinutes(d.worked_minutes) },
    { key: 'overtime', header: 'Overtime', cell: (d) => <strong>{fmtMinutes(d.overtime_minutes)}</strong> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (d) => <div className="table__actions"><Button size="sm" variant="primary" disabled={!can(e)} onClick={() => setClaim(d)}>Claim</Button></div> },
  ];
  const claimColumns: Column<Claim>[] = [
    { key: 'date', header: 'Date', card: 'title', cell: (c) => <span className="tnum">{fmtDate(c.work_date)}</span> },
    { key: 'hours', header: 'Hours', cell: (c) => hours(c.minutes) },
    { key: 'as', header: 'Taken as', cell: (c) => PAYOUT[c.payout] },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'outcome', header: 'Outcome', cell: (c) => <div className={`text-sm text-2${c.cancel_reason ? ' cell-wrap' : ''}`}>{outcome(c)}</div> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (c) => (c.status === 'pending' ? <div className="table__actions"><Button size="sm" onClick={() => setWithdraw(c)}>Withdraw</Button></div> : null) },
  ];
  return (
    <div className="stack-6">
      <Card title="Overtime to claim">
        <QueryState query={eligible}>
          {(e) => (
            <div className="stack-3">
              <p className="text-sm text-2">Days in the last {e.windowDays} days where attendance recorded at least {e.minMinutes} minutes of overtime. If a day is wrong, correct your attendance first.</p>
              {!e.payout.pay && <Alert>Overtime cannot be taken as pay yet: {e.payout.payBlocker}.{e.payout.compOff ? ' You can take it as compensatory off.' : ''}</Alert>}
              {!e.items.length
                ? <EmptyState compact icon={<Hourglass />} title="No unclaimed overtime." />
                : <Table label="Overtime to claim" columns={dayColumns(e)} rows={e.items} rowKey={(d) => d.work_date} />}
              {claim && <ClaimForm day={claim} payout={e.payout} onClose={() => setClaim(null)} />}
            </div>
          )}
        </QueryState>
      </Card>
      <div className="stack-3">
        <h2>My claims</h2>
        <QueryState query={claims} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<Clock />} title="No overtime claims yet." />}>
          {(d) => <Table label="My overtime claims" columns={claimColumns} rows={d.items} rowKey={(c) => c.id} refreshing={claims.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
        </QueryState>
      </div>
      {withdraw && (
        <ConfirmDialog
          title="Withdraw overtime claim"
          message={`Withdraw your claim for ${hours(withdraw.minutes)} on ${fmtDate(withdraw.work_date)}? You can claim the day again.`}
          confirmLabel="Withdraw"
          onClose={() => setWithdraw(null)}
          onConfirm={async () => { await api.post(`/api/v1/overtime/claims/${withdraw.id}/withdraw`); toast('Claim withdrawn'); await reload(); }}
        />
      )}
    </div>
  );
}

function ClaimForm({ day, payout, onClose }: { day: EligibleDay; payout: PayoutOptions; onClose: () => void }) {
  const toast = useToast();
  const [minutes, setMinutes] = useState<number | ''>(day.overtime_minutes);
  const [as, setAs] = useState<Payout>(payout.pay ? 'pay' : 'comp_off');
  const [reason, setReason] = useState('');
  const comp = payout.compOff;
  const days = comp ? compDays(Number(minutes) || 0, comp.dayMinutes) : 0;
  const s = useSubmit(async () => {
    await api.post('/api/v1/overtime/claims', { workDate: day.work_date, minutes, payout: as, reason });
    toast('Overtime claimed; sent for approval');
    await reload();
    onClose();
  }, { validate: (): FieldErrors => (as === 'comp_off' && days <= 0 && comp ? { minutes: `Needs at least ${fmtMinutes(comp.dayMinutes / 2)} for half a day off` } : {}) });
  return (
    <Modal title={`Claim overtime — ${fmtDate(day.work_date)}`} onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        <Input label="Minutes" hint={`Attendance recorded ${fmtMinutes(day.overtime_minutes)} of overtime. You can claim up to that.`} type="number" inputMode="numeric" min={1} max={day.overtime_minutes} required error={s.errors['minutes']} value={minutes} onChange={(e) => { setMinutes(e.target.value === '' ? '' : Number(e.target.value)); s.clearError('minutes'); }} />
        <fieldset className="choice-group">
          <legend>Take it as</legend>
          <label className="check"><input type="radio" name="payout" checked={as === 'pay'} disabled={!payout.pay} onChange={() => setAs('pay')} /><span>Pay{!payout.pay && <span className="text-2"> (not available: {payout.payBlocker})</span>}</span></label>
          <label className="check"><input type="radio" name="payout" checked={as === 'comp_off'} disabled={!comp} onChange={() => setAs('comp_off')} /><span>Compensatory off{comp ? ` (${comp.name})` : <span className="text-2"> (not offered)</span>}</span></label>
          {as === 'comp_off' && comp && <p className="text-xs text-2">{days > 0 ? `Earns ${days} day${days === 1 ? '' : 's'} off (${fmtMinutes(comp.dayMinutes)} of overtime = 1 day).` : `Needs at least ${fmtMinutes(comp.dayMinutes / 2)} for half a day off.`}</p>}
        </fieldset>
        <Textarea label="Reason" required minLength={3} error={s.errors['reason']} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needed the extra time" />
        <FormActions error={s.error} busy={s.busy} busyLabel="Sending…" submitLabel="Submit for approval" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function Claims({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can } = useAuth();
  const [cancel, setCancel] = useState<Claim | null>(null);
  const manage = scope === 'all' && can('overtime.manage');
  const columns: Column<Claim>[] = [
    { key: 'employee', header: 'Employee', card: 'title', required: true, cell: (c) => <>{c.name}<div className="table__cell-sub mono">{c.employee_code}</div></> },
    { key: 'date', header: 'Date', card: 'subtitle', cell: (c) => <span className="tnum">{fmtDate(c.work_date)}</span> },
    { key: 'hours', header: 'Hours', cell: (c) => <span className="nowrap">{hours(c.minutes)}</span> },
    { key: 'recorded', header: 'Recorded', cell: (c) => <span className="nowrap">{fmtMinutes(c.recorded_minutes)}</span> },
    { key: 'as', header: 'Taken as', cell: (c) => PAYOUT[c.payout] },
    { key: 'reason', header: 'Reason', cell: (c) => <div className="cell-wrap"><MaskableText row={c} field="reason" /></div> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'outcome', header: 'Outcome', cell: (c) => <div className={`text-sm text-2${c.cancel_reason ? ' cell-wrap' : ''}`}>{outcome(c)}</div> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (c) => (manage && c.status === 'approved' && !['pending', 'approved', 'finalized', 'paid'].includes(c.payroll_status ?? '') ? <div className="table__actions"><Button size="sm" variant="danger-ghost" onClick={() => setCancel(c)}>Cancel</Button></div> : null) },
  ];
  const table = useTableState(`overtime.${scope}`, columns, { filters: { status: '', period: '' } });
  const { status, period } = table.filters;
  const query = useApiQuery<ApiResponse<'/api/v1/overtime/claims'>>(`/api/v1/overtime/claims${qs({ scope, status, period, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const totals = query.data?.minutesByStatus;
  return (
    <div className="stack-3">
      <div className="filters-labelled">
        <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters}>
          <DatePicker mode="month" label="Month" value={period} onChange={(e) => table.setFilter('period', e.target.value)} />
          <Select label="Status" placeholder="All" value={status} options={STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
        </FilterBar>
      </div>
      {totals && (
        <StatGrid label="Overtime totals">
          <StatTile tileKey="overtime_approved" label="Approved" value={hours(totals['approved'] ?? 0)} />
          <StatTile tileKey="overtime_pending" label="Pending" value={hours(totals['pending'] ?? 0)} />
        </StatGrid>
      )}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Clock />} title="No overtime claims match." />}>
        {(d) => <Table label="Overtime claims" columns={columns} rows={d.items} rowKey={(c) => c.id} refreshing={query.isPlaceholderData} hidden={table.hidden} onToggleColumn={table.toggleColumn} views={table.views} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {cancel && (
        <ConfirmDialog
          title="Cancel approved overtime"
          danger
          requireComment
          confirmLabel="Cancel claim"
          onClose={() => setCancel(null)}
          message={`Cancel ${cancel.name}'s ${hours(cancel.minutes)} on ${fmtDate(cancel.work_date)}? ${cancel.payout === 'comp_off' ? 'The compensatory off is taken back from their leave.' : 'It will not be paid.'}`}
          onConfirm={async (reason) => {
            const r = await api.post<ApiResponse<'/api/v1/overtime/claims/{id}/cancel', 'post'>>(`/api/v1/overtime/claims/${cancel.id}/cancel`, { reason });
            toast(r.payrollRunToRecompute ? `Claim cancelled. Recompute the ${r.payrollRunToRecompute} payroll run.` : 'Claim cancelled');
            await reload();
          }}
        />
      )}
    </div>
  );
}
