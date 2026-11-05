import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { api } from '../../api';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi } from '../../lib/query';
import type { Cycle } from './types';

const reload = () => invalidateApi('/api/v1/performance');

export function Cycles({ items }: { items: readonly Cycle[] }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ cycle: Cycle; action: 'activate' | 'close' } | null>(null);
  const columns: Column<Cycle>[] = [
    { key: 'name', header: 'Cycle', card: 'title', cell: (c) => c.name },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'period', header: 'Period', cell: (c) => `${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}` },
    { key: 'self', header: 'Self-review', cell: (c) => (c.self_review ? 'Yes' : 'No') },
    { key: 'finalized', header: 'Finalized', align: 'right', cell: (c) => (c.status === 'draft' ? '—' : `${c.finalized} / ${c.reviews}`) },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (c) => (
        <div className="table__actions">
          {c.status === 'draft' && <Button size="sm" variant="primary" onClick={() => setConfirm({ cycle: c, action: 'activate' })}>Activate</Button>}
          {c.status === 'active' && (c.finalized < c.reviews ? <span className="text-xs text-3">Finalize every review to close</span> : <Button size="sm" onClick={() => setConfirm({ cycle: c, action: 'close' })}>Close</Button>)}
        </div>
      ),
    },
  ];
  return (
    <div className="stack-4">
      <div className="cluster-between">
        <p className="text-sm text-2 grow">Activating a cycle creates a review for every active employee who joined before the period ends, with their reporting manager as reviewer.</p>
        <Button variant="primary" onClick={() => setCreating(true)}>New cycle</Button>
      </div>
      {items.length ? <Table label="Review cycles" columns={columns} rows={items} rowKey={(c) => c.id} /> : <EmptyState icon={<CalendarRange />} title="No review cycles yet" />}
      {creating && <CycleForm onClose={() => setCreating(false)} />}
      {confirm && (
        <ConfirmDialog
          title={`${confirm.action === 'activate' ? 'Activate' : 'Close'} ${confirm.cycle.name}?`}
          message={confirm.action === 'activate' ? 'Reviews are created for all eligible staff and everyone is notified. This cannot be undone.' : 'No further changes can be made to reviews or goals in this cycle.'}
          confirmLabel={confirm.action === 'activate' ? 'Activate' : 'Close cycle'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const url = `/api/v1/performance/cycles/${confirm.cycle.id}/${confirm.action}`;
            if (confirm.action === 'activate') {
              const r = await api.post<ApiResponse<'/api/v1/performance/cycles/{id}/activate', 'post'>>(url);
              toast(`Activated: ${r.reviews} reviews created`);
            } else {
              await api.post<ApiResponse<'/api/v1/performance/cycles/{id}/close', 'post'>>(url);
              toast('Cycle closed');
            }
            await reload();
          }}
        />
      )}
    </div>
  );
}

function CycleForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => {
    const [year = '2026', month = '01'] = todayLocal().split('-');
    const y = Number(month) >= 4 ? Number(year) : Number(year) - 1;
    return { name: `FY ${y}-${String(y + 1).slice(2)}`, periodStart: `${y}-04-01`, periodEnd: `${y + 1}-03-31`, selfReview: true };
  });
  const form = useSubmit(async () => {
    await api.post('/api/v1/performance/cycles', f);
    toast('Draft cycle created');
    await reload();
    onClose();
  }, { validate: (): Record<string, string> => (f.periodEnd < f.periodStart ? { periodEnd: 'The end must be after the start.' } : {}) });
  return (
    <Modal title="New review cycle" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Input label="Name" required minLength={2} maxLength={120} error={form.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="columns-form">
          <DatePicker label="Period start" required error={form.errors['periodStart']} value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
          <DatePicker label="Period end" required error={form.errors['periodEnd']} value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
        </div>
        <Checkbox label="Employees write a self-review first" checked={f.selfReview} onChange={(e) => setF({ ...f, selfReview: e.target.checked })} />
        <p className="text-xs text-3">The cycle is created as a draft. Nobody sees it until you activate it.</p>
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" submitLabel="Create draft" onCancel={onClose} />
      </form>
    </Modal>
  );
}
