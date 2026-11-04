import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { fmtDate, fmtDateTime, money } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Field, Modal, Confirm, useToast, errText } from '../ui';

type ColType = 'text' | 'int' | 'number' | 'percent' | 'money' | 'date';
interface Column { key: string; label: string; type: ColType }
interface ParamDef { key: string; label: string; type: 'date' | 'month' | 'select' | 'int'; options?: { value: string; label: string }[]; min?: number; max?: number; default: string | number }
interface ReportInfo { key: string; name: string; description: string; category: string; scope: 'all' | 'team'; params: ParamDef[] }
interface ReportData { key: string; name: string; generatedAt: string; scope: 'all' | 'team'; params: Record<string, string | number>; columns: Column[]; rows: Record<string, unknown>[]; totals: Record<string, unknown> | null; notes: string[]; truncated: boolean }

const NUMERIC: ColType[] = ['int', 'number', 'percent', 'money'];
const CODE_COLS = new Set(['employee_code', 'code', 'course_code', 'method_code']);
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export function fmtCell(type: ColType, v: unknown): string {
  if (v == null || v === '') return '—';
  switch (type) {
    case 'money': return money(v as number);
    case 'percent': return `${nf.format(Number(v))}%`;
    case 'date': return fmtDate(String(v));
    case 'int': case 'number': return nf.format(Number(v));
    default: return String(v);
  }
}

export function Reports() {
  const [sp] = useSearchParams();
  const key = sp.get('r');
  const snapshot = sp.get('snapshot');
  const { data, loading, error } = useLoad(() => api.get<{ items: ReportInfo[]; today: string; advanced: boolean }>('/api/v1/reports'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const items = data!.items;
  const def = key ? items.find((i) => i.key === key) : undefined;
  return (
    <div className="stack">
      <div><h1>Reports</h1><p className="sub">Headcount, attrition, attendance, leave, pay and compliance reports. View on screen or download as Excel or CSV; downloads are recorded.</p></div>
      {snapshot ? <SnapshotView id={snapshot} />
        : !items.length ? <Empty>No reports are available for your role.</Empty>
        : key && !def ? <><ErrorBox error="This report is not available to you." /><Link to="/reports">All reports</Link></>
          : def ? <ReportView def={def} key={def.key} advanced={data!.advanced} /> : <>{data!.advanced && <><SentToMe /><SavedReports items={items} /></>}<Catalogue items={items} /></>}
    </div>
  );
}

const FREQ: Record<string, string> = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
const PERIOD: Record<string, string> = { as_saved: 'The saved dates', yesterday: 'Yesterday', last_7_days: 'The last 7 days', last_month: 'Last month', month_to_date: 'This month so far', year_to_date: 'This year so far' };
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const scheduleText = (s: any) => `${FREQ[s.frequency]}${s.frequency === 'weekly' ? ` on ${WEEKDAY[s.weekday]}` : s.frequency === 'monthly' ? ` on day ${s.dayOfMonth}` : ''} · ${PERIOD[s.period]}`;

function SentToMe() {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/reports/snapshots'), []);
  if (loading || error || !data.items.length) return null;
  return (
    <section className="card stack" aria-labelledby="rp-sent">
      <h2 id="rp-sent" style={{ fontSize: 15, margin: 0 }}>Sent to me</h2>
      <div className="table-wrap"><table className="t" aria-label="Reports sent to me"><thead><tr><th>Report</th><th>From</th><th>Generated</th><th>Rows</th></tr></thead><tbody>
        {data.items.slice(0, 10).map((s: any) => <tr key={s.id}><td><Link to={`/reports?snapshot=${s.id}`}>{s.name}</Link></td><td>{s.owner}</td><td>{fmtDateTime(s.generated_at)}</td><td>{s.row_count}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

function SavedReports({ items }: { items: ReportInfo[] }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/reports/saved'), []);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [remove, setRemove] = useState<any | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.items.length) return null;
  return (
    <section className="card stack" aria-labelledby="rp-saved">
      <h2 id="rp-saved" style={{ fontSize: 15, margin: 0 }}>My saved reports</h2>
      <div className="table-wrap"><table className="t" aria-label="My saved reports"><thead><tr><th>Name</th><th>Report</th><th>Schedule</th><th /></tr></thead><tbody>
        {data.items.map((s: any) => <tr key={s.id}>
          <td>{items.some((i) => i.key === s.report_key) ? <Link to={`/reports${qs({ r: s.report_key, ...s.params })}`}>{s.name}</Link> : s.name}</td><td>{s.reportName}</td>
          <td>{s.schedule ? <>{scheduleText(s.schedule)}{!s.schedule.enabled && <span className="badge warn" style={{ marginLeft: 6 }}>Paused</span>}
            <div className="muted" style={{ fontSize: 12 }}>Next {fmtDate(s.schedule.nextRunOn)}{s.schedule.recipientIds.length ? ` · +${s.schedule.recipientIds.length} recipient(s)` : ''}{s.schedule.lastResult ? ` · ${s.schedule.lastResult}` : ''}</div></>
            : <span className="muted">—</span>}</td>
          <td className="row" style={{ gap: 4 }}><button className="btn sm" onClick={() => setSchedule(s)}>{s.schedule ? 'Edit schedule' : 'Schedule'}</button>
            <button className="btn sm danger" onClick={() => setRemove(s)}>Delete</button></td></tr>)}
      </tbody></table></div>
      {schedule && <ScheduleForm saved={schedule} onClose={() => setSchedule(null)} onSaved={(next) => { toast(`Scheduled; next run ${fmtDate(next)}`); reload(); }} />}
      {remove && <Confirm title="Delete saved report" danger confirmLabel="Delete" onClose={() => setRemove(null)} message={`Delete “${remove.name}”${remove.schedule ? ' and its schedule' : ''}?`}
        onConfirm={async () => { await api.del(`/api/v1/reports/saved/${remove.id}`); toast('Deleted'); reload(); }} />}
    </section>
  );
}

function ScheduleForm({ saved, onClose, onSaved }: { saved: any; onClose: () => void; onSaved: (next: string) => void }) {
  const toast = useToast();
  const s0 = saved.schedule;
  const [f, setF] = useState({ frequency: s0?.frequency ?? 'monthly', weekday: String(s0?.weekday ?? 1), dayOfMonth: String(s0?.dayOfMonth ?? 1), period: s0?.period ?? 'last_month', enabled: s0?.enabled ?? true });
  const [to, setTo] = useState<string[]>(s0?.recipientIds ?? []);
  const people = useLoad(() => api.get(`/api/v1/reports/saved/${saved.id}/recipients`), [saved.id]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Schedule — ${saved.name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try {
          const r = await api.put(`/api/v1/reports/saved/${saved.id}/schedule`, { frequency: f.frequency, weekday: f.frequency === 'weekly' ? Number(f.weekday) : undefined,
            dayOfMonth: f.frequency === 'monthly' ? Number(f.dayOfMonth) : undefined, period: f.period, recipientIds: to, enabled: f.enabled });
          onSaved(r.nextRunOn); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="How often"><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {f.frequency === 'weekly' && <Field label="On"><select value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>{WEEKDAY.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
          {f.frequency === 'monthly' && <Field label="On day"><input type="number" min={1} max={28} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} style={{ width: 80 }} /></Field>}
          <Field label="Covering"><select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>{Object.entries(PERIOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6 }}><legend>Also send to</legend>
          {people.loading ? <Loading /> : !people.data?.items.length ? <div className="muted">Only you (nobody else can see this report for the whole organization, or it is limited to your team).</div>
            : <div className="stack" style={{ gap: 4, maxHeight: 200, overflow: 'auto' }}>{people.data.items.map((p: any) => <label key={p.id} className="row">
                <input type="checkbox" checked={to.includes(p.id)} onChange={(e) => setTo(e.target.checked ? [...to, p.id] : to.filter((x) => x !== p.id))} /> {p.name} <span className="muted">{p.email}</span></label>)}</div>}
          <div className="muted" style={{ fontSize: 12 }}>They are told in HRMS (and by email) that it is ready; the report itself stays in HRMS.</div>
        </fieldset>
        <label className="row"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Active</label>
        <ErrorBox error={error} />
        <div className="row">{s0 && <button type="button" className="btn danger" onClick={async () => { try { await api.del(`/api/v1/reports/saved/${saved.id}/schedule`); toast('Schedule removed'); onClose(); onSaved(''); } catch (x) { setError(errText(x)); } }}>Remove schedule</button>}
          <span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}</button></div>
      </form>
    </Modal>
  );
}

function SnapshotView({ id }: { id: string }) {
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/reports/snapshots/${id}`), [id]);
  return (
    <div className="stack">
      <div className="row"><Link to="/reports">← All reports</Link></div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : <>
        <div className="row"><h2 style={{ margin: 0 }}>{data.name}</h2><span className="badge info">Scheduled copy</span></div>
        <Result data={{ ...data, truncated: false }} csvHref={`/api/v1/reports/snapshots/${id}/export.csv`} />
      </>}
    </div>
  );
}

function SaveButton({ def, params }: { def: ReportInfo; params: Record<string, string> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(def.name);
  const [error, setError] = useState<string | null>(null);
  return <>
    <button className="btn sm" onClick={() => setOpen(true)}>Save report</button>
    {open && <Modal title="Save report" onClose={() => setOpen(false)}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null);
        try { await api.post('/api/v1/reports/saved', { reportKey: def.key, name, params }); toast('Saved. Find it, and schedule it, under All reports.'); setOpen(false); } catch (x) { setError(errText(x)); }
      }}>
        <Field label="Name"><input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="muted" style={{ fontSize: 13 }}>Saves the options you ran it with.</div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>}
  </>;
}

function Catalogue({ items }: { items: ReportInfo[] }) {
  const groups = [...new Set(items.map((i) => i.category))];
  return (
    <div className="stack" style={{ gap: 20 }}>
      {groups.map((g) => (
        <section key={g} aria-label={g}>
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>{g}</h2>
          <div className="grid grid-2">
            {items.filter((i) => i.category === g).map((i) => (
              <div className="card stack" key={i.key} style={{ gap: 6 }}>
                <div className="row"><Link to={`/reports?r=${i.key}`} style={{ fontWeight: 600 }}>{i.name}</Link>{i.scope === 'team' && <span className="badge info">Your team</span>}</div>
                <div className="muted" style={{ fontSize: 13 }}>{i.description}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReportView({ def, advanced }: { def: ReportInfo; advanced: boolean }) {
  const [sp, setSp] = useSearchParams();
  /** Parameters come from the URL (shareable, back button works); missing ones use the report's defaults. */
  const current = useMemo(() => Object.fromEntries(def.params.map((p) => [p.key, sp.get(p.key) ?? String(p.default)])), [def, sp]);
  const query = qs(current);
  const res = useLoad(() => api.get<ReportData>(`/api/v1/reports/${def.key}${query}`), [def.key, query]);
  const run = (values: Record<string, string>) => setSp({ r: def.key, ...values });
  return (
    <div className="stack">
      <div className="row"><Link to="/reports">← All reports</Link></div>
      <div className="row"><h2 style={{ margin: 0 }}>{def.name}</h2>{def.scope === 'team' && <span className="badge info">Your team</span>}<span className="spacer" />
        {advanced && <SaveButton def={def} params={current} />}</div>
      <p className="muted" style={{ margin: 0 }}>{def.description}</p>
      <ParamForm def={def} initial={current} onRun={run} key={query} />
      {res.loading ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : <Result data={res.data!} csvHref={`/api/v1/reports/${def.key}/export.csv${query}`} />}
    </div>
  );
}

function ParamForm({ def, initial, onRun }: { def: ReportInfo; initial: Record<string, string>; onRun: (v: Record<string, string>) => void }) {
  const [v, setV] = useState(initial);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const submit = (e: FormEvent) => { e.preventDefault(); onRun(v); };
  return (
    <form className="card row" onSubmit={submit} aria-label="Report options" style={{ alignItems: 'flex-end' }}>
      {def.params.map((p) => (
        <div key={p.key} style={{ minWidth: 150 }}>
          <Field label={p.label}>
            {p.type === 'select'
              ? <select value={v[p.key]} onChange={(e) => set(p.key, e.target.value)}>{p.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input type={p.type === 'int' ? 'number' : p.type} value={v[p.key]} min={p.min} max={p.max} required onChange={(e) => set(p.key, e.target.value)} />}
          </Field>
        </div>
      ))}
      <button className="btn primary" type="submit" style={{ marginBottom: 12 }}>Run report</button>
    </form>
  );
}

function Result({ data, csvHref }: { data: ReportData; csvHref: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState('');
  const textCols = data.columns.filter((c) => c.type === 'text');
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let r = f ? data.rows.filter((row) => textCols.some((c) => String(row[c.key] ?? '').toLowerCase().includes(f))) : data.rows;
    if (sort) {
      const col = data.columns.find((c) => c.key === sort.key)!;
      const num = NUMERIC.includes(col.type);
      r = [...r].sort((a, b) => {
        const x = a[sort.key]; const y = b[sort.key];
        if (x == null) return y == null ? 0 : 1;
        if (y == null) return -1;
        return (num ? Number(x) - Number(y) : String(x).localeCompare(String(y), 'en-IN', { numeric: true })) * sort.dir;
      });
    }
    return r;
  }, [data, sort, filter, textCols]);
  const toggle = (k: string) => setSort((s) => (s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }));
  const align = (c: Column) => (NUMERIC.includes(c.type) ? 'right' as const : 'left' as const);
  return (
    <div className="stack">
      <div className="row">
        <span className="muted">{data.rows.length === 1 ? '1 row' : `${nf.format(data.rows.length)} rows`} · generated {fmtDateTime(data.generatedAt)}</span>
        <span className="spacer" />
        {data.rows.length > 10 && textCols.length > 0 && <input type="search" placeholder="Filter rows" aria-label="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }} />}
        <a className="btn sm" href={csvHref.replace('/export.csv', '/export.xlsx')} style={{ textDecoration: 'none' }} download>Download Excel</a>
        <a className="btn sm" href={csvHref} style={{ textDecoration: 'none' }} download>Download CSV</a>
      </div>
      {data.notes.map((n) => <div key={n} className="muted" style={{ fontSize: 13 }}>{n}</div>)}
      {!data.rows.length ? <Empty>No data for these options.</Empty> : (
        <div className="table-wrap">
          <table className="t" aria-label={data.name}>
            <thead><tr>{data.columns.map((c) => (
              <th key={c.key} style={{ textAlign: align(c) }} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => toggle(c.key)} style={{ all: 'unset', cursor: 'pointer' }} title="Sort">
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </button>
              </th>))}</tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>{data.columns.map((c) => {
                const v = r[c.key];
                const negative = c.key === 'days_left' && typeof v === 'number' && v < 0;
                return <td key={c.key} style={{ textAlign: align(c), whiteSpace: c.type !== 'text' || CODE_COLS.has(c.key) ? 'nowrap' : undefined }}>{negative ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtCell(c.type, v)}</span> : fmtCell(c.type, v)}</td>;
              })}</tr>))}</tbody>
            {data.totals && !filter && (
              <tfoot><tr>{data.columns.map((c, i) => (
                <td key={c.key} style={{ textAlign: align(c), fontWeight: 600, borderTop: '2px solid var(--border)' }}>
                  {i === 0 ? 'Total' : c.type === 'text' || data.totals![c.key] === undefined ? '' : fmtCell(c.type, data.totals![c.key])}
                </td>))}</tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
