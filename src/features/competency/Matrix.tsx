import { useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { qs } from '../../api';
import { Badge, type BadgeTone } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { CARD_LIST_QUERY, useMediaQuery } from '../../components/hooks';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { fmtDate } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import { ACTIVITY, ACTIVITY_SHORT, AUTH_URL, type MatrixCell, type MatrixData, type MatrixRow } from './types';

const tone = (c: MatrixCell): BadgeTone => (c.inForce ? 'ok' : c.status === 'pending' ? 'warn' : 'danger');
const mark = (c: MatrixCell) => (c.inForce ? '✓' : c.status === 'pending' ? '…' : '!');
const state = (c: MatrixCell) => (c.inForce ? 'in force' : c.status === 'pending' ? 'pending' : c.status === 'authorized' ? 'not in force' : c.status);
const describe = (activity: string, c: MatrixCell) => `${ACTIVITY[activity] ?? activity}: ${state(c)}${c.reviewDue ? `, review ${fmtDate(c.reviewDue)}` : ''}`;

/** Letters only where space is short; the mark and the hidden text mean colour never carries it alone. */
function ShortCell({ cells }: { cells: Record<string, MatrixCell> | undefined }) {
  const entries = Object.entries(cells ?? {});
  if (!entries.length) return null;
  return <span className="matrix-cell">{entries.map(([activity, c]) => <Badge key={activity} tone={tone(c)} title={describe(activity, c)}><span aria-hidden="true">{ACTIVITY_SHORT[activity]} {mark(c)}</span><span className="visually-hidden">{describe(activity, c)}</span></Badge>)}</span>;
}

/** On a phone: only the methods this person holds, in words, because the grid would not fit. */
function PersonMethods({ row, methods }: { row: MatrixRow; methods: MatrixData['methods'] }) {
  return (
    <div className="matrix-person">
      {methods.filter((m) => Object.keys(row.cells[m.id] ?? {}).length).map((m) => (
        <div key={m.id} className="matrix-person__method">
          <span className="matrix-person__name"><span className="mono">{m.code}</span> {m.name}</span>
          <span className="matrix-cell">{Object.entries(row.cells[m.id] ?? {}).map(([activity, c]) => <Badge key={activity} tone={tone(c)}>{describe(activity, c)}</Badge>)}</span>
        </div>
      ))}
    </div>
  );
}

export function Matrix() {
  const [discipline, setDiscipline] = useState('');
  const phone = useMediaQuery(CARD_LIST_QUERY);
  const methods = useApiQuery<ApiResponse<'/api/v1/competency/methods'>>(`${AUTH_URL}/methods`);
  const query = useApiQuery<MatrixData>(`${AUTH_URL}/matrix${qs({ discipline })}`, { placeholderData: (p) => p });
  const disciplines = [...new Set((methods.data?.items ?? []).map((m) => m.discipline).filter((d): d is string => !!d))];
  return (
    <div className="stack-3">
      <FilterBar activeCount={discipline ? 1 : 0} onClear={() => setDiscipline('')}>
        <Select label="Discipline" hideLabel placeholder="All disciplines" value={discipline} options={disciplines.map((d) => ({ value: d, label: d }))} onChange={(e) => setDiscipline(e.target.value)} />
      </FilterBar>
      <p className="matrix-legend">{phone ? 'Green is in force, amber is pending, red is suspended, overdue for review, or missing required training.' : 'S sampling, P perform, R review, A authorize reports. ✓ in force, … pending, ! suspended, overdue for review, or missing required training.'}</p>
      <QueryState
        query={query}
        isEmpty={(d) => !d.methods.length || !d.rows.length}
        empty={<EmptyState icon={<Grid3x3 />} title={query.data?.methods.length ? 'No authorizations yet' : 'No active methods'} description={query.data?.methods.length ? undefined : 'Add methods under Courses & methods.'} />}
      >
        {(d) => {
          const name: Column<MatrixRow> = { key: 'employee', header: 'Employee', card: 'title', cell: (r) => <>{r.name} <span className="table__cell-sub mono">{r.employeeCode}</span></> };
          const columns: Column<MatrixRow>[] = phone
            ? [name, { key: 'methods', header: 'Methods', card: 'subtitle', cell: (r) => <PersonMethods row={r} methods={d.methods} /> }]
            : [name, ...d.methods.map((m): Column<MatrixRow> => ({ key: m.id, header: m.code, cell: (r) => <ShortCell cells={r.cells[m.id]} /> }))];
          return <Table label="Competence matrix" columns={columns} rows={d.rows} rowKey={(r) => r.employeeId} refreshing={query.isPlaceholderData} />;
        }}
      </QueryState>
    </div>
  );
}
