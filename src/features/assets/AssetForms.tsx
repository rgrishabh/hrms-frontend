import { useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { api } from '../../api';
import { Badge } from '../../components/Badge';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { orgOptions, useOrg } from '../org/useOrg';
import { useAssetTerms } from './terms';
import { ASSETS_URL, OUTCOME, STATUS, type Asset, type AssetCategory, type AssetHistoryItem } from './types';

const TAG = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$/;
const reload = () => invalidateApi(ASSETS_URL, '/api/v1/dashboard');

export function AssetForm({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const terms = useAssetTerms();
  const org = useOrg();
  const [f, setF] = useState({ tag: asset?.tag ?? '', name: asset?.name ?? '', category: asset?.category ?? 'it' as AssetCategory, serialNumber: asset?.serial_number ?? '', branchId: asset?.branch_id ?? '', purchaseDate: asset?.purchase_date ?? '', calibrationDue: asset?.calibration_due ?? '', notes: asset?.notes ?? '', status: '' });
  const validate = () => {
    const bad: FieldErrors = {};
    if (!TAG.test(f.tag.trim())) bad['tag'] = 'Use letters, digits and / _ . - only, starting with a letter or digit';
    return bad;
  };
  const form = useSubmit(async () => {
    const body = { tag: f.tag.trim(), name: f.name, category: f.category, serialNumber: f.serialNumber || null, branchId: f.branchId || null, purchaseDate: f.purchaseDate || null, calibrationDue: f.calibrationDue || null, notes: f.notes || null, ...(f.status ? { status: f.status } : {}) };
    if (asset) await api.put(`${ASSETS_URL}/${asset.id}`, body); else await api.post(ASSETS_URL, body);
    toast('Saved');
    await reload();
    onClose();
  }, { validate });
  return (
    <Modal title={asset ? `Edit ${asset.tag}` : 'Add asset'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Asset tag" hint="Letters, digits, / _ . -" required error={form.errors['tag']} value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
          <Select label="Category" error={form.errors['category']} value={f.category} options={terms.categoryOptions(asset?.category)} onChange={(e) => setF({ ...f, category: e.target.value as AssetCategory })} />
        </div>
        <Input label="Name" required minLength={2} maxLength={150} error={form.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="columns-form">
          <Input label="Serial number" maxLength={100} error={form.errors['serialNumber']} value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} />
          <Select label="Location" placeholder="Not set" disabled={org.isError} value={f.branchId} options={orgOptions(org.data?.branches)} onChange={(e) => setF({ ...f, branchId: e.target.value })} />
          <DatePicker label="Purchase date" error={form.errors['purchaseDate']} value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
          <DatePicker label={terms.dueLabel} hint={terms.lab && f.category === 'lab_instrument' ? 'An instrument past this date cannot be issued' : undefined} error={form.errors['calibrationDue']} value={f.calibrationDue} onChange={(e) => setF({ ...f, calibrationDue: e.target.value })} />
        </div>
        {org.isError && <InlineError error={org.error} />}
        {asset && asset.status !== 'assigned' && (
          <Select label="Status" placeholder={`Keep (${STATUS[asset.status] ?? asset.status})`} value={f.status} options={[{ value: 'available', label: 'Available' }, { value: 'in_repair', label: 'In repair' }, { value: 'retired', label: 'Retired' }]} onChange={(e) => setF({ ...f, status: e.target.value })} />
        )}
        <Textarea label="Notes" maxLength={1000} error={form.errors['notes']} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" onCancel={onClose} submitLabel="Save" />
      </form>
    </Modal>
  );
}

export function IssueForm({ asset, today, onClose }: { asset: Asset; today: string; onClose: () => void }) {
  const toast = useToast();
  const terms = useAssetTerms();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ issuedAt: today, conditionOut: 'Good', dueBack: '' });
  const validate = () => {
    const bad: FieldErrors = {};
    if (!employee) bad['employeeId'] = 'Choose who receives it';
    return bad;
  };
  const form = useSubmit(async () => {
    await api.post(`${ASSETS_URL}/${asset.id}/issue`, { employeeId: employee?.id, issuedAt: f.issuedAt, conditionOut: f.conditionOut || null, dueBack: f.dueBack || null });
    toast('Issued; the employee is asked to confirm receipt');
    await reload();
    onClose();
  }, { validate });
  return (
    <Modal title={`Issue ${asset.tag} — ${asset.name}`} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        {asset.calibration_due && <p className="text-sm text-2">{terms.dueLabel} {fmtDate(asset.calibration_due)}</p>}
        <EmployeeField label="Issue to" error={form.errors['employeeId']} value={employee} onChange={(x) => { setEmployee(x); form.clearError('employeeId'); }} />
        <div className="columns-form">
          <DatePicker label="Issued on" required error={form.errors['issuedAt']} value={f.issuedAt} onChange={(e) => setF({ ...f, issuedAt: e.target.value })} />
          <DatePicker label="Due back (optional)" min={f.issuedAt} error={form.errors['dueBack']} value={f.dueBack} onChange={(e) => setF({ ...f, dueBack: e.target.value })} />
        </div>
        <Input label="Condition at issue" hint="For example: Good, with charger and case" maxLength={300} error={form.errors['conditionOut']} value={f.conditionOut} onChange={(e) => setF({ ...f, conditionOut: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Issuing…" onCancel={onClose} submitLabel="Issue" />
      </form>
    </Modal>
  );
}

export function ReceiveForm({ asset, today, onClose }: { asset: Asset; today: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ returnedAt: today, outcome: 'returned', conditionIn: '' });
  const form = useSubmit(async () => {
    await api.post(`${ASSETS_URL}/${asset.id}/receive`, { ...f, conditionIn: f.conditionIn || null });
    toast('Recorded');
    await reload();
    onClose();
  });
  const returned = f.outcome === 'returned';
  return (
    <Modal title={`Receive ${asset.tag} from ${asset.holder_name ?? 'employee'}`} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <DatePicker label="Returned on" required min={asset.issued_at ?? undefined} error={form.errors['returnedAt']} value={f.returnedAt} onChange={(e) => setF({ ...f, returnedAt: e.target.value })} />
          <Select label="Outcome" value={f.outcome} options={Object.entries(OUTCOME).map(([value, label]) => ({ value, label }))} onChange={(e) => setF({ ...f, outcome: e.target.value })} />
        </div>
        <Textarea
          label={returned ? 'Condition (optional)' : 'What happened (required)'}
          hint={f.outcome === 'damaged' ? 'The asset goes to “In repair”' : f.outcome === 'lost' ? 'The asset is marked lost' : undefined}
          required={!returned}
          maxLength={500}
          error={form.errors['conditionIn']}
          value={f.conditionIn}
          onChange={(e) => setF({ ...f, conditionIn: e.target.value })}
        />
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" onCancel={onClose} submitLabel="Record return" />
      </form>
    </Modal>
  );
}

const historyColumns: Column<AssetHistoryItem>[] = [
  { key: 'employee', header: 'Employee', card: 'title', cell: (h) => <>{h.employee_name}<div className="table__cell-sub">{h.employee_code}</div></> },
  { key: 'issued', header: 'Issued', cell: (h) => <>{fmtDate(h.issued_at)}<div className="table__cell-sub">by {h.issued_by_name}{h.acknowledged_at ? ` · confirmed ${fmtDateTime(h.acknowledged_at)}` : ''}</div></> },
  { key: 'returned', header: 'Returned', cell: (h) => (h.returned_at ? <>{fmtDate(h.returned_at)}{h.received_by_name && <div className="table__cell-sub">by {h.received_by_name}</div>}</> : <Badge tone="info">With employee</Badge>) },
  { key: 'outcome', header: 'Outcome', cell: (h) => (h.outcome ? OUTCOME[h.outcome] ?? h.outcome : '—') },
  { key: 'condition', header: 'Condition', cell: (h) => `${h.condition_out ?? '—'}${h.condition_in ? ` → ${h.condition_in}` : ''}` },
];

export function AssetHistory({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const query = useApiQuery<{ items: AssetHistoryItem[] }>(`${ASSETS_URL}/${asset.id}/history`);
  return (
    <Modal title={`History — ${asset.tag}`} size="lg" onClose={onClose}>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<HistoryIcon />} title="Never issued" />}>
        {(d) => <Table label="Issue history" columns={historyColumns} rows={d.items} rowKey={(h) => h.id} />}
      </QueryState>
    </Modal>
  );
}
