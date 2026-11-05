import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { Input } from '../../components/Input';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { RevealToggle } from '../../components/RevealToggle';
import { Select } from '../../components/Select';
import { Table, type Column, type SortState } from '../../components/Table';
import { fmtDate, fmtDateTime, fmtNumber } from '../../format';
import { qs } from '../../api';
import { useRevealable } from '../../lib/masking';
import { useApiQuery } from '../../lib/query';
import { SaveReportButton } from './SavedReports';
import type { ColType, ReportColumn, ReportData, ReportInfo, ReportRow } from './types';

const NUMERIC: ColType[] = ['int', 'number', 'percent', 'money'];
const CODE_COLUMNS = new Set(['employee_code', 'code', 'course_code', 'method_code']);
const PAGE_SIZE = 100;

function Cell({ column, value, masked }: { column: ReportColumn; value: unknown; masked?: boolean }) {
  if (masked && column.type === 'money' && (value === null || value === undefined)) return <Money value={null} masked />;
  if (value === null || value === undefined || value === '') return <>—</>;
  switch (column.type) {
    case 'money': return <Money value={value as number | string} />;
    case 'percent': return <>{fmtNumber(value as number | string)}%</>;
    case 'date': return <>{fmtDate(String(value))}</>;
    case 'int': case 'number': {
      const text = fmtNumber(value as number | string);
      return column.key === 'days_left' && Number(value) < 0 ? <span className="report-negative">{text}</span> : <>{text}</>;
    }
    default: return <>{String(value)}</>;
  }
}

/** The report's options live in the URL, so a run can be shared and Back works. */
export function ReportView({ def, advanced }: { def: ReportInfo; advanced: boolean }) {
  const [params, setParams] = useSearchParams();
  const current = useMemo(() => Object.fromEntries(def.params.map((p) => [p.key, params.get(p.key) ?? String(p.default)])), [def, params]);
  const query = qs(current);
  const { query: report, revealed, setRevealed } = useRevealable<ReportData>(`/api/v1/reports/${def.key}${query}`, { keepPrevious: true });
  const run = (values: Record<string, string>) => {
    if (qs(values) === query) void report.refetch(); // the same options still mean "get me the latest"
    else setParams({ r: def.key, ...values });
  };
  return (
    <div className="stack-4">
      <div><Link to="/reports">← All reports</Link></div>
      <div className="cluster-between">
        <span className="cluster"><h2>{def.name}</h2>{def.scope === 'team' && <Badge tone="info">Your team</Badge>}</span>
        {advanced && <SaveReportButton def={def} params={current} />}
      </div>
      <p className="text-2">{def.description}</p>
      <ParamForm key={query} def={def} initial={current} busy={report.isFetching} onRun={run} />
      <QueryState query={report}>
        {(d) => (
          <>
            {(d.masked || revealed) && <div><RevealToggle revealed={revealed} loading={report.isFetching} onChange={setRevealed} /></div>}
            <Result data={d} exportBase={`/api/v1/reports/${def.key}/export`} exportQuery={query} fileBase={def.key} refreshing={report.isPlaceholderData} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export function SnapshotView({ id }: { id: string }) {
  const query = useApiQuery<ReportData>(`/api/v1/reports/snapshots/${id}`);
  return (
    <div className="stack-4">
      <div><Link to="/reports">← All reports</Link></div>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-4">
            <span className="cluster"><h2>{d.name}</h2><Badge tone="info">Scheduled copy</Badge></span>
            <Result data={{ ...d, truncated: false }} exportBase={`/api/v1/reports/snapshots/${id}/export`} exportQuery="" fileBase={`report-${id}`} />
          </div>
        )}
      </QueryState>
    </div>
  );
}

function ParamForm({ def, initial, busy, onRun }: { def: ReportInfo; initial: Record<string, string>; busy: boolean; onRun: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState(initial);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); onRun(values); };
  return (
    <form className="report-options" onSubmit={submit} aria-label="Report options">
      {def.params.map((p) => {
        if (p.type === 'select') return <Select key={p.key} label={p.label} value={values[p.key]} options={p.options ?? []} onChange={(e) => set(p.key, e.target.value)} />;
        if (p.type === 'int') return <Input key={p.key} label={p.label} type="number" inputMode="numeric" required min={p.min} max={p.max} value={values[p.key]} onChange={(e) => set(p.key, e.target.value)} />;
        return <DatePicker key={p.key} label={p.label} mode={p.type} required value={values[p.key]} onChange={(e) => set(p.key, e.target.value)} />;
      })}
      <div><Button type="submit" variant="primary" loading={busy} loadingText="Running…">Run report</Button></div>
    </form>
  );
}

function compare(type: ColType, x: unknown, y: unknown): number {
  return NUMERIC.includes(type) ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { numeric: true });
}

/** A report comes whole from the server, so sorting, filtering and paging happen here. */
function Result({ data, exportBase, exportQuery, fileBase, refreshing }: { data: ReportData; exportBase: string; exportQuery: string; fileBase: string; refreshing?: boolean }) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const textColumns = useMemo(() => data.columns.filter((c) => c.type === 'text'), [data.columns]);
  const position = useMemo(() => new Map(data.rows.map((r, i) => [r, i])), [data.rows]);
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const matched = f ? data.rows.filter((r) => textColumns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f))) : data.rows;
    if (!sort) return matched;
    const column = data.columns.find((c) => c.key === sort.key);
    if (!column) return matched;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...matched].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
      return compare(column.type, x, y) * direction;
    });
  }, [data, sort, filter, textColumns]);
  const columns: Column<ReportRow>[] = data.columns.map((c, i) => ({
    key: c.key,
    header: c.label,
    sortable: true,
    align: NUMERIC.includes(c.type) ? 'right' : 'left',
    card: i === 0 ? 'title' : undefined,
    className: c.type !== 'text' || CODE_COLUMNS.has(c.key) ? 'nowrap' : undefined,
    cell: (r) => <Cell column={c} value={r[c.key]} masked={data.masked} />,
  }));
  const foot = data.totals && !filter.trim()
    ? (c: Column<ReportRow>, i: number) => {
      if (i === 0) return 'Total';
      const column = data.columns.find((x) => x.key === c.key);
      const value = data.totals?.[c.key];
      return !column || column.type === 'text' || value === undefined ? null : <Cell column={column} value={value} masked={data.masked} />;
    }
    : undefined;
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <span className="text-sm text-2 tnum">{data.rows.length === 1 ? '1 row' : `${fmtNumber(data.rows.length)} rows`} · generated {fmtDateTime(data.generatedAt)}</span>
        <div className="cluster">
          <DownloadButton url={`${exportBase}.xlsx${exportQuery}`} fileName={`${fileBase}.xlsx`}>Download Excel</DownloadButton>
          <DownloadButton url={`${exportBase}.csv${exportQuery}`} fileName={`${fileBase}.csv`}>Download CSV</DownloadButton>
          <DownloadButton url={`${exportBase}.pdf${exportQuery}`} fileName={`${fileBase}.pdf`}>Download PDF</DownloadButton>
        </div>
      </div>
      {(data.excluded ?? 0) > 0 && !data.notes.length && <Alert>{data.excluded} {data.excluded === 1 ? 'person is' : 'people are'} above your salary level and left out.</Alert>}
      {data.notes.map((n) => <Alert key={n}>{n}</Alert>)}
      {data.rows.length > 10 && textColumns.length > 0 && <FilterBar search={{ label: 'Filter rows', placeholder: 'Filter rows', value: filter, onChange: (v) => { setFilter(v); setPage(1); } }} />}
      {!data.rows.length
        ? <EmptyState compact title="No data for these options." />
        : (
          <Table
            label={data.name}
            columns={columns}
            rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            rowKey={(r) => String(position.get(r))}
            sort={sort}
            onSort={(s) => { setSort(s); setPage(1); }}
            refreshing={refreshing}
            foot={rows.length ? foot : undefined}
            empty={<EmptyState compact title="No rows match this filter." />}
            pagination={rows.length > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, total: rows.length, onPage: setPage } : undefined}
          />
        )}
    </div>
  );
}
