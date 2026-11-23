import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { InlineError } from '../../components/ErrorState';
import { Textarea } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { addDays, EXCEPTION_LABEL, fmtDate, fmtDateTime, fmtMinutes, fmtMonth, fmtTime, localInputToIso, STATUS_LABEL, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { AttendanceEvent, AttendanceMonth, DailyResult } from './types';
import './AttendanceCalendar.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** One employee's month of attendance. A day opens its detail, and for self, a correction request. */
export function AttendanceCalendar({ employeeId, self }: { employeeId: string; self: boolean }) {
  const { hasFeature } = useAuth();
  const today = todayLocal();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [regDate, setRegDate] = useState<string | null>(null);
  const { from, to } = monthBounds(month);
  const url = self ? `/api/v1/attendance/me${qs({ from, to })}` : `/api/v1/attendance/employees/${employeeId}${qs({ from, to })}`;
  const query = useApiQuery<AttendanceMonth>(url);
  const go = (n: number) => { setMonth(shiftMonth(month, n)); setSelected(null); };

  return (
    <div className="stack-3">
      <div className="cluster">
        <Button size="sm" iconOnly aria-label="Previous month" icon={<ChevronLeft aria-hidden="true" />} onClick={() => go(-1)} />
        <strong className="att-month" aria-live="polite">{fmtMonth(month)}</strong>
        <Button size="sm" iconOnly aria-label="Next month" disabled={to >= today} icon={<ChevronRight aria-hidden="true" />} onClick={() => go(1)} />
      </div>
      <QueryState query={query} loading={<SkeletonRows rows={6} />}>
        {(data) => {
          const days = new Map(data.days.map((d) => [d.work_date.slice(0, 10), d]));
          const counts = new Map<string, number>();
          for (const d of data.days) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
          const firstDow = new Date(`${from}T00:00:00Z`).getUTCDay();
          const dates: string[] = [];
          for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
          const sel = selected ? days.get(selected) ?? null : null;
          return (
            <>
              {counts.size > 0 && <div className="cluster">{[...counts].map(([k, v]) => <Badge key={k}>{STATUS_LABEL[k] ?? k}: {v}</Badge>)}</div>}
              <div className="att-cal">
                <div className="att-cal__head" aria-hidden="true">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
                <div className="att-cal__grid">
                  {Array.from({ length: firstDow }, (_, i) => <span key={i} aria-hidden="true" />)}
                  {dates.map((d) => {
                    const r = days.get(d);
                    const label = r ? STATUS_LABEL[r.status] ?? r.status : 'No record';
                    return (
                      <button key={d} type="button" className={`att-day att-day--${r?.status ?? 'none'}`} aria-pressed={selected === d} onClick={() => setSelected(d)}>
                        <span className="att-day__n tnum">{Number(d.slice(8))}</span>
                        <span className="visually-hidden">{fmtDate(d)}</span>
                        <span className="att-day__status">{label}</span>
                        {r && r.worked_minutes > 0 && <span className="att-day__worked tnum">{fmtMinutes(r.worked_minutes)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selected && <DayDetail date={selected} day={sel} events={data.events} canCorrect={self && hasFeature('FEATURE_ATTENDANCE_REGULARIZATION') && !sel?.locked && selected <= today} onCorrect={() => setRegDate(selected)} />}
            </>
          );
        }}
      </QueryState>
      {regDate && <RegularizationForm date={regDate} onClose={() => setRegDate(null)} />}
    </div>
  );
}

function DayDetail({ date, day, events, canCorrect, onCorrect }: { date: string; day: DailyResult | null; events: AttendanceEvent[]; canCorrect: boolean; onCorrect: () => void }) {
  // Local midnight to noon the next day, which covers overnight shifts.
  const winStart = Date.parse(localInputToIso(`${date}T00:00`));
  const winEnd = Date.parse(localInputToIso(`${addDays(date, 1)}T12:00`));
  const punches = events.filter((e) => { const t = Date.parse(e.event_time); return t >= winStart && t < winEnd; });
  return (
    <Card
      title={<span className="cluster">{fmtDate(date)}{day && <StatusBadge status={day.status} />}{day?.locked && <Badge tone="info">Locked for payroll</Badge>}</span>}
      actions={canCorrect && <Button size="sm" onClick={onCorrect}>Request correction</Button>}
    >
      <div className="stack-3">
        {day
          ? (
            <KeyValue items={[
              { label: 'Shift', value: day.shift_code ?? 'None' },
              { label: 'First in', value: fmtTime(day.first_in) },
              { label: 'Last out', value: fmtTime(day.last_out) },
              { label: 'Worked', value: fmtMinutes(day.worked_minutes) },
              { label: 'Late', value: day.late_minutes ? `${day.late_minutes} min` : '—' },
              { label: 'Early exit', value: day.early_exit_minutes ? `${day.early_exit_minutes} min` : '—' },
              { label: 'Overtime', value: day.overtime_minutes ? fmtMinutes(day.overtime_minutes) : '—' },
              ...(Number(day.leave_fraction) > 0 ? [{ label: 'Leave', value: `${day.leave_type_code ? `${day.leave_type_code} · ` : ''}${Number(day.leave_fraction) === 1 ? 'full day' : 'half day'}` }] : []),
              ...(Number(day.duty_fraction) > 0 ? [{ label: 'Field duty', value: Number(day.duty_fraction) === 1 ? 'full day' : 'half day' }] : []),
            ]} />
          )
          : <p className="text-2">No calculated result for this day yet.</p>}
        {!!day?.exceptions?.length && <div className="cluster">{day.exceptions.map((x) => <Badge key={x} tone="warn">{EXCEPTION_LABEL[x] ?? x}</Badge>)}</div>}
        <div className="stack-1">
          <h3>Raw punches</h3>
          {punches.length
            ? <ul className="list-plain text-sm text-2 stack-1">{punches.map((e) => <li key={e.id}>{fmtDateTime(e.event_time)} · {e.direction} · {e.source}{e.status !== 'accepted' ? ` (${e.status})` : ''}</li>)}</ul>
            : <p className="text-sm text-2">No punches recorded.</p>}
        </div>
      </div>
    </Card>
  );
}

/** Times start empty on purpose: the system should not suggest hours the employee did not work. */
function RegularizationForm({ date, onClose }: { date: string; onClose: () => void }) {
  const toast = useToast();
  const [inT, setIn] = useState('');
  const [outT, setOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/attendance/regularizations', { workDate: date, requestedIn: inT ? localInputToIso(inT) : undefined, requestedOut: outT ? localInputToIso(outT) : undefined, reason });
      toast('Correction request submitted for approval');
      await invalidateApi('/api/v1/attendance');
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Attendance correction · ${fmtDate(date)}`} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <p className="text-2 text-sm">Your original punches are kept. If approved, these times are added as corrections and the day is recalculated. Fill in the times you need corrected.</p>
        <div className="columns-form">
          <DatePicker mode="datetime" label="In time" value={inT} min={`${date}T00:00`} onChange={(e) => setIn(e.target.value)} />
          <DatePicker mode="datetime" label="Out time" value={outT} min={`${date}T00:00`} onChange={(e) => setOut(e.target.value)} />
        </div>
        <Textarea label="Reason" hint="At least 5 characters" required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        <InlineError error={error} />
        <div className="cluster-between">
          <span />
          <div className="cluster">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!inT && !outT} loading={busy} loadingText="Submitting…">Submit request</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

