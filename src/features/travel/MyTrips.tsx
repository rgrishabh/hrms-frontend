import { useState } from 'react';
import { Plane } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction } from '../../components/useSubmit';
import { todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { AdvanceCell } from './AdvanceCell';
import { RequestForm } from './RequestForm';
import { TripDetail } from './TripDetail';
import { MODE, TRIPS_URL, tripRoute, tripWhen, type Trip, type TripPage } from './types';

type Act = { kind: 'withdraw' | 'cancel' | 'complete'; trip: Trip };

export function MyTrips() {
  const toast = useToast();
  const { hasFeature } = useAuth();
  const claims = hasFeature('FEATURE_EXPENSE_CLAIMS');
  const nav = useNavigate();
  const { run, isBusy } = useAction();
  const [page, setPage] = useState(1);
  const query = useApiQuery<TripPage>(`${TRIPS_URL}${qs({ scope: 'mine', page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [form, setForm] = useState<{ from?: Trip; resubmit?: boolean } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const today = query.data?.today ?? todayLocal();
  const reload = () => invalidateApi(TRIPS_URL, '/api/v1/approvals', '/api/v1/dashboard');
  const claim = (t: Trip) => run(t.id, async () => { const r = await api.post<ApiResponse<'/api/v1/travel/requests/{id}/claim', 'post'>>(`${TRIPS_URL}/${t.id}/claim`); void nav(`/expenses?tab=mine&claim=${r.id}`); });
  const columns: Column<Trip>[] = [
    { key: 'when', header: 'When', card: 'subtitle', cell: tripWhen },
    { key: 'route', header: 'Route', card: 'title', cell: (t) => <>{tripRoute(t)}<div className="table__cell-sub">{MODE[t.travel_mode] ?? t.travel_mode}{t.trip_type === 'international' ? ' · international' : ''}</div></> },
    { key: 'purpose', header: 'Purpose', cell: (t) => t.purpose },
    { key: 'estimate', header: 'Estimate', align: 'right', cell: (t) => <Money value={t.estimate_total} /> },
    { key: 'advance', header: 'Advance', align: 'right', cell: (t) => <AdvanceCell trip={t} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (t) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => setDetail(t.id)}>Details</Button>
          {t.status === 'pending' && <Button size="sm" onClick={() => setAct({ kind: 'withdraw', trip: t })}>Withdraw</Button>}
          {t.status === 'returned' && <Button size="sm" variant="primary" onClick={() => setForm({ from: t, resubmit: true })}>Correct and resubmit</Button>}
          {t.status === 'approved' && t.start_date > today && <Button size="sm" onClick={() => setAct({ kind: 'cancel', trip: t })}>Cancel</Button>}
          {t.status === 'approved' && t.start_date <= today && <Button size="sm" onClick={() => setAct({ kind: 'complete', trip: t })}>Back from trip</Button>}
          {claims && ['approved', 'completed'].includes(t.status) && <Button size="sm" variant="primary" loading={isBusy(t.id)} onClick={() => void claim(t)}>Claim expenses</Button>}
        </div>
      ),
    },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between"><h2>My trips</h2><Button variant="primary" onClick={() => setForm({})}>Request travel</Button></div>
      {query.data?.items.some((t) => t.status === 'returned') && (
        <Alert tone="warn">A trip was returned for correction. Read the approver's comment, then press Correct and resubmit. <Link to="/approvals?tab=mine">See the comment in Approvals</Link></Alert>
      )}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<Card><EmptyState icon={<Plane />} title="No trips yet" description="Request travel to get approval and, if you need it, an advance." /></Card>}>
        {(d) => <Table label="My trips" columns={columns} rows={d.items} rowKey={(t) => t.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {form && <RequestForm from={form.from} resubmit={form.resubmit} onClose={() => setForm(null)} />}
      {detail && <TripDetail id={detail} onClose={() => setDetail(null)} />}
      {act?.kind === 'withdraw' && (
        <ConfirmDialog
          title="Withdraw travel request"
          confirmLabel="Withdraw"
          message={`Withdraw your trip ${tripRoute(act.trip)} (${tripWhen(act.trip)})?`}
          onClose={() => setAct(null)}
          onConfirm={async () => { await api.post(`${TRIPS_URL}/${act.trip.id}/withdraw`); toast('Request withdrawn'); await reload(); }}
        />
      )}
      {act?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancel trip"
          danger
          requireComment
          confirmLabel="Cancel trip"
          message={<>Cancel your approved trip {tripRoute(act.trip)} ({tripWhen(act.trip)})?{act.trip.advance_paid_at ? ' The advance paid to you must be returned to finance.' : ''}</>}
          onClose={() => setAct(null)}
          onConfirm={async (reason) => { await api.post(`${TRIPS_URL}/${act.trip.id}/cancel`, { reason }); toast('Trip cancelled'); await reload(); }}
        />
      )}
      {act?.kind === 'complete' && (
        <ConfirmDialog
          title="Back from the trip"
          confirmLabel="Mark completed"
          message={`Mark ${tripRoute(act.trip)} completed? Then claim its expenses; any advance left over is returned to finance.`}
          onClose={() => setAct(null)}
          onConfirm={async () => { await api.post(`${TRIPS_URL}/${act.trip.id}/complete`); toast('Trip completed'); await reload(); }}
        />
      )}
    </div>
  );
}
