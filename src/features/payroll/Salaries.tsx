import { useState } from 'react';
import { WalletCards } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { RevealToggle } from '../../components/RevealToggle';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { currencySymbol, fmtDate, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { SalaryAmounts } from './parts';
import { COMPONENTS_URL, type PayComponent, type Salary, type Statutory } from './types';

export function Salaries() {
  const { can, hasFeature, me } = useAuth();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  return (
    <div className="stack-4">
      <div className="salary-picker"><EmployeeField value={employee} onChange={setEmployee} /></div>
      {!employee
        ? <EmptyState icon={<WalletCards />} title="Pick an employee" description="See their salary history and statutory details." />
        : (
          // Keyed by person, so nothing belonging to one employee can show or pre-fill under another.
          <div key={employee.id} className="stack-4">
            <SalaryHistory employee={employee} manage={can('payroll.manage')} />
            {/* The server refuses changes to your own record, so the buttons do not offer them. */}
            {hasFeature('FEATURE_PAYROLL_STATUTORY') && <StatutoryCard employee={employee} manage={can('payroll.manage') && employee.id !== me?.user.employeeId} />}
          </div>
        )}
    </div>
  );
}

function SalaryHistory({ employee, manage }: { employee: PickerItem; manage: boolean }) {
  const { query: salaries, revealed, setRevealed } = useRevealable<ApiResponse<'/api/v1/payroll/employees/{id}/salaries'>>(`/api/v1/payroll/employees/${employee.id}/salaries`);
  const components = useApiQuery<ApiResponse<'/api/v1/payroll/components'>>(COMPONENTS_URL);
  const [proposing, setProposing] = useState(false);
  const columns: Column<Salary>[] = [
    { key: 'effective', header: 'Effective', card: 'title', cell: (s) => fmtDate(s.effective_from) },
    { key: 'components', header: 'Components', cell: (s) => <SalaryAmounts amounts={s.amounts} components={components.data?.items ?? []} /> },
    { key: 'reason', header: 'Reason', card: 'subtitle', cell: (s) => <>{s.reason}<div className="table__cell-sub">{s.created_by_name}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (s) => <StatusBadge status={s.status} /> },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between"><h2>Salary history</h2><div className="cluster"><RevealToggle revealed={revealed} loading={salaries.isFetching} onChange={setRevealed} />{manage && <Button size="sm" variant="primary" onClick={() => setProposing(true)}>Propose change</Button>}</div></div>
      <QueryState query={salaries} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No salary yet" />}>
        {(d) => <Table label="Salary history" columns={columns} rows={d.items} rowKey={(s) => s.id} />}
      </QueryState>
      {proposing && <SalaryForm employee={employee} components={components.data?.items ?? []} onClose={() => setProposing(false)} />}
    </div>
  );
}

function SalaryForm({ employee, components, onClose }: { employee: PickerItem; components: readonly PayComponent[]; onClose: () => void }) {
  const toast = useToast();
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocal);
  const [reason, setReason] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const filled = Object.entries(amounts).filter(([, v]) => v !== '');
  const form = useSubmit(async () => {
    await api.post(`/api/v1/payroll/employees/${employee.id}/salaries`, { effectiveFrom, reason, amounts: Object.fromEntries(filled.map(([k, v]) => [k, Number(v)])) });
    toast('Sent for approval');
    await invalidateApi(`/api/v1/payroll/employees/${employee.id}`);
    onClose();
  }, { validate: (): FieldErrors => (!filled.length ? { amounts: 'Enter at least one component' } : {}) });
  return (
    <Modal title={`Salary change — ${employee.label}`} size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <DatePicker label="Effective from" required error={form.errors['effectiveFrom']} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          <Input label="Reason" required minLength={3} error={form.errors['reason']} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="columns-form">
          {components.filter((c) => c.status === 'active').map((c) => (
            <Input key={c.code} label={`${c.name} (${c.calc === 'percent' ? `% of ${c.base_codes.join(' + ')}` : `${currencySymbol()} per month`})`} type="number" inputMode="decimal" min={0} step={0.01} value={amounts[c.code] ?? ''} onChange={(e) => setAmounts({ ...amounts, [c.code]: e.target.value })} />
          ))}
        </div>
        {form.errors['amounts'] && <p role="alert" className="field__error">{form.errors['amounts']}</p>}
        <p className="text-xs text-3">Becomes active after approval by someone with payroll approval rights.</p>
        <FormActions error={form.error} busy={form.busy} submitLabel="Submit" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function StatutoryCard({ employee, manage }: { employee: PickerItem; manage: boolean }) {
  const { query, revealed, setRevealed } = useRevealable<Statutory>(`/api/v1/payroll/employees/${employee.id}/statutory`);
  const [editing, setEditing] = useState(false);
  // Hidden fields read null, and saving a form built from them would clear what is stored. So editing starts from what has been revealed.
  const hidden = isMaskedField(query.data, 'uan') || isMaskedField(query.data, 'esi_ip_number') || isMaskedField(query.data, 'pf_member_id');
  const shown = (s: Statutory, field: 'uan' | 'esi_ip_number' | 'pan') => (isMaskedField(s, field) ? <Money value={null} masked /> : s[field] && <span className="mono">{s[field]}</span>);
  return (
    <Card title="Statutory details" actions={<div className="cluster"><RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="details" />{manage && query.data && <Button size="sm" disabled={hidden} title={hidden ? 'Show the details first' : undefined} onClick={() => setEditing(true)}>Edit</Button>}</div>}>
      <QueryState query={query} compact>
        {(s) => (
          <KeyValue items={[
            { label: 'UAN', value: shown(s, 'uan') },
            { label: 'Provident fund', value: s.pf_excluded ? 'Excluded' : 'Covered' },
            { label: 'ESI IP number', value: shown(s, 'esi_ip_number') },
            { label: 'PAN', value: shown(s, 'pan') },
            { label: 'Tax regime', value: s.tax_regime === 'old' ? 'Old' : 'New' },
            { label: 'PT state', value: s.pt_state ?? 'Branch state' },
          ]} />
        )}
      </QueryState>
      {editing && query.data && <StatutoryForm employee={employee} current={query.data} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function StatutoryForm({ employee, current, onClose }: { employee: PickerItem; current: Statutory; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ uan: current.uan ?? '', pfMemberId: current.pf_member_id ?? '', pfExcluded: current.pf_excluded, esiIpNumber: current.esi_ip_number ?? '', pan: '', taxRegime: current.tax_regime, ptState: current.pt_state ?? '' });
  const form = useSubmit(async () => {
    await api.put(`/api/v1/payroll/employees/${employee.id}/statutory`, { ...f, uan: f.uan || null, pfMemberId: f.pfMemberId || null, esiIpNumber: f.esiIpNumber || null, ptState: f.ptState || null, pan: f.pan || undefined });
    toast('Saved');
    await invalidateApi(`/api/v1/payroll/employees/${employee.id}/statutory`);
    onClose();
  });
  return (
    <Modal title={`Statutory details — ${employee.label}`} onClose={onClose}>
      <form className="stack-3" autoComplete="off" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="UAN" hint="12 digits" inputMode="numeric" pattern="[0-9]{12}" title="12 digits" error={form.errors['uan']} value={f.uan} onChange={(e) => setF({ ...f, uan: e.target.value })} />
          <Input label="PF member id" maxLength={40} error={form.errors['pfMemberId']} value={f.pfMemberId} onChange={(e) => setF({ ...f, pfMemberId: e.target.value })} />
          <Input label="ESI IP number" hint="10 digits" inputMode="numeric" pattern="[0-9]{10}" title="10 digits" error={form.errors['esiIpNumber']} value={f.esiIpNumber} onChange={(e) => setF({ ...f, esiIpNumber: e.target.value })} />
          <Input label="PAN" hint="Leave empty to keep the current one" pattern="[A-Z]{5}[0-9]{4}[A-Z]" title="Format AAAAA9999A" error={form.errors['pan']} value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} />
          <Select label="Tax regime" value={f.taxRegime} options={[{ value: 'new', label: 'New' }, { value: 'old', label: 'Old' }]} onChange={(e) => setF({ ...f, taxRegime: e.target.value })} />
          <Input label="PT state" hint="Empty means the branch state" error={form.errors['ptState']} value={f.ptState} onChange={(e) => setF({ ...f, ptState: e.target.value })} />
        </div>
        <Checkbox label="Not covered by PF (as assessed by the organization)" checked={f.pfExcluded} onChange={(e) => setF({ ...f, pfExcluded: e.target.checked })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
