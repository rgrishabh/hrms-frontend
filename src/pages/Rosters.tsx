import { useState } from 'react';
import { api, qs } from '../api';
import { fmtDate, todayLocal, addDays } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Modal, Field, useToast, errText } from '../ui';

type Shift = { id: string; code: string; name: string; start_time: string; end_time: string };
type Cell = { date: string; shiftId: string | null; off: boolean; holiday: string | null; source: 'override' | 'roster' | 'assignment' | null; pattern: string | null; reason: string | null };
type Row = { id: string; code: string; name: string; department: string | null; days: Cell[] };

const TONES = ['info', 'ok', 'warn', 'danger', ''];
const tone = (shifts: Shift[], id: string | null) => TONES[Math.max(0, shifts.findIndex((s) => s.id === id)) % TONES.length];
const hhmm = (t: string) => t.slice(0, 5);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mondayOf = (d: string) => { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, -((wd + 6) % 7)); };

function CellView({ c, shifts }: { c: Cell; shifts: Shift[] }) {
  const s = shifts.find((x) => x.id === c.shiftId);
  const label = c.holiday ? 'Holiday' : c.off ? 'Off' : s?.code ?? '—';
  const title = [c.holiday ?? (c.off ? 'Day off' : s ? `${s.name} ${hhmm(s.start_time)}–${hhmm(s.end_time)}` : 'No shift'), c.source === 'override' ? `Changed: ${c.reason}` : c.pattern ? `Roster ${c.pattern}` : null].filter(Boolean).join(' · ');
  return <span className={`badge ${c.holiday || c.off ? '' : tone(shifts, c.shiftId)}`} title={title} style={c.source === 'override' ? { outline: '2px dashed var(--brand)', outlineOffset: 1 } : undefined}>{label}{c.source === 'override' ? '*' : ''}</span>;
}

function OverrideForm({ row, cell, shifts, onClose, onSaved }: { row: Row; cell: Cell; shifts: Shift[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [choice, setChoice] = useState(cell.off ? 'off' : cell.shiftId ?? 'off');
  const [reason, setReason] = useState(cell.source === 'override' ? cell.reason ?? '' : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`${row.name}: ${fmtDate(cell.date)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api.put('/api/v1/attendance/roster-overrides', { employeeId: row.id, date: cell.date, shiftId: choice === 'off' ? null : choice, reason: reason.trim() });
          onSaved('Day changed'); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <p className="hint">A change for this one day: a swap, cover for a colleague, or an extra day off. It replaces the roster for the day; attendance is recalculated.</p>
        <Field label="Works"><select value={choice} onChange={(e) => setChoice(e.target.value)}>
          {shifts.map((s) => <option key={s.id} value={s.id}>{s.code}: {s.name} ({hhmm(s.start_time)}–{hhmm(s.end_time)})</option>)}
          <option value="off">Day off</option></select></Field>
        <Field label="Reason"><input required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Swap with Priya (N crew)" /></Field>
        <ErrorBox error={error} />
        <div className="row">
          {cell.source === 'override' && <button type="button" className="btn danger" onClick={async () => {
            try { await api.del(`/api/v1/attendance/roster-overrides/${row.id}/${cell.date}`); onSaved('Change removed'); onClose(); } catch (x) { setError(errText(x)); }
          }}>Remove change</button>}
          <span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

/** The roster: who works which shift, day by day. Scope comes from the server (everyone / my team / me). */
export function RosterGrid({ title = 'Roster' }: { title?: string }) {
  const toast = useToast();
  const [from, setFrom] = useState(mondayOf(todayLocal()));
  const [search, setSearch] = useState('');
  const to = addDays(from, 13);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/attendance/roster${qs({ from, to, search: search || undefined })}`), [from, search]);
  const [edit, setEdit] = useState<{ row: Row; cell: Cell } | null>(null);
  const today = todayLocal();
  return (
    <div className="stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>{title}</h2><span className="spacer" />
        <input placeholder="Search people" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        <button className="btn" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">‹</button>
        <span className="muted">{fmtDate(from)} – {fmtDate(to)}</span>
        <button className="btn" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week">›</button>
        {from !== mondayOf(today) && <button className="btn sm" onClick={() => setFrom(mondayOf(today))}>This week</button>}
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No one to show.</Empty> : (
        <>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{data.shifts.map((s: Shift) => <span key={s.id} className={`badge ${tone(data.shifts, s.id)}`}>{s.code} {hhmm(s.start_time)}–{hhmm(s.end_time)}</span>)}
            <span className="muted" style={{ fontSize: 12 }}>* changed for the day{data.canEdit ? ' · click a day to change it' : ''}</span></div>
          <div className="table-wrap"><table className="t" aria-label="Roster"><thead><tr><th style={{ position: 'sticky', left: 0, background: 'var(--surface, var(--bg))' }}>Employee</th>
            {data.dates.map((d: string) => <th key={d} style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: d === today ? 700 : undefined }}>{WD[new Date(`${d}T00:00:00Z`).getUTCDay()]}<div className="muted">{d.slice(8)}</div></th>)}</tr></thead>
            <tbody>{data.items.map((r: Row) => (
              <tr key={r.id}><td style={{ position: 'sticky', left: 0, background: 'var(--surface, var(--bg))', whiteSpace: 'nowrap' }}>{r.name}<div className="muted">{r.code}{r.department ? ` · ${r.department}` : ''}</div></td>
                {r.days.map((c) => <td key={c.date} style={{ textAlign: 'center', padding: 4 }}>
                  {data.canEdit ? <button className="btn sm" style={{ border: 'none', background: 'none', padding: 0 }} aria-label={`${r.name} ${c.date}`} onClick={() => setEdit({ row: r, cell: c })}><CellView c={c} shifts={data.shifts} /></button>
                    : <CellView c={c} shifts={data.shifts} />}</td>)}</tr>))}
            </tbody></table></div>
        </>
      )}
      {edit && <OverrideForm row={edit.row} cell={edit.cell} shifts={data.shifts} onClose={() => setEdit(null)} onSaved={(m) => { toast(m); reload(); }} />}
    </div>
  );
}

function PatternForm({ pattern, shifts, onClose, onSaved }: { pattern: any | null; shifts: Shift[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(pattern?.code ?? '');
  const [name, setName] = useState(pattern?.name ?? '');
  const [days, setDays] = useState<(string | null)[]>(pattern?.days ?? [...Array(5).fill(shifts[0]?.id ?? null), null, null]);
  const [status, setStatus] = useState(pattern?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const fixed = !!pattern?.used;
  const resize = (n: number) => setDays(n > days.length ? [...days, ...Array(n - days.length).fill(null)] : days.slice(0, n));
  return (
    <Modal title={pattern ? `Edit pattern ${pattern.code}` : 'New roster pattern'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          if (pattern) await api.patch(`/api/v1/attendance/roster-patterns/${pattern.id}`, { name, status, ...(fixed ? {} : { days }) });
          else await api.post('/api/v1/attendance/roster-patterns', { code, name, days });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <div className="grid-2">
          <Field label="Code"><input required disabled={!!pattern} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. LAB-3S" maxLength={20} /></Field>
          <Field label="Name"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lab three-shift rotation" /></Field>
        </div>
        {fixed ? <div className="alert warn">People have followed this pattern, so its days cannot change. Create a new pattern and move them to it.</div> : (
          <Field label="Days in the cycle" hint="1–56 days; the cycle repeats"><input type="number" min={1} max={56} value={days.length} onChange={(e) => resize(Math.max(1, Math.min(56, Number(e.target.value) || 1)))} /></Field>)}
        <div className="grid-4" style={{ gap: 6 }}>
          {days.map((d, i) => (
            <Field key={i} label={`Day ${i + 1}`}><select aria-label={`Day ${i + 1}`} disabled={fixed} value={d ?? ''} onChange={(e) => setDays(days.map((x, k) => (k === i ? e.target.value || null : x)))}>
              <option value="">Off</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</select></Field>))}
        </div>
        {pattern && <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive (cannot be assigned)</option></select></Field>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function PeoplePicker({ selected, onChange }: { selected: Record<string, string>; onChange: (s: Record<string, string>) => void }) {
  const [search, setSearch] = useState('');
  const emps = useLoad(() => api.get(`/api/v1/employees${qs({ search, status: 'active', pageSize: 50 })}`), [search]);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input placeholder="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
      <div style={{ maxHeight: 200, overflowY: 'auto' }} className="stack">
        {emps.data?.items.map((e: any) => (
          <label key={e.id} className="row"><input type="checkbox" checked={!!selected[e.id]} onChange={(x) => { const s = { ...selected }; if (x.target.checked) s[e.id] = `${e.first_name} ${e.last_name ?? ''}`.trim(); else delete s[e.id]; onChange(s); }} />
            {e.first_name} {e.last_name} <span className="muted mono">{e.employee_code}</span></label>))}
      </div>
      <span className="muted">{Object.keys(selected).length} selected</span>
    </div>
  );
}

function AssignRoster({ pattern, shifts, onClose, onDone }: { pattern: any; shifts: Shift[]; onClose: () => void; onDone: (m: string) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(todayLocal());
  const [startDay, setStartDay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const code = (id: string | null) => (id ? shifts.find((s) => s.id === id)?.code ?? '?' : 'Off');
  const preview = Array.from({ length: Math.min(14, Math.max(7, pattern.days.length)) }, (_, i) => ({ date: addDays(from, i), shift: pattern.days[(startDay + i) % pattern.days.length] }));
  return (
    <Modal title={`Put people on ${pattern.code}`} onClose={onClose}>
      <div className="stack">
        <div className="grid-2">
          <Field label="From" hint="Their previous roster ends the day before"><input type="date" min={addDays(todayLocal(), -31)} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Starting on cycle day" hint="Stagger crews by starting them on different days">
            <select value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}>{pattern.days.map((d: string | null, i: number) => <option key={i} value={i}>Day {i + 1} ({code(d)})</option>)}</select></Field>
        </div>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }} aria-label="Preview">{preview.map((p) => <span key={p.date} className={`badge ${p.shift ? tone(shifts, p.shift) : ''}`} title={p.date}>{WD[new Date(`${p.date}T00:00:00Z`).getUTCDay()]} {code(p.shift)}</span>)}</div>
        <PeoplePicker selected={selected} onChange={setSelected} />
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!Object.keys(selected).length} onClick={async () => {
            try { const r = await api.post('/api/v1/attendance/roster-assignments', { employeeIds: Object.keys(selected), patternId: pattern.id, effectiveFrom: from, startDay });
              onDone(`${r.assigned} ${r.assigned === 1 ? 'person' : 'people'} on ${pattern.code} from ${fmtDate(from)}`); onClose(); } catch (x) { setError(errText(x)); }
          }}>Put on roster</button></div>
      </div>
    </Modal>
  );
}

function EndRoster({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [lastDay, setLastDay] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Take people off their roster" onClose={onClose}>
      <div className="stack">
        <p className="hint">After the last day they work their fixed shift again (Shifts → Assign).</p>
        <Field label="Last day on the roster"><input type="date" min={addDays(todayLocal(), -32)} value={lastDay} onChange={(e) => setLastDay(e.target.value)} /></Field>
        <PeoplePicker selected={selected} onChange={setSelected} />
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!Object.keys(selected).length} onClick={async () => {
            try { await api.post('/api/v1/attendance/roster-assignments/end', { employeeIds: Object.keys(selected), lastDay }); onDone('Roster ended'); onClose(); } catch (x) { setError(errText(x)); }
          }}>End roster</button></div>
      </div>
    </Modal>
  );
}

/** Attendance setup → Rosters: patterns, who follows them, and the roster itself. */
export function RosterSetup() {
  const toast = useToast();
  const patterns = useLoad(() => api.get('/api/v1/attendance/roster-patterns'), []);
  const shifts = useLoad(() => api.get('/api/v1/attendance/shifts'), []);
  const [form, setForm] = useState<any | null | undefined>(undefined);
  const [assign, setAssign] = useState<any | null>(null);
  const [ending, setEnding] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const active: Shift[] = (shifts.data?.items ?? []).filter((s: any) => s.status === 'active');
  const done = (m: string) => { toast(m); patterns.reload(); setGridKey((k) => k + 1); };
  return (
    <div className="stack">
      <section className="card stack" aria-label="Roster patterns">
        <div className="row"><h2 style={{ margin: 0 }}>Rotating patterns</h2><span className="spacer" />
          <button className="btn" onClick={() => setEnding(true)}>End roster…</button>
          <button className="btn primary" onClick={() => setForm(null)} disabled={!active.length}>New pattern</button></div>
        <p className="hint">A cycle of shifts and days off that repeats, e.g. two mornings, two evenings, two nights, two off. On rostered days the pattern decides days off instead of the weekly-off setting; holidays still apply.</p>
        {patterns.loading || shifts.loading ? <Loading /> : patterns.error ? <ErrorBox error={patterns.error} /> : !patterns.data.items.length ? <Empty>No patterns yet.</Empty> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Pattern</th><th>Cycle</th><th>People</th><th>Status</th><th /></tr></thead><tbody>
            {patterns.data.items.map((p: any) => (
              <tr key={p.id}><td><strong className="mono">{p.code}</strong><div className="muted">{p.name}</div></td>
                <td><div className="row" style={{ gap: 2, flexWrap: 'wrap' }}>{p.days.map((d: string | null, i: number) => <span key={i} className={`badge ${d ? tone(shifts.data.items, d) : ''}`}>{d ? shifts.data.items.find((s: Shift) => s.id === d)?.code : 'Off'}</span>)}</div>
                  <div className="muted">{p.days.length} days</div></td>
                <td>{p.employees}</td><td><StatusBadge status={p.status} /></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>{p.status === 'active' && <button className="btn sm primary" onClick={() => setAssign(p)}>Assign</button>}<button className="btn sm" onClick={() => setForm(p)}>Edit</button></div></td></tr>))}
          </tbody></table></div>
        )}
      </section>
      <section className="card"><RosterGrid key={gridKey} title="Roster" /></section>
      {form !== undefined && <PatternForm pattern={form} shifts={active} onClose={() => setForm(undefined)} onSaved={() => done('Pattern saved')} />}
      {assign && <AssignRoster pattern={assign} shifts={shifts.data.items} onClose={() => setAssign(null)} onDone={done} />}
      {ending && <EndRoster onClose={() => setEnding(false)} onDone={done} />}
    </div>
  );
}

/** /attendance/roster: the signed-in person's roster, or their team's. */
export function RosterPage() {
  return (
    <div className="stack">
      <div><h1>Roster</h1><p className="sub">Shifts and days off for the next two weeks. Ask HR to change a day (swap or cover).</p></div>
      <div className="card"><RosterGrid title="Shifts" /></div>
    </div>
  );
}
