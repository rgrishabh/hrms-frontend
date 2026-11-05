import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from './Button';
import { Field } from './Input';
import './FilterBar.css';

export interface FilterBarProps {
  search?: { value: string; onChange: (value: string) => void; label: string; placeholder?: string };
  /** Select controls, with hidden labels, in the order they should read. */
  children?: ReactNode;
  /** How many filters differ from the default; shows Clear when above zero. */
  activeCount?: number;
  onClear?: () => void;
  actions?: ReactNode;
}

/** Search and filters above a list. Enter in the search box never submits a surrounding form. */
export function FilterBar({ search, children, activeCount = 0, onClear, actions }: FilterBarProps) {
  return (
    <div className="filter-bar" role="search">
      {search && (
        <div className="filter-bar__search">
          <Search className="filter-bar__icon" aria-hidden="true" />
          <Field label={search.label} hideLabel>
            <input
              type="search"
              className="control filter-bar__input"
              placeholder={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            />
          </Field>
        </div>
      )}
      {children && <div className="filter-bar__filters">{children}</div>}
      {activeCount > 0 && onClear && <Button variant="ghost" size="sm" icon={<X aria-hidden="true" />} onClick={onClear}>Clear</Button>}
      {actions && <div className="filter-bar__actions">{actions}</div>}
    </div>
  );
}
