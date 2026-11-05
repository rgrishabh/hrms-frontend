import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Column, SavedView, SortState } from './Table';

interface Stored { hidden: string[]; views: SavedView[] }

const key = (id: string) => `hrms.table.${id}`;

/** Layout only: which columns, which sort, which filter values. Never row data. */
function read(id: string, fallbackHidden: string[]): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Partial<Stored> | null;
    return { hidden: parsed?.hidden ?? fallbackHidden, views: parsed?.views ?? [] };
  } catch { return { hidden: fallbackHidden, views: [] }; }
}

export interface TableState {
  page: number; setPage: (page: number) => void;
  sort: SortState | null; setSort: (sort: SortState | null) => void;
  filters: Record<string, string>; setFilter: (name: string, value: string) => void; clearFilters: () => void;
  activeFilterCount: number;
  hidden: string[]; toggleColumn: (key: string) => void;
  views: { saved: SavedView[]; onApply: (view: SavedView) => void; onSave: (name: string) => void; onDelete: (name: string) => void };
}

/**
 * Page, sort, filters, column visibility and saved views for one Table. Changing a sort or filter
 * returns to page 1, so a narrower result is never hidden behind a stale page number.
 */
export function useTableState<T>(id: string, columns: readonly Column<T>[], initial: { sort?: SortState | null; filters?: Record<string, string> } = {}): TableState {
  const defaultHidden = useMemo(() => columns.filter((c) => c.defaultHidden).map((c) => c.key), [columns]);
  const [stored, setStored] = useState<Stored>(() => read(id, defaultHidden));
  const [page, setPage] = useState(1);
  const [sort, setSortState] = useState<SortState | null>(initial.sort ?? null);
  const initialFilters = useMemo(() => initial.filters ?? {}, [initial.filters]);
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);

  useEffect(() => { localStorage.setItem(key(id), JSON.stringify(stored)); }, [id, stored]);

  const setSort = useCallback((s: SortState | null) => { setSortState(s); setPage(1); }, []);
  const setFilter = useCallback((name: string, value: string) => { setFilters((f) => ({ ...f, [name]: value })); setPage(1); }, []);
  const clearFilters = useCallback(() => { setFilters(initialFilters); setPage(1); }, [initialFilters]);

  return {
    page, setPage, sort, setSort, filters, setFilter, clearFilters,
    activeFilterCount: Object.entries(filters).filter(([k, v]) => v !== (initialFilters[k] ?? '')).length,
    hidden: stored.hidden,
    toggleColumn: (k) => setStored((s) => ({ ...s, hidden: s.hidden.includes(k) ? s.hidden.filter((x) => x !== k) : [...s.hidden, k] })),
    views: {
      saved: stored.views,
      onApply: (v) => { setStored((s) => ({ ...s, hidden: v.hidden })); setSortState(v.sort); setFilters(v.filters); setPage(1); },
      onSave: (name) => setStored((s) => ({ ...s, views: [...s.views.filter((v) => v.name !== name), { name, hidden: s.hidden, sort, filters }] })),
      onDelete: (name) => setStored((s) => ({ ...s, views: s.views.filter((v) => v.name !== name) })),
    },
  };
}
