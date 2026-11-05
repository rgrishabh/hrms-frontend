import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { DatePicker } from '../../components/DatePicker';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Money, formatMoney } from '../../components/Money';
import { RevealToggle } from '../../components/RevealToggle';
import type { ApiResponse } from '../../lib/api-types';
import { isMaskedField, useRevealable } from '../../lib/masking';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { StatGrid, StatTile } from '../../components/StatTile';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { currencySymbol, fmtDateTime, fmtMonth, todayLocal } from '../../format';
import { EmployeeField } from '../employees/EmployeeField';
import { KIND_LABEL, loanKinds, loansNoun, reloadLoans, terms, type DeferAnswer, type Loan, type LoanDetailData, type LoanKind } from './types';

const URL_BASE = '/api/v1/loans/requests';

export function ApplyForm({ forOthers, onClose, onSaved }: { forOthers?: boolean; onClose: () => void; onSaved: () => void }) {
  const { hasFeature } = useAuth();
  const kinds = loanKinds(hasFeature);
  const month = todayLocal().slice(0, 7);
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [kind, setKind] = useState<LoanKind>(kinds[0] ?? 'salary_advance');
  const [f, setF] = useState({ amount: '', installments: '1', firstPeriod: month, purpose: '' });
  const amount = Number(f.amount) || 0;
  const n = Number(f.installments) || 1;
  const inst = amount > 0 ? Math.ceil(amount / n) : 0;
  const form = useSubmit(async () => {
    await api.post(URL_BASE, { kind, amount, installments: n, firstPeriod: f.firstPeriod, purpose: f.purpose, employeeId: forOthers ? employee?.id : undefined });
    onSaved();
    onClose();
  }, { validate: (): FieldErrors => (forOthers && !employee ? { employeeId: 'Choose the employee' } : {}) });
  return (
    <Modal title={forOthers ? `Record ${loansNoun(kinds)} for an employee` : `Apply for ${loansNoun(kinds)}`} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        {forOthers && <EmployeeField required status="active" hint="Active employees only" error={form.errors['employeeId']} value={employee} onChange={setEmployee} />}
        <div className="columns-form">
          {kinds.length > 1 && <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as LoanKind)} error={form.errors['kind']} options={[{ value: 'salary_advance', label: 'Salary advance' }, { value: 'loan', label: 'Loan (interest-free)' }]} />}
          <Input label={`Amount (${currencySymbol()})`} type="number" inputMode="numeric" required min={1} step={1} error={form.errors['amount']} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input label="Instalments" type="number" inputMode="numeric" required min={1} max={120} step={1} error={form.errors['installments']} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} />
          <DatePicker label="Recover from" mode="month" required min={month} error={form.errors['firstPeriod']} value={f.firstPeriod} onChange={(e) => setF({ ...f, firstPeriod: e.target.value })} />
        </div>
        {inst > 0 && <p className="text-sm text-2">{n} monthly instalment{n === 1 ? '' : 's'} of {formatMoney(inst)}{inst * n !== amount ? ` (the last ${formatMoney(amount - inst * (n - 1))})` : ''}, deducted from salary.</p>}
        <Textarea label="Purpose" required minLength={3} maxLength={1000} error={form.errors['purpose']} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Sending…" submitLabel="Submit for approval" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function DisburseForm({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const toast = useToast();
  const [reference, setReference] = useState('');
  const form = useSubmit(async () => {
    await api.post(`${URL_BASE}/${loan.id}/disburse`, { reference });
    toast('Recorded as paid; recovery starts in payroll');
    await reloadLoans();
    onClose();
  });
  return (
    <Modal title="Disburse" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <p>Pay {loan.amount === null ? 'the approved amount' : formatMoney(loan.amount)} to {loan.name}. Recovery: {terms(loan)}.</p>
        <Input label="Payment reference" hint="Transfer number or cash voucher" required minLength={3} maxLength={100} error={form.errors['reference']} value={reference} onChange={(e) => setReference(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Disburse" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function RepaymentForm({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: '', reference: '' });
  const form = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/loans/requests/{id}/repayment', 'post'>>(`${URL_BASE}/${loan.id}/repayment`, { amount: Number(f.amount), reference: f.reference });
    toast(r.closed ? 'Repaid in full; closed' : 'Repayment recorded');
    await reloadLoans();
    onClose();
  }, { validate: (): FieldErrors => (loan.outstanding !== null && Number(f.amount) > Number(loan.outstanding) ? { amount: `Only ${formatMoney(loan.outstanding)} is outstanding` } : {}) });
  return (
    <Modal title="Record a repayment" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        {loan.outstanding !== null && <p>{loan.name} has {formatMoney(loan.outstanding)} outstanding.</p>}
        <Input label={`Amount (${currencySymbol()})`} type="number" inputMode="numeric" required min={1} step={1} error={form.errors['amount']} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input label="Reference" hint="Receipt or transfer reference" required minLength={3} maxLength={100} error={form.errors['reference']} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Record a repayment" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function DeferForm({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const toast = useToast();
  const month = todayLocal().slice(0, 7);
  const [f, setF] = useState({ period: '', reason: '' });
  const form = useSubmit(async () => {
    const r = await api.post<DeferAnswer>(`${URL_BASE}/${loan.id}/defer`, f);
    toast(r.recomputePayroll ? `Deferred. Recompute the ${r.recomputePayroll} payroll run.` : 'Deferred');
    await reloadLoans();
    onClose();
  });
  return (
    <Modal title="Defer an instalment" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <p>Skip one month of {loan.name}'s recovery. The schedule moves out by a month.</p>
        <DatePicker label="Month" mode="month" required min={month} error={form.errors['period']} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
        <Input label="Reason" required minLength={3} maxLength={300} error={form.errors['reason']} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Defer an instalment" onCancel={onClose} />
      </form>
    </Modal>
  );
}

type ScheduleRow = NonNullable<LoanDetailData['schedule']>[number];
type RecoveryRow = NonNullable<LoanDetailData['recoveries']>[number];
const scheduleColumns: Column<ScheduleRow>[] = [
  { key: 'month', header: 'Month', card: 'title', cell: (s) => fmtMonth(s.period) },
  { key: 'amount', header: 'Instalment', align: 'right', cell: (s) => <Money value={s.amount} /> },
];
const recoveryColumns: Column<RecoveryRow>[] = [
  { key: 'when', header: 'When', card: 'title', cell: (r) => (r.period ? fmtMonth(r.period) : fmtDateTime(r.created_at)) },
  { key: 'how', header: 'How', card: 'subtitle', cell: (r) => (r.source === 'payroll' ? `Payroll${r.run_kind === 'fnf' ? ' (full and final)' : ''} · ${r.run_status ?? ''}` : `Repaid · ${r.reference ?? ''}`) },
  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <Money value={r.amount} /> },
];

export function LoanDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { query, revealed, setRevealed } = useRevealable<LoanDetailData>(`${URL_BASE}/${id}`);
  const l = query.data;
  return (
    <Modal title={l ? `${KIND_LABEL[l.kind]}${l.amount === null ? '' : ` — ${formatMoney(l.amount)}`}` : 'Advance or loan'} onClose={onClose}>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster"><StatusBadge status={d.status} /><span className="text-sm text-2">{d.name} · {terms(d)}</span></div>
            <RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="details" />
            {isMaskedField(d, 'purpose') ? <p className="text-sm text-2">Purpose hidden</p> : d.purpose && <p>{d.purpose}</p>}
            {(d.disbursement_reference || isMaskedField(d, 'disbursement_reference')) && <p className="text-sm text-2">Paid {fmtDateTime(d.disbursed_at)} · {d.disbursement_reference ?? 'Reference hidden'}</p>}
            <StatGrid label="Balance">
              <StatTile label="Outstanding" value={<Money value={d.balance?.outstanding} masked={isMaskedField(d, 'balance')} />} />
              <StatTile label="In payroll being processed" value={<Money value={d.balance?.inProgress} masked={isMaskedField(d, 'balance')} />} />
              <StatTile label="Recovered" value={<Money value={d.balance?.recovered} masked={isMaskedField(d, 'balance')} />} />
            </StatGrid>
            <section className="stack-2"><h3>Schedule</h3>{d.schedule ? <Table label="Schedule" columns={scheduleColumns} rows={d.schedule} rowKey={(s) => s.period} /> : <p className="text-sm text-2">Hidden until you ask to see the details.</p>}</section>
            {!!d.recoveries?.length && <section className="stack-2"><h3>Recovered</h3><Table label="Recoveries" columns={recoveryColumns} rows={d.recoveries} rowKey={(r) => r.id} /></section>}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
