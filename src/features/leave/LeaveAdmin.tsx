import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../../api';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { Checkbox, Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Picker, type PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { fmtNumber, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { searchEmployees } from '../employees/searchEmployees';
import type { LeaveType } from './types';

interface TypeFormValues {
  id?: string; code: string; name: string; description: string; paid: boolean; allowHalfDay: boolean; requiresBalance: boolean; accrualMethod: string; annualEntitlement: number | ''; carryForwardMax: number | ''; maxBalance: number | '';
  countNonWorkingDays: boolean; minNoticeDays: number | ''; maxConsecutiveDays: number | ''; eligibleAfterDays: number | ''; applicableEmploymentTypes: string[]; status: string;
}
const EMPTY_TYPE: TypeFormValues = { code: '', name: '', description: '', paid: true, allowHalfDay: true, requiresBalance: true, accrualMethod: 'annual', annualEntitlement: 0, carryForwardMax: 0, maxBalance: '', countNonWorkingDays: false, minNoticeDays: 0, maxConsecutiveDays: '', eligibleAfterDays: 0, applicableEmploymentTypes: [], status: 'active' };
const EMP_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];
const TYPES_URL = '/api/v1/leave/types?includeInactive=true';

const toForm = (t: LeaveType): TypeFormValues => ({
  id: t.id, code: t.code, name: t.name, description: t.description ?? '', paid: t.paid, allowHalfDay: t.allow_half_day, requiresBalance: t.requires_balance, accrualMethod: t.accrual_method,
  annualEntitlement: Number(t.annual_entitlement), carryForwardMax: Number(t.carry_forward_max), maxBalance: t.max_balance === null ? '' : Number(t.max_balance), countNonWorkingDays: t.count_non_working_days,
  minNoticeDays: t.min_notice_days, maxConsecutiveDays: t.max_consecutive_days === null ? '' : Number(t.max_consecutive_days), eligibleAfterDays: t.eligible_after_days, applicableEmploymentTypes: t.applicable_employment_types, status: t.status,
});

export function LeaveAdmin() {
  const toast = useToast();
  const types = useApiQuery<{ items: LeaveType[] }>(TYPES_URL);
  const [edit, setEdit] = useState<TypeFormValues | null>(null);
  const [year, setYear] = useState(Number(todayLocal().slice(0, 4)));
  const [through, setThrough] = useState(12);
  const [accruing, setAccruing] = useState(false);
  const [confirmYearEnd, setConfirmYearEnd] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const columns: Column<LeaveType>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (t) => <span className="cluster">{t.name}{!t.paid && <Badge>Unpaid</Badge>}</span> },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (t) => <span className="mono">{t.code}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'accrual', header: 'Accrual', cell: (t) => (t.requires_balance ? t.accrual_method : 'No balance') },
    { key: 'entitlement', header: 'Entitlement / year', align: 'right', cell: (t) => (t.requires_balance ? fmtNumber(t.annual_entitlement) : '—') },
    { key: 'carry', header: 'Carry forward', align: 'right', cell: (t) => fmtNumber(t.carry_forward_max) },
    { key: 'rules', header: 'Rules', cell: (t) => <span className="text-sm text-2">{[t.allow_half_day && 'half days', t.count_non_working_days && 'sandwich', t.min_notice_days > 0 && `${t.min_notice_days}d notice`, t.max_consecutive_days && `max ${fmtNumber(t.max_consecutive_days)}d`, t.eligible_after_days > 0 && `after ${t.eligible_after_days}d`, t.applicable_employment_types.length > 0 && t.applicable_employment_types.join('/')].filter(Boolean).join(' · ')}</span> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (t) => <div className="table__actions"><Button size="sm" onClick={() => setEdit(toForm(t))}>Edit</Button></div> },
  ];
  const runAccruals = async () => {
    setAccruing(true);
    try {
      const r = await api.post<{ credited: number; alreadyCredited: number }>('/api/v1/leave/accruals', { leaveYear: year, throughMonth: through });
      toast(`Accruals: ${r.credited} credit(s) added, ${r.alreadyCredited} already done`);
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setAccruing(false); }
  };
  return (
    <div className="stack-4">
      <Alert>Leave types are your organization's policy. Check statutory minimums for your state and establishment with your HR or legal advisor before publishing them.</Alert>
      <Card title="Leave types" flush actions={<Button variant="primary" size="sm" onClick={() => setEdit({ ...EMPTY_TYPE })}>New leave type</Button>}>
        <QueryState query={types} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No leave types yet" />}>
          {(d) => <Table label="Leave types" columns={columns} rows={d.items} rowKey={(t) => t.id} />}
        </QueryState>
      </Card>
      <div className="columns-2">
        <Card title="Accruals">
          <div className="stack-3">
            <p className="text-sm text-2">Credits entitlements for the leave year. Safe to run repeatedly: nothing is credited twice. Monthly types accrue up to the chosen month.</p>
            <div className="columns-form">
              <Input label="Leave year" type="number" inputMode="numeric" value={year} onChange={(e) => setYear(Number(e.target.value))} />
              <Input label="Through month of leave year" type="number" inputMode="numeric" min={1} max={12} value={through} onChange={(e) => setThrough(Number(e.target.value))} />
            </div>
            <div><Button variant="primary" loading={accruing} onClick={() => void runAccruals()}>Run accruals</Button></div>
          </div>
        </Card>
        <Card title="Year-end and adjustments">
          <div className="stack-3">
            <p className="text-sm text-2">Year-end carries balances forward up to each type's limit and lapses the rest. Adjustments record opening balances or corrections, with a note.</p>
            <div className="cluster"><Button onClick={() => setConfirmYearEnd(true)}>Close leave year {year}…</Button><Button onClick={() => setAdjust(true)}>Adjust a balance…</Button></div>
          </div>
        </Card>
      </div>
      {edit && <TypeForm initial={edit} onClose={() => setEdit(null)} />}
      {confirmYearEnd && (
        <ConfirmDialog
          title={`Close leave year ${year}`}
          danger
          confirmLabel="Close year"
          onClose={() => setConfirmYearEnd(false)}
          message={`Balances above each type's carry-forward limit will lapse and the rest moves to ${year + 1}. All requests of ${year} must be decided first. This cannot be undone except by manual adjustments.`}
          onConfirm={async () => { const r = await api.post<{ daysCarried: number; daysLapsed: number }>('/api/v1/leave/year-end', { leaveYear: year }); toast(`Year closed: ${fmtNumber(r.daysCarried)} day(s) carried, ${fmtNumber(r.daysLapsed)} lapsed`); }}
        />
      )}
      {adjust && <AdjustForm types={types.data?.items ?? []} year={year} onClose={() => setAdjust(false)} />}
    </div>
  );
}

function TypeForm({ initial, onClose }: { initial: TypeFormValues; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof TypeFormValues) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    setBusy(true);
    const { id, ...rest } = f;
    const body = { ...rest, description: f.description || null, maxBalance: f.maxBalance === '' ? null : f.maxBalance, maxConsecutiveDays: f.maxConsecutiveDays === '' ? null : f.maxConsecutiveDays, accrualMethod: f.requiresBalance ? f.accrualMethod : 'none' };
    try {
      if (id) await api.put(`/api/v1/leave/types/${id}`, body); else await api.post('/api/v1/leave/types', body);
      toast('Leave type saved');
      await invalidateApi('/api/v1/leave/types', '/api/v1/leave/balances');
      onClose();
    } catch (x) {
      if (x instanceof ApiError) setErrors(x.fieldErrors());
      setError(x);
    } finally { setBusy(false); }
  };
  return (
    <Modal title={f.id ? `Edit ${initial.code}` : 'New leave type'} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={submit}>
        <div className="columns-form">
          <Input label="Code" hint="For example CL, SL, EL" required error={errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required error={errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Description" fieldClassName="span-all" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="columns-form">
          <Checkbox label="Paid" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />
          <Checkbox label="Needs a balance" checked={f.requiresBalance} onChange={(e) => setF({ ...f, requiresBalance: e.target.checked })} />
          <Checkbox label="Half days allowed" checked={f.allowHalfDay} onChange={(e) => setF({ ...f, allowHalfDay: e.target.checked })} />
          <Checkbox label="Count weekly offs and holidays inside leave" checked={f.countNonWorkingDays} onChange={(e) => setF({ ...f, countNonWorkingDays: e.target.checked })} />
        </div>
        {f.requiresBalance && (
          <div className="columns-form">
            <Select label="Accrual" error={errors['accrualMethod']} value={f.accrualMethod} onChange={(e) => setF({ ...f, accrualMethod: e.target.value })} options={[{ value: 'annual', label: 'Annual, credited at year start' }, { value: 'monthly', label: 'Monthly, 1/12 each month' }, { value: 'none', label: 'None, manual adjustments only' }]} />
            <Input label="Entitlement per year (days)" type="number" inputMode="decimal" step={0.5} min={0} error={errors['annualEntitlement']} value={f.annualEntitlement} onChange={num('annualEntitlement')} />
            <Input label="Carry forward up to (days)" hint="0 lapses at year end" type="number" inputMode="decimal" step={0.5} min={0} error={errors['carryForwardMax']} value={f.carryForwardMax} onChange={num('carryForwardMax')} />
            <Input label="Maximum balance (days)" hint="Blank means no cap" type="number" inputMode="decimal" step={0.5} min={0} error={errors['maxBalance']} value={f.maxBalance} onChange={num('maxBalance')} />
          </div>
        )}
        <div className="columns-form">
          <Input label="Minimum notice (days)" type="number" inputMode="numeric" min={0} error={errors['minNoticeDays']} value={f.minNoticeDays} onChange={num('minNoticeDays')} />
          <Input label="Max days per request" hint="Blank means no limit" type="number" inputMode="decimal" step={0.5} min={0.5} error={errors['maxConsecutiveDays']} value={f.maxConsecutiveDays} onChange={num('maxConsecutiveDays')} />
          <Input label="Eligible after (days of service)" type="number" inputMode="numeric" min={0} error={errors['eligibleAfterDays']} value={f.eligibleAfterDays} onChange={num('eligibleAfterDays')} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        <fieldset className="table-toolbar__group">
          <legend>Applies to (none ticked means everyone)</legend>
          <div className="columns-form">
            {EMP_TYPES.map((t) => <Checkbox key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} checked={f.applicableEmploymentTypes.includes(t)} onChange={(e) => setF({ ...f, applicableEmploymentTypes: e.target.checked ? [...f.applicableEmploymentTypes, t] : f.applicableEmploymentTypes.filter((x) => x !== t) })} />)}
          </div>
        </fieldset>
        {f.id && <p className="text-xs text-3">Changes apply to new requests and accruals; past balances and approved leave are not rewritten.</p>}
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div></div>
      </form>
    </Modal>
  );
}

function AdjustForm({ types, year, onClose }: { types: readonly LeaveType[]; year: number; onClose: () => void }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ leaveTypeId: types[0]?.id ?? '', leaveYear: year, days: 0, entryType: 'adjustment', note: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/v1/leave/adjustments', { ...f, employeeId: employee.id });
      toast('Balance adjusted');
      onClose();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Modal title="Adjust a leave balance" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <Picker label="Employee" placeholder="Search name or code" queryKey="employees" search={(t) => searchEmployees(t)} required value={employee} onChange={setEmployee} />
        <div className="columns-form">
          <Select label="Leave type" value={f.leaveTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })} />
          <Input label="Leave year" type="number" inputMode="numeric" value={f.leaveYear} onChange={(e) => setF({ ...f, leaveYear: Number(e.target.value) })} />
          <Input label="Days (+ credit, − debit)" hint="Multiples of 0.5" type="number" step={0.5} required value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} />
          <Select label="Kind" value={f.entryType} options={[{ value: 'adjustment', label: 'Correction' }, { value: 'opening', label: 'Opening balance (migration)' }]} onChange={(e) => setF({ ...f, entryType: e.target.value })} />
        </div>
        <Textarea label="Note (kept in the ledger and audit log)" required minLength={5} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!f.days || !employee} loading={busy}>Save adjustment</Button></div></div>
      </form>
    </Modal>
  );
}
