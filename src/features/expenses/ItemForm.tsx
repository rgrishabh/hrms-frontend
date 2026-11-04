import { useState } from 'react';
import { api, qs } from '../../api';
import { DatePicker } from '../../components/DatePicker';
import { FileUpload } from '../../components/FileUpload';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { formatMoney } from '../../components/Money';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { currencySymbol, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { CLAIMS_URL, RATES_URL, VEHICLE, type AllowanceQuote, type AllowanceRates, type ExpenseCategory } from './types';

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const HALF_DAYS = /^\d+(\.5|\.0)?$/;
const KILOMETRES = /^\d+(\.\d)?$/;

export function ItemForm({ claimId, categories, onClose }: { claimId: string; categories: readonly ExpenseCategory[]; onClose: () => void }) {
  const toast = useToast();
  const usable = categories.filter((c) => c.status !== 'inactive');
  const [f, setF] = useState({ categoryId: usable[0]?.id ?? '', expenseDate: todayLocal(), amount: '', description: '', merchant: '', invoiceNumber: '', gstin: '', quantity: '', tier: '', vehicle: 'car' });
  const [file, setFile] = useState<File | null>(null);
  const cat = usable.find((c) => c.id === f.categoryId);
  const calc = cat?.calc ?? null;
  const rates = useApiQuery<AllowanceRates>(calc ? RATES_URL : null);
  const tier = f.tier || rates.data?.tiers[0] || '';
  // The rate in force on the date for this person's grade. The server prices the item; this only shows it.
  const quoteUrl = calc && (calc === 'mileage' || tier)
    ? `/api/v1/expenses/allowance-quote${qs({ kind: calc, date: f.expenseDate, tier: calc === 'per_diem' ? tier : undefined, vehicle: calc === 'mileage' ? f.vehicle : undefined })}`
    : null;
  const quote = useApiQuery<AllowanceQuote>(quoteUrl);
  const rate = quote.data?.rate ? Number(quote.data.rate) : null;
  const allowance = rate !== null && Number(f.quantity) > 0 ? Math.round(rate * Number(f.quantity) * 100) / 100 : null;
  const symbol = currencySymbol();

  const validate = () => {
    const bad: FieldErrors = {};
    if (f.amount && !AMOUNT.test(f.amount)) bad['amount'] = 'Enter an amount such as 120 or 120.50';
    else if (f.amount && cat?.max_amount && Number(f.amount) > Number(cat.max_amount)) bad['amount'] = `The limit for ${cat.name} is ${formatMoney(cat.max_amount)}`;
    if (calc === 'per_diem' && !HALF_DAYS.test(f.quantity)) bad['quantity'] = 'Enter days in half-day steps, such as 1.5';
    if (calc === 'mileage' && !KILOMETRES.test(f.quantity)) bad['quantity'] = 'Enter the distance with at most one decimal, such as 12.5';
    if (cat?.requires_receipt && !file) bad['receipt'] = 'This category needs a receipt';
    return bad;
  };
  const form = useSubmit(async () => {
    const body = new FormData();
    const { quantity, tier: _tier, vehicle, ...rest } = f;
    for (const [k, v] of Object.entries(rest)) if (v) body.append(k, v);
    if (calc) { body.append('quantity', quantity); if (calc === 'per_diem') body.append('tier', tier); else body.append('vehicle', vehicle); }
    if (file) body.append('receipt', file);
    const r = await api.upload<{ possibleDuplicate?: boolean }>(`${CLAIMS_URL}/${claimId}/items`, body);
    if (r.possibleDuplicate) toast('Added, but it looks similar to another claimed expense. Check it is not a duplicate.', 'error');
    else toast('Expense added');
    await invalidateApi(CLAIMS_URL);
    onClose();
  }, { validate });

  const allowanceHint = allowance !== null && rate !== null ? `Allowance ${formatMoney(allowance)} (${f.quantity} × ${formatMoney(rate)})` : quote.data && !quote.data.rate ? 'No rate is set for this. Ask finance.' : undefined;
  const descriptionHint = calc === 'mileage' ? 'From and to, for example: Office to client site and back' : calc === 'per_diem' ? 'Where, for example: Mumbai, client audit' : undefined;
  return (
    <Modal title="Add expense" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Select label="Category" error={form.errors['categoryId']} value={f.categoryId} options={usable.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => setF({ ...f, categoryId: e.target.value, amount: '' })} />
          <DatePicker label="Date" required max={todayLocal()} error={form.errors['expenseDate']} value={f.expenseDate} onChange={(e) => setF({ ...f, expenseDate: e.target.value })} />
          {calc === 'per_diem' && (
            <>
              <Input label="Days" hint="In half days, for example 1.5" required inputMode="decimal" error={form.errors['quantity']} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
              <Select label="Destination class" value={tier} options={(rates.data?.tiers ?? []).map((t) => ({ value: t, label: t }))} onChange={(e) => setF({ ...f, tier: e.target.value })} />
            </>
          )}
          {calc === 'mileage' && (
            <>
              <Input label="Distance (km)" required inputMode="decimal" error={form.errors['quantity']} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
              <Select label="Vehicle" value={f.vehicle} options={Object.entries(VEHICLE).map(([value, label]) => ({ value, label }))} onChange={(e) => setF({ ...f, vehicle: e.target.value })} />
            </>
          )}
          {calc
            ? <Input label={`Claim less (optional, ${symbol})`} hint={allowanceHint} inputMode="decimal" error={form.errors['amount']} placeholder={allowance !== null ? String(allowance) : undefined} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            : <Input label={`Amount (${symbol})`} hint={cat?.max_amount ? `Up to ${formatMoney(cat.max_amount)}` : undefined} required inputMode="decimal" error={form.errors['amount']} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
          {!calc && <Input label="Merchant (optional)" error={form.errors['merchant']} value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} />}
        </div>
        <Input label="Description" hint={descriptionHint} required minLength={2} error={form.errors['description']} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {cat?.gst_applicable && (
          <div className="columns-form">
            <Input label="Supplier GSTIN" error={form.errors['gstin']} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />
            <Input label="Invoice number" error={form.errors['invoiceNumber']} value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} />
          </div>
        )}
        <FileUpload label={`Receipt${cat?.requires_receipt ? ' (required)' : ' (optional)'}`} hint="PDF or photo (PNG, JPEG, WebP)" accept=".pdf,.png,.jpg,.jpeg,.webp" error={form.errors['receipt']} file={file} onChange={(x) => { setFile(x); form.clearError('receipt'); }} />
        {cat?.gst_applicable && <p className="text-xs text-3">GST input credit is decided by finance. A reimbursement is not automatically tax-exempt.</p>}
        <FormActions error={form.error} busy={form.busy} onCancel={onClose} submitLabel="Add" />
      </form>
    </Modal>
  );
}
