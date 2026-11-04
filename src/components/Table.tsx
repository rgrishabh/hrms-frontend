import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download } from 'lucide-react';
import { Button } from './Button';
import { Checkbox } from './Input';
import { CARD_LIST_QUERY, useMediaQuery } from './hooks';
import { Pagination } from './Pagination';
import { Select } from './Select';
import { Drawer } from './Drawer';
import { Input } from './Input';
import './Table.css';

export type SortDirection = 'asc' | 'desc';
export interface SortState { key: string; direction: SortDirection }
export type ExportFormat = 'csv' | 'xlsx';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server sorts by this key when the header is pressed. */
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Cannot be hidden in the column menu. */
  required?: boolean;
  defaultHidden?: boolean;
  /**
   * Its place on the phone card. `title` and `subtitle` head the card, `status` sits top right,
   * `actions` runs along the bottom. Anything else becomes a label and value row; `hidden` drops it.
   */
  card?: 'title' | 'subtitle' | 'status' | 'actions' | 'hidden';
  /** Screen-reader header for action columns with no visible heading. */
  className?: string;
}

export interface SavedView { name: string; hidden: string[]; sort: SortState | null; filters: Record<string, string> }

export interface TableProps<T> {
  /** The table's accessible name. */
  label: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sort?: SortState | null;
  onSort?: (sort: SortState | null) => void;
  pagination?: { page: number; pageSize: number; total: number; onPage: (page: number) => void };
  /** Hides columns; from useTableState. */
  hidden?: readonly string[];
  onToggleColumn?: (key: string) => void;
  /** Named column, sort and filter layouts; from useTableState. */
  views?: { saved: readonly SavedView[]; onApply: (view: SavedView) => void; onSave: (name: string) => void; onDelete: (name: string) => void };
  /** The server generates the file; the page decides how to fetch it. */
  onExport?: (format: ExportFormat) => void;
  exportFormats?: readonly ExportFormat[];
  empty?: ReactNode;
  /** Dims the rows while new ones load, keeping the old ones in place. */
  refreshing?: boolean;
  footer?: ReactNode;
}

function nextSort(current: SortState | null | undefined, key: string): SortState | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

const ariaSort = (sort: SortState | null | undefined, key: string) => (sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');

/**
 * Server-driven data table: real <table> semantics on desktop, a card list on phones so no one has to
 * scroll sideways to reach an action. It holds no data rules of its own: page, sort, filters, visible
 * columns and saved views come from outside (see useTableState).
 */
export function Table<T>({ label, columns, rows, rowKey, sort, onSort, pagination, hidden = [], onToggleColumn, views, onExport, exportFormats = ['csv', 'xlsx'], empty, refreshing, footer }: TableProps<T>) {
  const asCards = useMediaQuery(CARD_LIST_QUERY);
  const visible = columns.filter((c) => !hidden.includes(c.key));
  const toolbar = onToggleColumn || views || onExport;
  return (
    <div className={`data-table${refreshing ? ' data-table--refreshing' : ''}`} aria-busy={refreshing || undefined}>
      {toolbar && <TableToolbar columns={columns} hidden={hidden} onToggleColumn={onToggleColumn} views={views} onExport={onExport} exportFormats={exportFormats} hideColumnControls={asCards} />}
      {!rows.length && empty ? <div className="data-table__empty">{empty}</div> : asCards ? (
        <ul className="table-cards list-plain" aria-label={label}>
          {rows.map((row) => <CardRow key={rowKey(row)} row={row} columns={visible} />)}
        </ul>
      ) : (
        <div className="table-scroll" tabIndex={0} role="group" aria-label={`${label}, scrollable`}>
          <table className="table" aria-label={label}>
            <thead>
              <tr>
                {visible.map((c) => (
                  <th key={c.key} scope="col" aria-sort={c.sortable ? ariaSort(sort, c.key) : undefined} className={c.align === 'right' || c.card === 'actions' ? 'table__num' : undefined}>
                    {c.sortable && onSort ? (
                      <button type="button" className="table__sort" onClick={() => onSort(nextSort(sort, c.key))}>
                        {c.header}
                        {sort?.key === c.key ? (sort.direction === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ChevronsUpDown aria-hidden="true" />}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {visible.map((c) => <td key={c.key} className={[c.align === 'right' && 'table__num', c.className].filter(Boolean).join(' ') || undefined}>{c.cell(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
      {pagination && rows.length > 0 && <Pagination {...pagination} />}
    </div>
  );
}

function CardRow<T>({ row, columns }: { row: T; columns: readonly Column<T>[] }) {
  const only = (place: Column<T>['card']) => columns.filter((c) => c.card === place);
  const rest = columns.filter((c) => !c.card);
  const actions = only('actions');
  return (
    <li className="table-card">
      <div className="table-card__head">
        <div className="grow">
          {only('title').map((c) => <div key={c.key} className="table-card__title">{c.cell(row)}</div>)}
          {only('subtitle').map((c) => <div key={c.key} className="table-card__subtitle">{c.cell(row)}</div>)}
        </div>
        {only('status').map((c) => <div key={c.key}>{c.cell(row)}</div>)}
      </div>
      {rest.length > 0 && (
        <dl className="table-card__rows">
          {rest.map((c) => <div key={c.key} className="table-card__row"><dt>{c.header}</dt><dd className={c.align === 'right' ? 'tnum' : undefined}>{c.cell(row)}</dd></div>)}
        </dl>
      )}
      {actions.length > 0 && <div className="table-card__actions">{actions.map((c) => <div key={c.key}>{c.cell(row)}</div>)}</div>}
    </li>
  );
}

function TableToolbar<T>({ columns, hidden, onToggleColumn, views, onExport, exportFormats, hideColumnControls }: Pick<TableProps<T>, 'columns' | 'onToggleColumn' | 'views' | 'onExport'> & { hidden: readonly string[]; exportFormats: readonly ExportFormat[]; hideColumnControls: boolean }) {
  const [panel, setPanel] = useState(false);
  const [name, setName] = useState('');
  const showViewControls = !hideColumnControls && (onToggleColumn || views);
  return (
    <div className="table-toolbar">
      {showViewControls && <Button size="sm" variant="ghost" icon={<Columns3 aria-hidden="true" />} onClick={() => setPanel(true)}>Columns and views</Button>}
      {onExport && exportFormats.map((f) => <Button key={f} size="sm" variant="ghost" icon={<Download aria-hidden="true" />} onClick={() => onExport(f)}>{f.toUpperCase()}</Button>)}
      {panel && (
        <Drawer title="Columns and views" size="sm" onClose={() => setPanel(false)}>
          <div className="stack-4">
            {onToggleColumn && (
              <fieldset className="table-toolbar__group">
                <legend>Columns</legend>
                {columns.filter((c) => c.header).map((c) => <Checkbox key={c.key} label={c.header} disabled={c.required} checked={!hidden.includes(c.key)} onChange={() => onToggleColumn(c.key)} />)}
              </fieldset>
            )}
            {views && (
              <div className="stack-3">
                {views.saved.length > 0 && <Select label="Saved views" placeholder="Choose a view" value="" options={views.saved.map((v) => ({ value: v.name, label: v.name }))} onChange={(e) => { const v = views.saved.find((x) => x.name === e.target.value); if (v) { views.onApply(v); setPanel(false); } }} />}
                <form className="stack-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { views.onSave(name.trim()); setName(''); } }}>
                  <Input label="Save current view as" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
                  <div><Button type="submit" size="sm" disabled={!name.trim()}>Save view</Button></div>
                </form>
                {views.saved.map((v) => <Button key={v.name} size="sm" variant="ghost" onClick={() => views.onDelete(v.name)}>Delete “{v.name}”</Button>)}
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
