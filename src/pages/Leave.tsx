import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api, qs, type Paged } from '../api';
import { useAuth } from '../auth';
import { Badge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Skeleton } from '../components/Skeleton';
import { StatGrid, StatTile } from '../components/StatTile';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { ApplyForm } from '../features/leave/ApplyForm';
import { LeaveAdmin } from '../features/leave/LeaveAdmin';
import { LedgerDrawer } from '../features/leave/LedgerDrawer';
import { TeamCalendar } from '../features/leave/TeamCalendar';
import type { LeaveBalance, LeaveRequest } from '../features/leave/types';
import { fmtDate, fmtNumber, todayLocal } from '../format';
import { invalidateApi, useApiQuery } from '../lib/query';

type Tab = 'mine' | 'team' | 'admin';

const dates = (r: LeaveRequest) => `${fmtDate(r.start_date)}${r.start_half === 'second_half' ? ' (2nd half)' : ''}${r.end_date !== r.start_date || r.end_half !== 'full' ? ` → ${fmtDate(r.end_date)}${r.end_half === 'first_half' ? ' (1st half)' : ''}` : ''}`;

export function Leave() {
  const { can, canAny, me } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('leave.self')) tabs.push({ key: 'mine', label: 'My leave' });
  if (canAny('leave.team.read', 'leave.read', 'leave.manage')) tabs.push({ key: 'team', label: 'Team calendar' });
  if (can('leave.manage')) tabs.push({ key: 'admin', label: 'Administration' });
  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : (['mine'] as Tab[]));
  return (
    <div className="stack-4">
      <PageHeader title="Leave" description="Balances, requests and approvals." />
      {tabs.length > 1 && <Tabs label="Leave" idBase="leave" tabs={tabs} value={tab} onChange={setTab} />}
      <TabPanel idBase="leave" tab={tab}>
        {tab === 'mine' && <MyLeave />}
        {tab === 'team' && <TeamCalendar />}
        {tab === 'admin' && <LeaveAdmin />}
      </TabPanel>
    </div>
  );
}

function MyLeave() {
  const toast = useToast();
  const { me } = useAuth();
  const [applying, setApplying] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [cancel, setCancel] = useState<LeaveRequest | null>(null);
  const [page, setPage] = useState(1);
  const bal = useApiQuery<{ items: LeaveBalance[]; leaveYear: number; period: { start: string; end: string } }>('/api/v1/leave/balances');
  const reqs = useApiQuery<Paged<LeaveRequest>>(`/api/v1/leave/requests${qs({ scope: 'mine', page, pageSize: 10 })}`, { placeholderData: (p) => p });
  const today = todayLocal();
  const reload = () => invalidateApi('/api/v1/leave', '/api/v1/dashboard');
  const columns: Column<LeaveRequest>[] = [
    { key: 'type', header: 'Type', card: 'title', cell: (r) => r.type_name },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'dates', header: 'Dates', card: 'subtitle', cell: (r) => <span className="tnum">{dates(r)}</span> },
    { key: 'days', header: 'Days', align: 'right', cell: (r) => fmtNumber(r.days) },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => ((r.status === 'pending' || (r.status === 'approved' && r.start_date > today)) ? <div className="table__actions"><Button size="sm" onClick={() => setCancel(r)}>Cancel</Button></div> : null) },
  ];
  return (
    <div className="stack-6">
      <div className="cluster-between">
        <span className="text-2 text-sm tnum">{bal.data && `Leave year ${fmtDate(bal.data.period.start)} – ${fmtDate(bal.data.period.end)}`}</span>
        <span className="cluster"><Button disabled={!bal.data?.items.length} onClick={() => setLedger(true)}>Balance history</Button><Button variant="primary" disabled={!bal.data?.items.length} onClick={() => setApplying(true)}>Apply for leave</Button></span>
      </div>
      <QueryState
        query={bal}
        compact
        loading={<StatGrid>{[1, 2, 3, 4].map((i) => <Skeleton key={i} height="tile" />)}</StatGrid>}
        isEmpty={(d) => !d.items.length}
        empty={<EmptyState icon={<CalendarDays />} title="No leave types are set up yet" description="Ask HR to set them up." />}
      >
        {(d) => (
          <StatGrid label="Leave balances">
            {d.items.map((b) => (
              <StatTile
                key={b.id}
                tileKey={`balance_${b.code}`}
                label={b.name}
                value={b.requires_balance ? fmtNumber(b.available) : '—'}
                detail={<>{b.requires_balance ? `available · ${fmtNumber(b.used)} used${Number(b.pending) > 0 ? ` · ${fmtNumber(b.pending)} pending` : ''}` : 'No balance needed'}{!b.paid && <> <Badge>Unpaid</Badge></>}</>}
              />
            ))}
          </StatGrid>
        )}
      </QueryState>
      <div className="stack-3">
        <h2>My requests</h2>
        <QueryState query={reqs} isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No leave requests yet." />}>
          {(d) => <Table label="My leave requests" columns={columns} rows={d.items} rowKey={(r) => r.id} refreshing={reqs.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
        </QueryState>
      </div>
      {ledger && bal.data && me?.user.employeeId && <LedgerDrawer employeeId={me.user.employeeId} types={bal.data.items} leaveYear={bal.data.leaveYear} onClose={() => setLedger(false)} />}
      {applying && bal.data && <ApplyForm types={bal.data.items} onClose={() => setApplying(false)} onDone={() => void reload()} />}
      {cancel && (
        <ConfirmDialog
          title="Cancel leave"
          message={`Cancel ${cancel.type_name} for ${dates(cancel)}?${cancel.status === 'approved' ? ' The days will be returned to your balance.' : ''}`}
          confirmLabel="Cancel leave"
          danger
          onClose={() => setCancel(null)}
          onConfirm={async () => { await api.post(`/api/v1/leave/requests/${cancel.id}/cancel`, {}); toast('Leave cancelled'); await reload(); }}
        />
      )}
    </div>
  );
}
