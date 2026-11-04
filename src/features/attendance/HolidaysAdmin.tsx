import { useState } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Checkbox, Input } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { orgOptions, useOrg } from '../org/useOrg';

interface Holiday { id: string; holiday_date: string; name: string; branch_id?: string | null; branch_name: string | null; optional: boolean }
const BLANK = { holidayDate: '', name: '', branchId: '', optional: false };
const reload = () => invalidateApi('/api/v1/attendance/holidays');

export function HolidaysAdmin() {
  const toast = useToast();
  const [year, setYear] = useState(Number(todayLocal().slice(0, 4)));
  const query = useApiQuery<{ items: Holiday[] }>(`/api/v1/attendance/holidays?year=${year}`, { placeholderData: (p) => p });
  const org = useOrg();
  const [f, setF] = useState(BLANK);
  const [del, setDel] = useState<Holiday | null>(null);
  const s = useSubmit(async () => {
    await api.post('/api/v1/attendance/holidays', { ...f, branchId: f.branchId || null });
    toast('Holiday added');
    setF(BLANK);
    await reload();
  });
  const columns: Column<Holiday>[] = [
    { key: 'date', header: 'Date', card: 'subtitle', cell: (h) => <span className="tnum">{fmtDate(h.holiday_date)}</span> },
    { key: 'name', header: 'Holiday', card: 'title', cell: (h) => h.name },
    { key: 'branch', header: 'Applies to', cell: (h) => h.branch_name ?? 'All branches' },
    { key: 'type', header: 'Type', cell: (h) => (h.optional ? 'Optional' : 'Mandatory') },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (h) => <div className="table__actions"><Button size="sm" variant="danger-ghost" onClick={() => setDel(h)}>Remove</Button></div> },
  ];
  return (
    <div className="stack-4">
      <Card title="Add a holiday">
        <form className="stack-3" onSubmit={s.submit}>
          <div className="columns-form">
            <DatePicker label="Date" required error={s.errors['holidayDate']} value={f.holidayDate} onChange={(e) => setF({ ...f, holidayDate: e.target.value })} />
            <Input label="Name" required error={s.errors['name']} value={f.name} placeholder="For example, Diwali" onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Select label="Applies to" placeholder="All branches" value={f.branchId} options={orgOptions(org.data?.branches)} onChange={(e) => setF({ ...f, branchId: e.target.value })} />
          </div>
          <Checkbox label="Optional (restricted) holiday" checked={f.optional} onChange={(e) => setF({ ...f, optional: e.target.checked })} />
          <InlineError error={s.error} />
          <div><Button type="submit" variant="primary" loading={s.busy}>Add holiday</Button></div>
        </form>
      </Card>
      <div className="cluster">
        <Button size="sm" iconOnly aria-label={`Show ${year - 1}`} icon={<ChevronLeft aria-hidden="true" />} onClick={() => setYear(year - 1)} />
        <strong className="tnum" aria-live="polite">{year}</strong>
        <Button size="sm" iconOnly aria-label={`Show ${year + 1}`} icon={<ChevronRight aria-hidden="true" />} onClick={() => setYear(year + 1)} />
      </div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<CalendarOff />} title={`No holidays for ${year}`} />}>
        {(d) => <Table label={`Holidays in ${year}`} columns={columns} rows={d.items} rowKey={(h) => h.id} refreshing={query.isPlaceholderData} />}
      </QueryState>
      {del && (
        <ConfirmDialog
          title="Remove holiday"
          danger
          confirmLabel="Remove"
          message={`Remove ${del.name} (${fmtDate(del.holiday_date)})? Recalculate attendance for that date afterwards.`}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            await api.del(`/api/v1/attendance/holidays/${del.id}`);
            const again = { holidayDate: del.holiday_date.slice(0, 10), name: del.name, branchId: del.branch_id ?? null, optional: del.optional };
            toast('Holiday removed', 'ok', { label: 'Undo', onClick: () => { void api.post('/api/v1/attendance/holidays', again).then(reload).then(() => toast('Holiday restored')).catch((x: unknown) => toast(errorMessage(x), 'error')); } });
            await reload();
          }}
        />
      )}
    </div>
  );
}
