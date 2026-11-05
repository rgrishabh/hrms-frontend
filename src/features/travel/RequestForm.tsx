import { useState } from 'react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { formatMoney, Money } from '../../components/Money';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { currencySymbol, fmtNumber, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import type { AllowanceQuote, AllowanceRates } from '../expenses/types';
import { ESTIMATE_PARTS, MODE, TRIPS_URL, type Trip } from './types';
import './Travel.css';

/** Fills the meals estimate from the organization's per-diem rate for the trip's days. Optional: without rates, or access to them, it stays out of the way. */
function PerDiemHelper({ from, to, onUse }: { from: string; to: string; onUse: (amount: string) => void }) {
  const { hasFeature } = useAuth();
  const rates = useApiQuery<AllowanceRates>(hasFeature('FEATURE_EXPENSE_CLAIMS') ? '/api/v1/expenses/allowance-rates' : null);
  const tiers = rates.data?.tiers ?? [];
  const [tier, setTier] = useState('');
  const t = tier || tiers[0] || '';
  const quote = useApiQuery<AllowanceQuote>(t && from && to >= from ? `/api/v1/expenses/allowance-quote${qs({ kind: 'per_diem', tier: t, date: from, to })}` : null);
  if (!tiers.length) return null;
  const q = quote.data;
  return (
    <div className="travel-perdiem" role="group" aria-label="Per diem">
      <Select label="Per-diem class" value={t} options={tiers.map((x) => ({ value: x, label: x }))} onChange={(e) => setTier(e.target.value)} />
      {q?.rate
        ? (
          <>
            <span className="text-2">{fmtNumber(q.quantity ?? 0)} day(s) × {formatMoney(q.rate)} = <strong>{formatMoney(q.amount ?? 0)}</strong></span>
            <Button size="sm" onClick={() => onUse(String(q.amount ?? ''))}>Use for meals</Button>
          </>
        )
        : q && <span className="text-2">No per-diem rate for {t} on these dates</span>}
    </div>
  );
}

/** `from` copies an earlier trip into a new request. `resubmit` is that trip, sent back for correction: the same request goes back to its approver. */
export function RequestForm({ from, resubmit, onClose }: { from?: Trip; resubmit?: boolean; onClose: () => void }) {
  const toast = useToast();
  const today = todayLocal();
  const [f, setF] = useState({ purpose: from?.purpose ?? '', tripType: from?.trip_type ?? 'domestic', origin: from?.origin ?? '', destination: from?.destination ?? '', startDate: from && from.start_date > today ? from.start_date : today, endDate: from && from.end_date > today ? from.end_date : today, travelMode: from?.travel_mode ?? 'rail', accommodation: false, project: from?.project ?? '', markOnDuty: true });
  const [est, setEst] = useState<Record<string, string>>({ travel: '', stay: '', local: '', meals: '', other: '' });
  const [advance, setAdvance] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => { const n = { ...x, ...p }; if (p.startDate && n.endDate < p.startDate) n.endDate = p.startDate; return n; });
  const total = Object.values(est).reduce((s, v) => s + (Number(v) || 0), 0);
  const symbol = currencySymbol();
  const form = useSubmit(async () => {
    await api.post(resubmit && from ? `${TRIPS_URL}/${from.id}/resubmit` : TRIPS_URL, { ...f, project: f.project || undefined, estimate: Object.fromEntries(Object.entries(est).map(([k, v]) => [k, v || 0])), advance: advance || 0 });
    toast(resubmit ? 'Sent back for approval' : 'Travel requested; sent for approval');
    await invalidateApi(TRIPS_URL, '/api/v1/approvals', '/api/v1/dashboard');
    onClose();
  });
  return (
    <Modal title={resubmit ? 'Correct and resubmit' : 'Request travel'} size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Textarea label="Purpose" hint="The client, work order, or what the trip is for" required minLength={3} maxLength={1000} error={form.errors['purpose']} value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        <div className="columns-form">
          <Input label="From (city)" required minLength={2} maxLength={120} error={form.errors['origin']} value={f.origin} onChange={(e) => set({ origin: e.target.value })} />
          <Input label="Destination" required minLength={2} maxLength={200} error={form.errors['destination']} value={f.destination} onChange={(e) => set({ destination: e.target.value })} />
          <DatePicker label="Start" required min={today} error={form.errors['startDate']} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <DatePicker label="Return" required min={f.startDate} error={form.errors['endDate']} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          <Select label="Mode" value={f.travelMode} options={Object.entries(MODE).map(([value, label]) => ({ value, label }))} onChange={(e) => set({ travelMode: e.target.value })} />
          <Select label="Trip" value={f.tripType} options={[{ value: 'domestic', label: 'Domestic' }, { value: 'international', label: 'International' }]} onChange={(e) => set({ tripType: e.target.value })} />
        </div>
        <Input label="Client / work order (optional)" maxLength={100} error={form.errors['project']} value={f.project} onChange={(e) => set({ project: e.target.value })} />
        <fieldset className="travel-estimate">
          <legend>Estimated cost ({symbol})</legend>
          <div className="columns-form">
            {ESTIMATE_PARTS.map(([k, label]) => <Input key={k} label={label} type="number" min={0} step="0.01" error={form.errors[`estimate.${k}`]} value={est[k]} onChange={(e) => setEst({ ...est, [k]: e.target.value })} />)}
          </div>
          <PerDiemHelper from={f.startDate} to={f.endDate} onUse={(amount) => setEst({ ...est, meals: amount })} />
          <p className="text-2">Total <Money value={total} /></p>
        </fieldset>
        <Input label={`Advance needed (${symbol})`} hint="Paid by finance before the trip; set off against your claim afterwards" type="number" min={0} step="0.01" error={form.errors['advance']} value={advance} onChange={(e) => setAdvance(e.target.value)} />
        <Checkbox label="Needs accommodation" checked={f.accommodation} onChange={(e) => set({ accommodation: e.target.checked })} />
        <Checkbox label="Count the trip days as field duty" checked={f.markOnDuty} onChange={(e) => set({ markOnDuty: e.target.checked })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Sending…" onCancel={onClose} submitLabel="Submit for approval" />
      </form>
    </Modal>
  );
}
