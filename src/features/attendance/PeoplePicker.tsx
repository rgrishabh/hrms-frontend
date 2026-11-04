import { useState } from 'react';
import { qs } from '../../api';
import { useDebouncedValue } from '../../components/hooks';
import { Checkbox, Input } from '../../components/Input';
import { QueryState } from '../../components/QueryState';
import { EmptyState } from '../../components/EmptyState';
import { useApiQuery } from '../../lib/query';
import { employeeName, type EmployeeHit } from '../employees/searchEmployees';
import './Roster.css';

/** Tick several active employees. Who is ticked stays listed by name, so a search cannot hide a selection. */
export function PeoplePicker({ selected, onChange }: { selected: Record<string, string>; onChange: (s: Record<string, string>) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const emps = useApiQuery<{ items: EmployeeHit[] }>(`/api/v1/employees${qs({ search: debounced, status: 'active', pageSize: 50 })}`, { placeholderData: (p) => p });
  const names = Object.values(selected);
  return (
    <div className="stack-2">
      <Input label="Search employees" type="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
      <QueryState query={emps} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No active employees match." />}>
        {(d) => (
          <div className="people-picker__list" role="group" aria-label="Employees">
            {d.items.map((e) => (
              <Checkbox
                key={e.id}
                label={<>{employeeName(e)} <span className="mono text-sm text-2">{e.employee_code}</span></>}
                checked={!!selected[e.id]}
                onChange={(x) => { const s = { ...selected }; if (x.target.checked) s[e.id] = employeeName(e); else delete s[e.id]; onChange(s); }}
              />
            ))}
          </div>
        )}
      </QueryState>
      <p className="text-sm text-2" aria-live="polite">{names.length ? `${names.length} selected: ${names.join(', ')}` : 'Nobody selected yet'}</p>
    </div>
  );
}
