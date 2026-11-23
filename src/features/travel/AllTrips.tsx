import { useState } from 'react';
import { Plane } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { statusLabel, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { formatMoney, Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { currencySymbol } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { AdvanceCell } from './AdvanceCell';
import { TripDetail } from './TripDetail';
import { STATUSES, TRIPS_URL, tripRoute, tripWhen, type Trip, type TripDetailData, type TripPage } from './types';

type Act = { kind: 'pay' | 'returned' | 'close' | 'cancel'; trip: Trip };

const reload = () => invalidateApi(TRIPS_URL, '/api/v1/dashboard');

export function AllTrips({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me } = useAuth();
  const table = useTableState<Trip>(`travel-${scope}`, [], { filters: { status: '', advance: '', on: '' } });
  const { status, advance, on } = table.filters;
  const query = useApiQuery<TripPage>(`${TRIPS_URL}${qs({ scope, status, advance, on, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [detail, setDetail] = useState<string | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const pay = scope === 'all' && can('expenses.pay');
  const approve = scope === 'all' && can('travel.approve');
  const columns: Column<Trip>[] = [
    { key: 'employee', header: 'Employee', card: 'title', cell: (t) => <>{t.name}<div className="table__cell-sub mono">{t.employee_code}{t.department ? ` · ${t.department}` : ''}</div></> },
    { key: 'when', header: 'When', cell: tripWhen },
    { key: 'route', header: 'Route', cell: (t) => <>{tripRoute(t)}<div className="table__cell-sub">{t.purpose}</div></> },
    { key: 'estimate', header: 'Estimate', align: 'right', cell: (t) => <Money value={t.estimate_total} /> },
    { key: 'advance', header: 'Advance', align: 'right', cell: (t) => <AdvanceCell trip={t} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (t) => {
        const own = t.employee_id === me?.user.employeeId;
        return (
          <div className="table__actions">
            <Button size="sm" onClick={() => setDetail(t.id)}>Details</Button>
            {pay && !own && ['approved', 'completed'].includes(t.status) && Number(t.advance_requested) > 0 && !t.advance_paid_at && <Button size="sm" variant="primary" onClick={() => setAct({ kind: 'pay', trip: t })}>Pay advance</Button>}
            {pay && !own && t.advance_paid_at && t.status !== 'closed' && <Button size="sm" onClick={() => setAct({ kind: 'returned', trip: t })}>Advance returned</Button>}
            {pay && t.status === 'completed' && <Button size="sm" onClick={() => setAct({ kind: 'close', trip: t })}>Close</Button>}
            {approve && !own && t.status === 'approved' && <Button size="sm" variant="danger-ghost" onClick={() => setAct({ kind: 'cancel', trip: t })}>Cancel</Button>}
          </div>
        );
      },
    },
  ];
  return (
    <div className="stack-3">
      <FilterBar activeCount={table.activeFilterCount} onClear={table.clearFilters}>
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
        {scope === 'all' && <Select label="Advance" hideLabel placeholder="Any advance" value={advance} options={[{ value: 'to_pay', label: 'To pay' }, { value: 'outstanding', label: 'Paid, not yet settled' }]} onChange={(e) => table.setFilter('advance', e.target.value)} />}
        <DatePicker label="Travelling on" value={on} onChange={(e) => table.setFilter('on', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Plane />} title="No trips match" description={table.activeFilterCount ? 'Try clearing the filters.' : undefined} />}>
        {(d) => <Table label="Trips" columns={columns} rows={d.items} rowKey={(t) => t.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {detail && <TripDetail id={detail} onClose={() => setDetail(null)} />}
      {act?.kind === 'pay' && <PayAdvance trip={act.trip} onClose={() => setAct(null)} />}
      {act?.kind === 'returned' && <AdvanceReturned trip={act.trip} onClose={() => setAct(null)} />}
      {act?.kind === 'close' && (
        <ConfirmDialog
          title="Close trip"
          confirmLabel="Close trip"
          message={`Close ${act.trip.name}'s trip ${tripRoute(act.trip)}? Only possible when no advance is outstanding and no claim is still in progress.`}
          onClose={() => setAct(null)}
          onConfirm={async () => { await api.post(`${TRIPS_URL}/${act.trip.id}/close`); toast('Trip closed'); await reload(); }}
        />
      )}
      {act?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancel approved trip"
          danger
          requireComment
          confirmLabel="Cancel trip"
          message={<>Cancel {act.trip.name}'s trip {tripRoute(act.trip)} ({tripWhen(act.trip)})? Its field duty is cancelled{act.trip.advance_paid_at ? '; the paid advance stays outstanding until returned' : ''}.</>}
          onClose={() => setAct(null)}
          onConfirm={async (reason) => { await api.post(`${TRIPS_URL}/${act.trip.id}/cancel`, { reason }); toast('Trip cancelled'); await reload(); }}
        />
      )}
    </div>
  );
}

function PayAdvance({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const toast = useToast();
  const [reference, setReference] = useState('');
  const form = useSubmit(async () => {
    await api.post(`${TRIPS_URL}/${trip.id}/advance-paid`, { reference });
    toast('Advance recorded as paid');
    await reload();
    onClose();
  });
  return (
    <Modal title="Pay travel advance" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <p><Money value={trip.advance_requested} /> to {trip.name} for {tripRoute(trip)} ({tripWhen(trip)}).</p>
        <Input label="Payment reference" hint="Bank transfer number, or the cash voucher" required minLength={3} maxLength={100} error={form.errors['reference']} value={reference} onChange={(e) => setReference(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" onCancel={onClose} submitLabel="Record as paid" />
      </form>
    </Modal>
  );
}

function AdvanceReturned({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const query = useApiQuery<TripDetailData>(`${TRIPS_URL}/${trip.id}`);
  return (
    <Modal title="Advance returned" onClose={onClose}>
      <QueryState query={query} compact>
        {(d) => <AdvanceReturnedForm trip={trip} outstanding={Number(d.settlement.outstanding)} onClose={onClose} />}
      </QueryState>
    </Modal>
  );
}

function AdvanceReturnedForm({ trip, outstanding, onClose }: { trip: Trip; outstanding: number; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const validate = () => {
    const bad: FieldErrors = {};
    if (Number(amount) > outstanding) bad['amount'] = `Only ${formatMoney(outstanding)} is outstanding`;
    return bad;
  };
  const form = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/travel/requests/{id}/advance-returned', 'post'>>(`${TRIPS_URL}/${trip.id}/advance-returned`, { amount, note });
    toast(`Recorded. Outstanding ${formatMoney(r.outstanding)}`);
    await reload();
    onClose();
  }, { validate });
  return (
    <form className="stack-3" onSubmit={form.submit}>
      <p>{trip.name} still has <Money value={outstanding} /> of the advance for {tripRoute(trip)}.</p>
      <Input label={`Amount returned (${currencySymbol()})`} type="number" required min={0.01} step="0.01" error={form.errors['amount']} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input label="How it was returned" hint="Cash to accounts, or a transfer reference" required minLength={3} maxLength={300} error={form.errors['note']} value={note} onChange={(e) => setNote(e.target.value)} />
      <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" disabled={outstanding <= 0} onCancel={onClose} submitLabel="Record" />
    </form>
  );
}
