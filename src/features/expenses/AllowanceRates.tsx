import { useId, useState } from 'react';
import { Coins } from 'lucide-react';
import { api } from '../../api';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { formatMoney, Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { currencySymbol, fmtDate, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { RATES_URL, VEHICLE, type AllowanceRate, type AllowanceRates as Rates } from './types';

type Kind = AllowanceRate['kind'];
const STATE: Record<AllowanceRate['state'], string> = { current: 'active', scheduled: 'scheduled', superseded: 'superseded' };
const SECTIONS: readonly { kind: Kind; title: string; empty: string }[] = [
  { kind: 'per_diem', title: 'Per diem (per day)', empty: 'No per-diem rates yet' },
  { kind: 'mileage', title: 'Mileage (per km)', empty: 'No mileage rates yet' },
];

/** Expenses, Allowance rates: the organization's per-diem and mileage policy, effective-dated. */
export function AllowanceRates() {
  const toast = useToast();
  const query = useApiQuery<Rates>(RATES_URL);
  const [form, setForm] = useState<Kind | null>(null);
  const [withdraw, setWithdraw] = useState<AllowanceRate | null>(null);
  const [showOld, setShowOld] = useState(false);
  return (
    <QueryState query={query}>
      {(data) => {
        const columns = (kind: Kind): Column<AllowanceRate>[] => [
          ...(kind === 'per_diem'
            ? [
              { key: 'tier', header: 'Destination class', card: 'title', cell: (r) => <span className="mono">{r.tier}</span> },
              { key: 'grade', header: 'Grade', card: 'subtitle', cell: (r) => r.grade ?? 'All grades' },
            ] satisfies Column<AllowanceRate>[]
            : [{ key: 'vehicle', header: 'Vehicle', card: 'title', cell: (r) => VEHICLE[r.vehicle ?? ''] ?? r.vehicle } satisfies Column<AllowanceRate>]),
          { key: 'rate', header: 'Rate', align: 'right', cell: (r) => <Money value={r.rate} /> },
          { key: 'from', header: 'From', cell: (r) => fmtDate(r.effective_from) },
          { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={STATE[r.state]} /> },
          { key: 'note', header: 'Note', cell: (r) => <>{r.note ?? '—'}{r.created_by_name && <div className="table__cell-sub">{r.created_by_name}</div>}</> },
          { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (data.canManage && r.state === 'scheduled' ? <div className="table__actions"><Button size="sm" onClick={() => setWithdraw(r)}>Withdraw</Button></div> : null) },
        ];
        const rows = data.items.filter((r) => showOld || r.state !== 'superseded');
        return (
          <div className="stack-4">
            <p className="text-sm text-2">Your organization's allowance policy. No rates are built in, and their tax treatment is for your advisers. A rate applies from its date until a newer one for the same class takes over; claims keep the rate they were priced at.</p>
            {SECTIONS.map(({ kind, title, empty }) => {
              const own = rows.filter((r) => r.kind === kind);
              return (
                <Card key={kind} title={title} flush aria-label={title} actions={data.canManage && <Button variant="primary" size="sm" onClick={() => setForm(kind)}>Add rate</Button>}>
                  {own.length ? <Table label={title} columns={columns(kind)} rows={own} rowKey={(r) => r.id} /> : <EmptyState compact icon={<Coins />} title={empty} />}
                </Card>
              );
            })}
            <Checkbox label="Show superseded rates" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            {form && <RateForm kind={form} tiers={data.tiers} onClose={() => setForm(null)} />}
            {withdraw && (
              <ConfirmDialog
                title="Withdraw rate"
                danger
                confirmLabel="Withdraw rate"
                message={`Withdraw the rate of ${formatMoney(withdraw.rate)} from ${fmtDate(withdraw.effective_from)}? It has not started yet.`}
                onClose={() => setWithdraw(null)}
                onConfirm={async () => { await api.del(`${RATES_URL}/${withdraw.id}`); toast('Rate withdrawn'); await invalidateApi(RATES_URL); }}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

const RATE = /^\d+(\.\d{1,2})?$/;

function RateForm({ kind, tiers, onClose }: { kind: Kind; tiers: readonly string[]; onClose: () => void }) {
  const toast = useToast();
  const listId = useId();
  const [f, setF] = useState({ tier: tiers[0] ?? '', grade: '', vehicle: 'car', rate: '', effectiveFrom: todayLocal(), note: '' });
  const symbol = currencySymbol();
  const validate = () => {
    const bad: FieldErrors = {};
    if (!RATE.test(f.rate)) bad['rate'] = 'Enter a rate such as 12 or 12.50';
    return bad;
  };
  const form = useSubmit(async () => {
    await api.post(RATES_URL, {
      kind, rate: Number(f.rate), effectiveFrom: f.effectiveFrom, note: f.note.trim() || undefined,
      ...(kind === 'per_diem' ? { tier: f.tier, grade: f.grade.trim() || null } : { vehicle: f.vehicle }),
    });
    toast('Rate added');
    await invalidateApi(RATES_URL);
    onClose();
  }, { validate });
  return (
    <Modal title={kind === 'per_diem' ? 'Add per-diem rate' : 'Add mileage rate'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          {kind === 'per_diem'
            ? (
              <>
                <Input label="Destination class" hint="A short code, such as METRO, OTHER or INTL" required list={listId} maxLength={20} error={form.errors['tier']} value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value.toUpperCase() })} />
                <datalist id={listId}>{tiers.map((t) => <option key={t} value={t} />)}</datalist>
                <Input label="Grade (optional)" hint="Blank means every grade; a grade's own rate wins" maxLength={20} error={form.errors['grade']} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
              </>
            )
            : <Select label="Vehicle" value={f.vehicle} options={Object.entries(VEHICLE).map(([value, label]) => ({ value, label }))} onChange={(e) => setF({ ...f, vehicle: e.target.value })} />}
          <Input label={kind === 'per_diem' ? `Rate per day (${symbol})` : `Rate per km (${symbol})`} required inputMode="decimal" error={form.errors['rate']} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          <DatePicker label="Applies from" hint="Up to 90 days back" required error={form.errors['effectiveFrom']} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
        </div>
        <Input label="Note (optional)" maxLength={200} error={form.errors['note']} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} onCancel={onClose} submitLabel="Add rate" />
      </form>
    </Modal>
  );
}
