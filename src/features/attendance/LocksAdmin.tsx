import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import type { ApiItem, ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';

type AttendanceLock = ApiItem<'/api/v1/attendance/locks'>;

const columns: Column<AttendanceLock>[] = [
  { key: 'period', header: 'Period', card: 'title', cell: (l) => <span className="tnum">{fmtDate(l.period_start)} – {fmtDate(l.period_end)}</span> },
  { key: 'by', header: 'Locked by', cell: (l) => l.locked_by },
  { key: 'at', header: 'Locked at', cell: (l) => fmtDateTime(l.locked_at) },
];

export function LocksAdmin({ canLock }: { canLock: boolean }) {
  const toast = useToast();
  const query = useApiQuery<ApiResponse<'/api/v1/attendance/locks'>>('/api/v1/attendance/locks');
  const [f, setF] = useState({ periodStart: '', periodEnd: '' });
  const [confirm, setConfirm] = useState(false);
  const s = useSubmit(async () => setConfirm(true), { validate: (): FieldErrors => (f.periodEnd < f.periodStart ? { periodEnd: 'Cannot be before the period start' } : {}) });
  return (
    <div className="stack-4">
      {canLock && (
        <Card title="Lock a period">
          <form className="stack-3" onSubmit={s.submit}>
            <div className="columns-form">
              <DatePicker label="Period start" required value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
              <DatePicker label="Period end" required error={s.errors['periodEnd']} value={f.periodEnd} onChange={(e) => { setF({ ...f, periodEnd: e.target.value }); s.clearError('periodEnd'); }} />
            </div>
            <div><Button type="submit" variant="primary">Lock period…</Button></div>
          </form>
        </Card>
      )}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Lock />} title="No locked periods" />}>
        {(d) => <Table label="Locked periods" columns={columns} rows={d.items} rowKey={(l) => l.id} />}
      </QueryState>
      {confirm && (
        <ConfirmDialog
          title="Lock attendance period"
          danger
          confirmLabel="Lock period"
          onClose={() => setConfirm(false)}
          message={<>All attendance from <strong>{fmtDate(f.periodStart)}</strong> to <strong>{fmtDate(f.periodEnd)}</strong> will be recalculated and then frozen for payroll. Corrections and recalculation will no longer change these days. Locking fails if correction requests are still pending.</>}
          onConfirm={async () => {
            const r = await api.post<ApiResponse<'/api/v1/attendance/locks', 'post'>>('/api/v1/attendance/locks', f);
            toast(`Locked ${r.rowsLocked} attendance records`);
            setF({ periodStart: '', periodEnd: '' });
            await invalidateApi('/api/v1/attendance/locks');
          }}
        />
      )}
    </div>
  );
}
