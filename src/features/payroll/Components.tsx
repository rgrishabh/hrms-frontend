import { useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { COMPONENTS_URL, type PayComponent } from './types';

interface ComponentForm { id?: string; code: string; name: string; kind: string; calc: string; baseCodes: string[]; prorate: boolean; taxable: boolean; pfWage: boolean; esiWage: boolean; position: string; status: string }
const BLANK: ComponentForm = { code: '', name: '', kind: 'earning', calc: 'fixed', baseCodes: [], prorate: true, taxable: true, pfWage: false, esiWage: true, position: '0', status: 'active' };
const toForm = (c: PayComponent): ComponentForm => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, calc: c.calc, baseCodes: c.base_codes, prorate: c.prorate, taxable: c.taxable, pfWage: c.pf_wage, esiWage: c.esi_wage, position: String(c.position), status: c.status });
const FLAGS: [keyof Pick<ComponentForm, 'prorate' | 'taxable' | 'pfWage' | 'esiWage'>, string][] = [['prorate', 'Prorate by paid days'], ['taxable', 'Taxable'], ['pfWage', 'Counts towards PF wages'], ['esiWage', 'Counts towards ESI wages']];

export function Components() {
  const { can } = useAuth();
  const query = useApiQuery<{ items: PayComponent[] }>(COMPONENTS_URL);
  const [edit, setEdit] = useState<ComponentForm | null>(null);
  const columns: Column<PayComponent>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (c) => c.name },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (c) => <span className="mono">{c.code}</span> },
    { key: 'kind', header: 'Kind', cell: (c) => (c.kind === 'earning' ? 'Earning' : 'Deduction') },
    { key: 'calc', header: 'Calculation', cell: (c) => (c.calc === 'percent' ? `% of ${c.base_codes.join(' + ')}` : 'Fixed monthly') },
    { key: 'flags', header: 'Applies to', cell: (c) => <span className="text-sm text-2">{[c.prorate && 'prorated', c.taxable && 'taxable', c.pf_wage && 'PF wage', c.esi_wage && 'ESI wage'].filter(Boolean).join(' · ')}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    ...(can('payroll.manage') ? [{ key: 'actions', header: 'Actions', card: 'actions', cell: (c: PayComponent) => <div className="table__actions"><Button size="sm" aria-label={`Edit ${c.name}`} onClick={() => setEdit(toForm(c))}>Edit</Button></div> } as Column<PayComponent>] : []),
  ];
  return (
    <div className="stack-3">
      {can('payroll.manage') && <div className="cluster-between"><span /><Button variant="primary" onClick={() => setEdit({ ...BLANK })}>New component</Button></div>}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Layers />} title="No components yet" description="A typical start: BASIC, HRA as a percent of BASIC, and a special allowance." />}>
        {(d) => <Table label="Pay components" columns={columns} rows={d.items} rowKey={(c) => c.id} />}
      </QueryState>
      {edit && <ComponentEditor initial={edit} components={query.data?.items ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ComponentEditor({ initial, components, onClose }: { initial: ComponentForm; components: readonly PayComponent[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const percent = f.calc === 'percent';
  const bases = components.filter((c) => c.calc === 'fixed' && c.code !== f.code);
  const form = useSubmit(async () => {
    const { id, ...rest } = f;
    const body = { ...rest, position: Number(f.position), baseCodes: percent ? f.baseCodes : [] };
    if (id) await api.put(`${COMPONENTS_URL}/${id}`, body); else await api.post(COMPONENTS_URL, body);
    toast('Saved');
    await invalidateApi(COMPONENTS_URL);
    onClose();
  }, { validate: (): FieldErrors => (percent && !f.baseCodes.length ? { baseCodes: 'Choose at least one base component' } : {}) });
  return (
    <Modal title={f.id ? `Edit ${initial.code}` : 'New component'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Code" hint="Letters, digits and _, starting with a letter" required pattern="[A-Za-z][A-Za-z0-9_]{0,19}" title="Letters, digits and underscore, starting with a letter, up to 20 characters" error={form.errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required minLength={2} maxLength={80} error={form.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Kind" value={f.kind} options={[{ value: 'earning', label: 'Earning' }, { value: 'deduction', label: 'Deduction' }]} onChange={(e) => setF({ ...f, kind: e.target.value })} />
          <Select label="Calculation" value={f.calc} options={[{ value: 'fixed', label: 'Fixed monthly amount' }, { value: 'percent', label: 'Percent of components' }]} onChange={(e) => setF({ ...f, calc: e.target.value })} />
          <Input label="Order on payslip" type="number" inputMode="numeric" min={0} max={999} error={form.errors['position']} value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
          <Select label="Status" value={f.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={(e) => setF({ ...f, status: e.target.value })} />
        </div>
        {percent && (
          <fieldset className="table-toolbar__group">
            <legend>Base components (fixed components only)</legend>
            {bases.length
              ? <div className="columns-form">{bases.map((c) => <Checkbox key={c.code} label={`${c.code}, ${c.name}`} checked={f.baseCodes.includes(c.code)} onChange={(e) => setF({ ...f, baseCodes: e.target.checked ? [...f.baseCodes, c.code] : f.baseCodes.filter((x) => x !== c.code) })} />)}</div>
              : <p className="text-sm text-2">No fixed components yet. Add one first.</p>}
            {form.errors['baseCodes'] && <p role="alert" className="field__error">{form.errors['baseCodes']}</p>}
          </fieldset>
        )}
        <div className="columns-form">
          {FLAGS.map(([k, label]) => <Checkbox key={k} label={label} checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />)}
        </div>
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
