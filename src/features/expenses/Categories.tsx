import { useState } from 'react';
import { Tags } from 'lucide-react';
import { api } from '../../api';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { currencySymbol } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { CATEGORIES_URL, type ExpenseCategories, type ExpenseCategory } from './types';

interface CategoryForm { id?: string; code: string; name: string; description: string; requiresReceipt: boolean; maxAmount: string; gstApplicable: boolean; status: string; calc: string }

const BLANK: CategoryForm = { code: '', name: '', description: '', requiresReceipt: true, maxAmount: '', gstApplicable: false, status: 'active', calc: '' };
const toForm = (c: ExpenseCategory): CategoryForm => ({ id: c.id, code: c.code, name: c.name, description: c.description ?? '', requiresReceipt: c.requires_receipt, maxAmount: c.max_amount === null ? '' : String(c.max_amount), gstApplicable: c.gst_applicable, status: c.status, calc: c.calc ?? '' });
const CALC_LABEL = { per_diem: 'Days × per-diem rate', mileage: 'Km × mileage rate' } as const;

export function Categories() {
  const query = useApiQuery<ExpenseCategories>(CATEGORIES_URL);
  const [edit, setEdit] = useState<CategoryForm | null>(null);
  const columns: Column<ExpenseCategory>[] = [
    { key: 'code', header: 'Code', card: 'subtitle', cell: (c) => <span className="mono">{c.code}</span> },
    { key: 'name', header: 'Name', card: 'title', cell: (c) => c.name },
    { key: 'calc', header: 'Calculated as', cell: (c) => (c.calc ? CALC_LABEL[c.calc] : 'Amount') },
    { key: 'receipt', header: 'Receipt', cell: (c) => (c.requires_receipt ? 'Required' : 'Optional') },
    { key: 'limit', header: 'Limit per item', align: 'right', cell: (c) => <Money value={c.max_amount} /> },
    { key: 'gst', header: 'GST details', cell: (c) => (c.gst_applicable ? 'Captured' : '—') },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (c) => <div className="table__actions"><Button size="sm" onClick={() => setEdit(toForm(c))}>Edit</Button></div> },
  ];
  return (
    <Card title="Expense categories" flush actions={<Button variant="primary" size="sm" onClick={() => setEdit(BLANK)}>New category</Button>}>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Tags />} title="No categories yet" description="For example: local travel, accommodation, meals, training." />}>
        {(d) => <Table label="Expense categories" columns={columns} rows={d.items} rowKey={(c) => c.id} />}
      </QueryState>
      {edit && <CategoryDialog initial={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function CategoryDialog({ initial, onClose }: { initial: CategoryForm; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const form = useSubmit(async () => {
    const { id, ...rest } = f;
    const body = { ...rest, description: f.description || null, maxAmount: f.maxAmount === '' ? null : Number(f.maxAmount), calc: f.calc || null };
    if (id) await api.put(`${CATEGORIES_URL}/${id}`, body); else await api.post(CATEGORIES_URL, body);
    toast('Saved');
    await invalidateApi(CATEGORIES_URL);
    onClose();
  });
  return (
    <Modal title={f.id ? `Edit ${initial.code}` : 'New expense category'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Code" required error={form.errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required error={form.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label={`Limit per item (${currencySymbol()})`} hint="Blank means no limit" type="number" min={1} step="0.01" error={form.errors['maxAmount']} value={f.maxAmount} onChange={(e) => setF({ ...f, maxAmount: e.target.value })} />
          <Select label="Status" value={f.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={(e) => setF({ ...f, status: e.target.value })} />
          <Select
            label="Calculated as"
            hint="Allowances are priced from the rates under Allowance rates"
            value={f.calc}
            options={[{ value: '', label: 'Amount entered by the employee' }, { value: 'per_diem', label: 'Per diem: days × rate' }, { value: 'mileage', label: 'Mileage: km × rate' }]}
            onChange={(e) => setF({ ...f, calc: e.target.value, ...(e.target.value ? { requiresReceipt: false } : {}) })}
          />
        </div>
        <Input label="Description" error={form.errors['description']} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Checkbox label="Receipt required" checked={f.requiresReceipt} onChange={(e) => setF({ ...f, requiresReceipt: e.target.checked })} />
        <Checkbox label="Capture supplier GSTIN and invoice number" checked={f.gstApplicable} onChange={(e) => setF({ ...f, gstApplicable: e.target.checked })} />
        <FormActions error={form.error} busy={form.busy} onCancel={onClose} submitLabel="Save" />
      </form>
    </Modal>
  );
}
