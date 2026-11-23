import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { StatGrid, StatTile } from '../../components/StatTile';
import { Table, type Column } from '../../components/Table';
import { useApiQuery } from '../../lib/query';
import { ESTIMATE_PARTS, MODE, TRIPS_URL, tripRoute, tripWhen, type Settlement, type TripDetailData } from './types';
import './Travel.css';

const claimColumns: Column<Settlement['claims'][number]>[] = [
  { key: 'claim', header: 'Claim', card: 'title', cell: (c) => c.title },
  { key: 'total', header: 'Total', align: 'right', cell: (c) => <Money value={c.total} /> },
  { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
];

export function TripDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useApiQuery<TripDetailData>(`${TRIPS_URL}/${id}`);
  const t = query.data;
  return (
    <Modal title={t ? `Trip — ${tripRoute(t)}` : 'Trip'} size="lg" onClose={onClose}>
      <QueryState query={query}>
        {(d) => {
          const s = d.settlement;
          const parts = ESTIMATE_PARTS.filter(([k]) => Number(d[`estimate_${k}`] ?? 0) > 0);
          return (
            <div className="stack-4">
              <div className="cluster"><StatusBadge status={d.status} /><span className="text-2">{d.name} · {tripWhen(d)} · {MODE[d.travel_mode] ?? d.travel_mode}</span></div>
              <p>{d.purpose}{d.project ? <span className="text-2"> · {d.project}</span> : null}</p>
              {d.on_duty_note && <Alert>{d.on_duty_note}</Alert>}
              {d.field_duty_id && <p className="text-sm text-2">Counted as field duty in attendance.</p>}
              <section className="stack-2">
                <h3>Estimate</h3>
                <dl className="estimate-list">
                  {parts.map(([k, label]) => <div key={k}><dt>{label}</dt><dd><Money value={d[`estimate_${k}`]} /></dd></div>)}
                  <div><dt>Total</dt><dd><Money value={d.estimate_total} /></dd></div>
                </dl>
              </section>
              <section className="stack-2">
                <h3>Settlement</h3>
                <StatGrid label="Settlement">
                  <StatTile label="Advance paid" value={<Money value={s.advancePaid} />} />
                  <StatTile label="Claimed" value={<Money value={s.claimed} />} />
                  <StatTile label="Set off from advance" value={<Money value={s.advanceAdjusted} />} />
                  <StatTile label="Reimbursed / to reimburse" value={<Money value={s.reimbursable} />} />
                  <StatTile label="Returned" value={<Money value={s.recovered} />} />
                  <StatTile label="Advance outstanding" tone={Number(s.outstanding) > 0 ? 'warn' : 'neutral'} value={<Money value={s.outstanding} />} />
                </StatGrid>
              </section>
              {s.claims.length > 0 && <Table label="Trip claims" columns={claimColumns} rows={s.claims} rowKey={(c) => c.id} />}
            </div>
          );
        }}
      </QueryState>
    </Modal>
  );
}
