import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { qs } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { CARD_LIST_QUERY, useMediaQuery } from '../../components/hooks';
import { QueryState } from '../../components/QueryState';
import { addDays, fmtDate, todayLocal } from '../../format';
import { useApiQuery } from '../../lib/query';
import type { LeaveCalendarItem } from './types';
import './TeamCalendar.css';

const SPAN = 27;

const isHalf = (r: LeaveCalendarItem, d: string) => (d === r.start_date && r.start_half === 'second_half') || (d === r.end_date && r.end_half === 'first_half');

/** Who is away over four weeks. A date grid on desktop; on a phone, 29 columns become one line per absence. */
export function TeamCalendar() {
  const [from, setFrom] = useState(todayLocal());
  const to = addDays(from, SPAN);
  const query = useApiQuery<{ items: LeaveCalendarItem[] }>(`/api/v1/leave/calendar${qs({ from, to })}`);
  const phone = useMediaQuery(CARD_LIST_QUERY);
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <div className="cluster">
          <Button size="sm" icon={<ChevronLeft aria-hidden="true" />} onClick={() => setFrom(addDays(from, -(SPAN + 1)))}>Earlier</Button>
          <strong className="tnum">{fmtDate(from)} – {fmtDate(to)}</strong>
          <Button size="sm" onClick={() => setFrom(addDays(from, SPAN + 1))}>Later<ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="cluster"><Badge tone="ok">Approved</Badge><Badge tone="warn">Pending</Badge></div>
      </div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No leave in this period" />}>
        {(d) => (phone ? <AbsenceList items={d.items} /> : <Grid items={d.items} from={from} to={to} />)}
      </QueryState>
    </div>
  );
}

function AbsenceList({ items }: { items: readonly LeaveCalendarItem[] }) {
  return (
    <ul className="list-plain table-cards" aria-label="Team leave">
      {items.map((r, i) => (
        <li key={`${r.employee_id}-${r.start_date}-${i}`} className="table-card">
          <div className="table-card__head"><div className="grow"><div className="table-card__title">{r.name}</div><div className="table-card__subtitle tnum">{fmtDate(r.start_date)}{r.end_date !== r.start_date && ` – ${fmtDate(r.end_date)}`}</div></div><Badge tone={r.status === 'approved' ? 'ok' : 'warn'}>{r.type_code}, {r.status}</Badge></div>
        </li>
      ))}
    </ul>
  );
}

function Grid({ items, from, to }: { items: readonly LeaveCalendarItem[]; from: string; to: string }) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const people = new Map<string, { name: string; code: string; items: LeaveCalendarItem[] }>();
  for (const r of items) {
    const p = people.get(r.employee_id) ?? { name: r.name, code: r.employee_code, items: [] };
    p.items.push(r);
    people.set(r.employee_id, p);
  }
  return (
    <div className="table-scroll" tabIndex={0} role="group" aria-label="Team calendar, scrollable">
      <table className="table leave-grid" aria-label="Team calendar">
        <thead><tr><th scope="col">Employee</th>{days.map((d) => <th key={d} scope="col" className="leave-grid__day" aria-label={fmtDate(d)}>{Number(d.slice(8))}</th>)}</tr></thead>
        <tbody>
          {[...people.entries()].map(([id, p]) => (
            <tr key={id}>
              <th scope="row" className="leave-grid__person">{p.name} <span className="mono text-3">{p.code}</span></th>
              {days.map((d) => {
                const r = p.items.find((x) => x.start_date <= d && x.end_date >= d);
                return <td key={d} className="leave-grid__day">{r && <Badge tone={r.status === 'approved' ? 'ok' : 'warn'} title={`${r.type_code} ${r.status}`}>{r.type_code}{isHalf(r, d) ? '½' : ''}</Badge>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
