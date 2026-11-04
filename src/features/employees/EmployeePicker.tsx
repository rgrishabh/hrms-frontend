import { useState } from 'react';
import { api, qs } from '../../api';
import { useLoad } from '../../ui';

/** Search box plus native select, used by the pages not yet migrated to Picker. */
export function EmployeePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const { data } = useLoad(() => api.get(`/api/v1/employees${qs({ search: search || undefined, pageSize: 20 })}`), [search]);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select required value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select employee…</option>
        {(data?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name ?? ''} ({e.employee_code}) · {e.status}</option>)}</select>
    </div>
  );
}
