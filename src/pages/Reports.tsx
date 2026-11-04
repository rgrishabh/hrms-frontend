import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { fmtDate, fmtDateTime, money } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Field } from '../ui';

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
  const { data, loading, error } = useLoad(() => api.get<{ items: ReportInfo[]; today: string }>('/api/v1/reports'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const items = data!.items;
  const def = key ? items.find((i) => i.key === key) : undefined;
  return (
    <div className="stack">
      <div><h1>Reports</h1><p className="sub">Headcount, attrition, attendance, leave, pay and compliance reports. View on screen or download as CSV; downloads are recorded.</p></div>
      {!items.length ? <Empty>No reports are available for your role.</Empty>
        : key && !def ? <><ErrorBox error="This report is not available to you." /><Link to="/reports">All reports</Link></>
          : def ? <ReportView def={def} key={def.key} /> : <Catalogue items={items} />}
    </div>
  );
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

function ReportView({ def }: { def: ReportInfo }) {
  const [sp, setSp] = useSearchParams();
  /** Parameters come from the URL (shareable, back button works); missing ones use the report's defaults. */
  const current = useMemo(() => Object.fromEntries(def.params.map((p) => [p.key, sp.get(p.key) ?? String(p.default)])), [def, sp]);
  const query = qs(current);
  const res = useLoad(() => api.get<ReportData>(`/api/v1/reports/${def.key}${query}`), [def.key, query]);
  const run = (values: Record<string, string>) => setSp({ r: def.key, ...values });
  return (
    <div className="stack">
      <div className="row"><Link to="/reports">← All reports</Link></div>
      <div className="row"><h2 style={{ margin: 0 }}>{def.name}</h2>{def.scope === 'team' && <span className="badge info">Your team</span>}</div>
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
