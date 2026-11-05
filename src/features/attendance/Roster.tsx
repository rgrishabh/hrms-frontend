import { useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { api, qs } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { CARD_LIST_QUERY, useDebouncedValue, useMediaQuery } from '../../components/hooks';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { addDays, fmtDate, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { PeoplePicker } from './PeoplePicker';
import type { Shift } from './types';
import './Roster.css';

type RosterShift = Pick<Shift, 'id' | 'code' | 'name' | 'start_time' | 'end_time'>;
interface Cell { date: string; shiftId: string | null; off: boolean; holiday: string | null; source: 'override' | 'roster' | 'assignment' | null; pattern: string | null; reason: string | null }
interface Row { id: string; code: string; name: string; department: string | null; days: Cell[] }
interface RosterData { from: string; to: string; dates: string[]; shifts: RosterShift[]; items: Row[]; canEdit: boolean }
interface Pattern { id: string; code: string; name: string; days: (string | null)[]; status: string; employees: number; used?: boolean }

const TONES: BadgeTone[] = ['info', 'ok', 'warn', 'brand'];
const toneFor = (shifts: readonly RosterShift[], id: string | null): BadgeTone => { const i = shifts.findIndex((s) => s.id === id); return i < 0 ? 'neutral' : TONES[i % TONES.length]!; };
const hhmm = (t: string) => t.slice(0, 5);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()]!;
const dayHead = (d: string) => `${weekday(d)} ${d.slice(8)}`;
const mondayOf = (d: string) => { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, -((wd + 6) % 7)); };
const invalidateRoster = () => invalidateApi('/api/v1/attendance/roster');

const cellLabel = (c: Cell, shifts: readonly RosterShift[]) => (c.holiday ? 'Holiday' : c.off ? 'Off' : shifts.find((x) => x.id === c.shiftId)?.code ?? '—');

function CellMark({ c, shifts }: { c: Cell; shifts: readonly RosterShift[] }) {
  const s = shifts.find((x) => x.id === c.shiftId);
  const title = [c.holiday ?? (c.off ? 'Day off' : s ? `${s.name} ${hhmm(s.start_time)}–${hhmm(s.end_time)}` : 'No shift'), c.source === 'override' ? `Changed: ${c.reason}` : c.pattern ? `Roster ${c.pattern}` : null].filter(Boolean).join(' · ');
  const changed = c.source === 'override';
  return <span className={changed ? 'roster-mark--changed' : undefined}><Badge tone={c.holiday || c.off ? 'neutral' : toneFor(shifts, c.shiftId)} title={title}>{cellLabel(c, shifts)}{changed ? '*' : ''}</Badge></span>;
}

function CellControl({ row, cell, shifts, canEdit, onEdit }: { row: Row; cell: Cell; shifts: readonly RosterShift[]; canEdit: boolean; onEdit: (row: Row, cell: Cell) => void }) {
  if (!canEdit) return <CellMark c={cell} shifts={shifts} />;
  return <button type="button" className="roster-cell" aria-label={`${row.name}, ${fmtDate(cell.date)}: ${cellLabel(cell, shifts)}${cell.source === 'override' ? ', changed for the day' : ''}. Change`} onClick={() => onEdit(row, cell)}><CellMark c={cell} shifts={shifts} /></button>;
}

function OverrideForm({ row, cell, shifts, onClose }: { row: Row; cell: Cell; shifts: readonly RosterShift[]; onClose: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState(cell.off ? 'off' : cell.shiftId ?? 'off');
  const [reason, setReason] = useState(cell.source === 'override' ? cell.reason ?? '' : '');
  const [removing, setRemoving] = useState(false);
  const url = `/api/v1/attendance/roster-overrides/${row.id}/${cell.date}`;
  const f = useSubmit(async () => {
    await api.put('/api/v1/attendance/roster-overrides', { employeeId: row.id, date: cell.date, shiftId: choice === 'off' ? null : choice, reason: reason.trim() });
    // A day that had no change of its own can be taken straight back.
    toast('Day changed', 'ok', cell.source === 'override' ? undefined : { label: 'Undo', onClick: () => { void api.del(url).then(invalidateRoster).then(() => toast('Change removed')).catch(() => toast('The change could not be undone. Open the day to remove it.', 'error')); } });
    await invalidateRoster();
    onClose();
  }, { validate: (): FieldErrors => (reason.trim().length < 3 ? { reason: 'Say why, in at least 3 characters' } : {}) });
  const remove = async () => {
    setRemoving(true);
    f.setError(null);
    try { await api.del(url); toast('Change removed'); await invalidateRoster(); onClose(); } catch (x) { f.setError(x); setRemoving(false); }
  };
  return (
    <Modal title={`${row.name}: ${fmtDate(cell.date)}`} onClose={onClose}>
      <form className="stack-3" onSubmit={f.submit}>
        <p className="text-sm text-2">A change for this one day: a swap, cover for a colleague, or an extra day off. It replaces the roster for the day, and attendance is recalculated.</p>
        <Select label="Works" value={choice} onChange={(e) => setChoice(e.target.value)} options={[...shifts.map((s) => ({ value: s.id, label: `${s.code}: ${s.name} (${hhmm(s.start_time)}–${hhmm(s.end_time)})` })), { value: 'off', label: 'Day off' }]} />
        <Input label="Reason" required maxLength={200} error={f.errors['reason']} value={reason} onChange={(e) => { setReason(e.target.value); f.clearError('reason'); }} placeholder="For example, swap with a colleague" />
        <FormActions error={f.error} busy={f.busy} submitLabel="Save" onCancel={onClose} extra={cell.source === 'override' && <Button variant="danger-ghost" loading={removing} onClick={() => void remove()}>Remove change</Button>} />
      </form>
    </Modal>
  );
}

/** Phones: a two-week grid cannot fit, so one person lists their days, and a team lists one day at a time. */
function RosterList({ data, today, onEdit }: { data: RosterData; today: string; onEdit: (row: Row, cell: Cell) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && data.dates.includes(picked) ? picked : data.dates.includes(today) ? today : data.dates[0]!;
  const only = data.items.length === 1 ? data.items[0]! : null;
  if (only) {
    return (
      <div className="stack-2">
        <p className="roster-list__who"><strong>{only.name}</strong> <span className="text-sm text-2">{only.code}{only.department ? ` · ${only.department}` : ''}</span></p>
        <ul className="roster-list list-plain" aria-label="Roster">
          {only.days.map((c) => (
            <li key={c.date} data-record className={`roster-list__item${c.date === today ? ' roster-list__item--today' : ''}`}>
              <span className="tnum">{weekday(c.date)}, {fmtDate(c.date)}{c.date === today && <span className="text-sm text-2"> (today)</span>}</span>
              <CellControl row={only} cell={c} shifts={data.shifts} canEdit={data.canEdit} onEdit={onEdit} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="stack-2">
      <Select label="Day" value={day} onChange={(e) => setPicked(e.target.value)} options={data.dates.map((d) => ({ value: d, label: `${weekday(d)}, ${fmtDate(d)}${d === today ? ' (today)' : ''}` }))} />
      <ul className="roster-list list-plain" aria-label={`Roster for ${fmtDate(day)}`}>
        {data.items.map((r) => {
          const c = r.days.find((x) => x.date === day);
          return (
            <li key={r.id} data-record className="roster-list__item">
              <span className="roster-list__who">{r.name}<span className="table__cell-sub roster-list__sub">{r.code}{r.department ? ` · ${r.department}` : ''}</span></span>
              {c && <CellControl row={r} cell={c} shifts={data.shifts} canEdit={data.canEdit} onEdit={onEdit} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The roster: who works which shift, day by day. Scope comes from the server (everyone, my team, or me). */
export function RosterGrid({ title = 'Roster' }: { title?: string }) {
  const today = todayLocal();
  const phone = useMediaQuery(CARD_LIST_QUERY);
  const [from, setFrom] = useState(mondayOf(today));
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const to = addDays(from, 13);
  const query = useApiQuery<RosterData>(`/api/v1/attendance/roster${qs({ from, to, search: debounced })}`, { placeholderData: (p) => p });
  const [edit, setEdit] = useState<{ row: Row; cell: Cell } | null>(null);
  const onEdit = (row: Row, cell: Cell) => setEdit({ row, cell });
  const columnsFor = (d: RosterData): Column<Row>[] => [
    { key: 'employee', header: 'Employee', required: true, cell: (r) => <>{r.name}<div className="table__cell-sub">{r.code}{r.department ? ` · ${r.department}` : ''}</div></> },
    ...d.dates.map((date): Column<Row> => ({
      key: date,
      header: `${dayHead(date)}${date === today ? ' (today)' : ''}`,
      className: date === today ? 'roster-col--today' : undefined,
      cell: (r) => { const c = r.days.find((x) => x.date === date); return c ? <CellControl row={r} cell={c} shifts={d.shifts} canEdit={d.canEdit} onEdit={onEdit} /> : null; },
    })),
  ];
  return (
    <div className="stack-3">
      <h2>{title}</h2>
      <FilterBar
        search={{ value: search, onChange: setSearch, label: 'Search people', placeholder: 'Search people' }}
        actions={(
          <div className="cluster">
            <Button size="sm" iconOnly aria-label="Previous week" icon={<ChevronLeft aria-hidden="true" />} onClick={() => setFrom(addDays(from, -7))} />
            <span className="roster-range">{fmtDate(from)} – {fmtDate(to)}</span>
            <Button size="sm" iconOnly aria-label="Next week" icon={<ChevronRight aria-hidden="true" />} onClick={() => setFrom(addDays(from, 7))} />
            {from !== mondayOf(today) && <Button size="sm" onClick={() => setFrom(mondayOf(today))}>This week</Button>}
          </div>
        )}
      />
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<CalendarClock />} title="No one to show" description="Nobody matches this search, or no one is on a shift yet." />}>
        {(d) => (
          <>
            <div className="roster-legend">
              {d.shifts.map((s) => <Badge key={s.id} tone={toneFor(d.shifts, s.id)}>{s.code} {hhmm(s.start_time)}–{hhmm(s.end_time)}</Badge>)}
              <span className="text-xs text-2">* changed for the day{d.canEdit ? `. ${phone ? 'Tap' : 'Press'} a day to change it` : ''}</span>
            </div>
            {phone
              ? <RosterList data={d} today={today} onEdit={onEdit} />
              : <div className="roster-grid"><Table label="Roster" columns={columnsFor(d)} rows={d.items} rowKey={(r) => r.id} refreshing={query.isPlaceholderData} /></div>}
            {edit && <OverrideForm row={edit.row} cell={edit.cell} shifts={d.shifts} onClose={() => setEdit(null)} />}
          </>
        )}
      </QueryState>
    </div>
  );
}

const DEFAULT_DAYS = (first: string | null) => [...Array<string | null>(5).fill(first), null, null];

function PatternForm({ pattern, shifts, onClose, onSaved }: { pattern: Pattern | null; shifts: readonly RosterShift[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(pattern?.code ?? '');
  const [name, setName] = useState(pattern?.name ?? '');
  // Longer than `count` while someone edits the length, so a cleared field or a shorter number loses no choices.
  const [days, setDays] = useState<(string | null)[]>(pattern?.days ?? DEFAULT_DAYS(shifts[0]?.id ?? null));
  const [count, setCount] = useState(days.length);
  const [lengthText, setLengthText] = useState(String(days.length));
  const [status, setStatus] = useState(pattern?.status ?? 'active');
  const fixed = !!pattern?.used;
  const setLength = (text: string) => {
    setLengthText(text);
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 56) return;
    setCount(n);
    if (n > days.length) setDays([...days, ...Array<string | null>(n - days.length).fill(null)]);
  };
  const f = useSubmit(async () => {
    const cycle = days.slice(0, count);
    if (pattern) await api.patch(`/api/v1/attendance/roster-patterns/${pattern.id}`, { name, status, ...(fixed ? {} : { days: cycle }) });
    else await api.post('/api/v1/attendance/roster-patterns', { code, name, days: cycle });
    onSaved();
    onClose();
  }, { validate: (): FieldErrors => { const n = Number(lengthText); return !fixed && (!Number.isInteger(n) || n < 1 || n > 56) ? { days: 'Enter a whole number from 1 to 56' } : {}; } });
  return (
    <Modal title={pattern ? `Edit pattern ${pattern.code}` : 'New roster pattern'} size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={f.submit}>
        <div className="columns-form">
          <Input label="Code" required disabled={!!pattern} maxLength={20} error={f.errors['code']} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="For example, ROT-3S" />
          <Input label="Name" required minLength={2} error={f.errors['name']} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, three-shift rotation" />
        </div>
        {fixed
          ? <Alert tone="warn">People have followed this pattern, so its days cannot change. Create a new pattern and move them to it.</Alert>
          : <Input label="Days in the cycle" hint="1 to 56 days. The cycle repeats." type="number" inputMode="numeric" min={1} max={56} required error={f.errors['days']} value={lengthText} onChange={(e) => { setLength(e.target.value); f.clearError('days'); }} />}
        <div className="roster-days">
          {days.slice(0, count).map((d, i) => <Select key={i} label={`Day ${i + 1}`} disabled={fixed} value={d ?? ''} placeholder="Off" options={shifts.map((s) => ({ value: s.id, label: s.code }))} onChange={(e) => setDays(days.map((x, k) => (k === i ? e.target.value || null : x)))} />)}
        </div>
        {pattern && <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (cannot be assigned)' }]} />}
        <FormActions error={f.error} busy={f.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function AssignRoster({ pattern, shifts, onClose, onDone }: { pattern: Pattern; shifts: readonly RosterShift[]; onClose: () => void; onDone: (m: string) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(todayLocal());
  const [startDay, setStartDay] = useState(0);
  const code = (id: string | null) => (id ? shifts.find((s) => s.id === id)?.code ?? '?' : 'Off');
  // The date field is empty while someone retypes it, and there is nothing to preview from then.
  const preview = !from ? [] : Array.from({ length: Math.min(14, Math.max(7, pattern.days.length)) }, (_, i) => ({ date: addDays(from, i), shift: pattern.days[(startDay + i) % pattern.days.length] ?? null }));
  const f = useSubmit(async () => {
    const r = await api.post<{ assigned: number }>('/api/v1/attendance/roster-assignments', { employeeIds: Object.keys(selected), patternId: pattern.id, effectiveFrom: from, startDay });
    onDone(`${r.assigned} ${r.assigned === 1 ? 'person' : 'people'} on ${pattern.code} from ${fmtDate(from)}`);
    onClose();
  }, { validate: (): FieldErrors => (Object.keys(selected).length ? {} : { people: 'Select at least one person' }) });
  return (
    <Modal title={`Put people on ${pattern.code}`} onClose={onClose}>
      <form className="stack-3" onSubmit={f.submit}>
        <div className="columns-form">
          <DatePicker label="From" required hint="Their previous roster ends the day before" min={addDays(todayLocal(), -31)} value={from} onChange={(e) => setFrom(e.target.value)} />
          <Select label="Starting on cycle day" hint="Stagger crews by starting them on different days" value={String(startDay)} onChange={(e) => setStartDay(Number(e.target.value))} options={pattern.days.map((d, i) => ({ value: String(i), label: `Day ${i + 1} (${code(d)})` }))} />
        </div>
        <div className="roster-preview" role="group" aria-label="Preview">{preview.map((p) => <Badge key={p.date} tone={p.shift ? toneFor(shifts, p.shift) : 'neutral'} title={fmtDate(p.date)}>{weekday(p.date)} {code(p.shift)}</Badge>)}</div>
        <PeoplePicker selected={selected} onChange={(s) => { setSelected(s); f.clearError('people'); }} />
        <FormActions error={f.errors['people'] ?? f.error} busy={f.busy} submitLabel="Put on roster" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EndRoster({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [lastDay, setLastDay] = useState(todayLocal());
  const f = useSubmit(async () => {
    await api.post('/api/v1/attendance/roster-assignments/end', { employeeIds: Object.keys(selected), lastDay });
    onDone('Roster ended');
    onClose();
  }, { validate: (): FieldErrors => (Object.keys(selected).length ? {} : { people: 'Select at least one person' }) });
  return (
    <Modal title="Take people off their roster" onClose={onClose}>
      <form className="stack-3" onSubmit={f.submit}>
        <p className="text-sm text-2">After the last day they work their fixed shift again (Shifts, then Assign).</p>
        <DatePicker label="Last day on the roster" required min={addDays(todayLocal(), -32)} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
        <PeoplePicker selected={selected} onChange={(s) => { setSelected(s); f.clearError('people'); }} />
        <FormActions error={f.errors['people'] ?? f.error} busy={f.busy} submitLabel="End roster" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/** Attendance setup, Rosters: patterns, who follows them, and the roster itself. */
export function RosterSetup() {
  const toast = useToast();
  const patterns = useApiQuery<{ items: Pattern[] }>('/api/v1/attendance/roster-patterns');
  const shifts = useApiQuery<{ items: Shift[] }>('/api/v1/attendance/shifts');
  const [form, setForm] = useState<Pattern | null | undefined>(undefined);
  const [assign, setAssign] = useState<Pattern | null>(null);
  const [ending, setEnding] = useState(false);
  const all = shifts.data?.items ?? [];
  const active = all.filter((s) => s.status === 'active');
  const done = (m: string) => { toast(m); void invalidateRoster(); };
  const codeOf = (id: string | null) => (id ? all.find((s) => s.id === id)?.code ?? '?' : 'Off');
  const columns: Column<Pattern>[] = [
    { key: 'pattern', header: 'Pattern', card: 'title', cell: (p) => <><strong className="mono">{p.code}</strong><div className="table__cell-sub">{p.name}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'cycle', header: 'Cycle', cell: (p) => <><div className="roster-preview">{p.days.map((d, i) => <Badge key={i} tone={d ? toneFor(all, d) : 'neutral'}>{codeOf(d)}</Badge>)}</div><div className="table__cell-sub">{p.days.length} {p.days.length === 1 ? 'day' : 'days'}</div></> },
    { key: 'people', header: 'People', align: 'right', cell: (p) => p.employees },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (p) => <div className="table__actions">{p.status === 'active' && <Button size="sm" variant="primary" onClick={() => setAssign(p)}>Assign</Button>}<Button size="sm" onClick={() => setForm(p)}>Edit</Button></div> },
  ];
  return (
    <div className="stack-6">
      <Card
        title="Rotating patterns"
        aria-label="Roster patterns"
        actions={<div className="cluster"><Button size="sm" onClick={() => setEnding(true)}>End roster…</Button><Button size="sm" variant="primary" disabled={!active.length} onClick={() => setForm(null)}>New pattern</Button></div>}
      >
        <div className="stack-3">
          <p className="text-sm text-2">A cycle of shifts and days off that repeats, such as two mornings, two evenings, two nights, two off. On rostered days the pattern decides days off instead of the weekly-off setting. Holidays still apply.</p>
          {shifts.isSuccess && !active.length && <Alert tone="warn">Create an active shift first. Patterns are built from shifts.</Alert>}
          <QueryState query={patterns} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<Repeat />} title="No patterns yet" />}>
            {(d) => <Table label="Patterns" columns={columns} rows={d.items} rowKey={(p) => p.id} />}
          </QueryState>
        </div>
      </Card>
      <RosterGrid title="Roster" />
      {form !== undefined && <PatternForm pattern={form} shifts={active} onClose={() => setForm(undefined)} onSaved={() => done('Pattern saved')} />}
      {assign && <AssignRoster pattern={assign} shifts={all} onClose={() => setAssign(null)} onDone={done} />}
      {ending && <EndRoster onClose={() => setEnding(false)} onDone={done} />}
    </div>
  );
}

/** /attendance/roster: the signed-in person's roster, or their team's. */
export function RosterPage() {
  return (
    <div className="stack-4">
      <PageHeader title="Roster" description="Shifts and days off for the next two weeks. Ask HR to change a day (a swap or cover)." />
      <RosterGrid title="Shifts" />
    </div>
  );
}
