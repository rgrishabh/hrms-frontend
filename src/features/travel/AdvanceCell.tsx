import { Money } from '../../components/Money';
import type { Trip } from './types';

export function AdvanceCell({ trip: t }: { trip: Trip }) {
  if (Number(t.advance_requested) <= 0) return <span className="text-3">—</span>;
  const note = t.advance_paid_at ? `Paid · ${t.advance_reference}` : ['approved', 'completed'].includes(t.status) ? 'Not paid yet' : null;
  return <><Money value={t.advance_requested} />{note && <div className="table__cell-sub">{note}</div>}</>;
}
