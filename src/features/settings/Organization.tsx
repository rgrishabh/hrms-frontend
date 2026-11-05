import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { invalidateApi, useApiQuery } from '../../lib/query';

type Kind = 'legal-entities' | 'branches' | 'departments' | 'grades' | 'designations';
interface Row { id: string; name: string; status: string; code?: string | null; gstin?: string | null; cin?: string | null; state_code?: string | null; state?: string | null; city?: string | null; legal_entity_id?: string; parent_id?: string | null }
interface OrgData { legalEntities: Row[]; branches: Row[]; departments: Row[]; grades: Row[]; designations: Row[] }

const NOUN: Record<Kind, string> = { 'legal-entities': 'legal entity', branches: 'branch', departments: 'department', grades: 'grade', designations: 'designation' };
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const ORG_URL = '/api/v1/org';

export function Organization() {
  const { can } = useAuth();
  const query = useApiQuery<OrgData>(ORG_URL);
  const [edit, setEdit] = useState<{ kind: Kind; row: Row | null } | null>(null);
  const manage = can('org.manage');
  const actions = (kind: Kind): Column<Row>[] => (manage ? [{ key: 'actions', header: 'Actions', card: 'actions', cell: (r) => <div className="table__actions"><Button size="sm" onClick={() => setEdit({ kind, row: r })}>Edit</Button></div> }] : []);
  const dash = (v: string | null | undefined) => v || '—';
  return (
    <QueryState query={query}>
      {(d) => {
        const legalName = (id?: string) => d.legalEntities.find((l) => l.id === id)?.name ?? '—';
        const status: Column<Row> = { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> };
        const sections: { kind: Kind; title: string; rows: Row[]; columns: Column<Row>[] }[] = [
          { kind: 'legal-entities', title: 'Legal entities', rows: d.legalEntities, columns: [{ key: 'name', header: 'Name', card: 'title', cell: (r) => r.name }, status, { key: 'gstin', header: 'GSTIN', cell: (r) => <span className="mono">{dash(r.gstin)}</span> }, ...actions('legal-entities')] },
          { kind: 'branches', title: 'Branches', rows: d.branches, columns: [{ key: 'name', header: 'Name', card: 'title', cell: (r) => r.name }, { key: 'code', header: 'Code', card: 'subtitle', cell: (r) => <span className="mono">{dash(r.code)}</span> }, status, { key: 'state', header: 'State', cell: (r) => dash(r.state) }, { key: 'city', header: 'City', cell: (r) => dash(r.city) }, { key: 'entity', header: 'Legal entity', cell: (r) => legalName(r.legal_entity_id) }, ...actions('branches')] },
          { kind: 'departments', title: 'Departments', rows: d.departments, columns: [{ key: 'name', header: 'Name', card: 'title', cell: (r) => r.name }, { key: 'code', header: 'Code', card: 'subtitle', cell: (r) => <span className="mono">{dash(r.code)}</span> }, status, ...actions('departments')] },
          ...(['grades', 'designations'] as const).map((kind) => ({ kind, title: kind === 'grades' ? 'Grades' : 'Designations', rows: d[kind] ?? [], columns: [{ key: 'name', header: 'Name', card: 'title', cell: (r: Row) => r.name }, { key: 'code', header: 'Code', card: 'subtitle', cell: (r: Row) => <span className="mono">{r.code}</span> }, status, ...actions(kind)] as Column<Row>[] })),
        ];
        return (
          <div className="stack-4">
            {sections.map((s) => (
              <Card key={s.kind} title={s.title} aria-label={s.title} flush actions={manage && <Button size="sm" onClick={() => setEdit({ kind: s.kind, row: null })}>Add</Button>}>
                <Table label={s.title} columns={s.columns} rows={s.rows} rowKey={(r) => r.id} empty={<EmptyState compact title="None yet." />} />
              </Card>
            ))}
            {edit && <OrgForm kind={edit.kind} row={edit.row} legalEntities={d.legalEntities} departments={d.departments} onClose={() => setEdit(null)} />}
          </div>
        );
      }}
    </QueryState>
  );
}

function initialValues(kind: Kind, row: Row | null, legalEntities: readonly Row[]): Record<string, string> {
  const status = row?.status ?? 'active';
  if (kind === 'legal-entities') return { name: row?.name ?? '', gstin: row?.gstin ?? '', cin: row?.cin ?? '', stateCode: row?.state_code ?? '', status };
  if (kind === 'branches') return { legalEntityId: row?.legal_entity_id ?? legalEntities[0]?.id ?? '', code: row?.code ?? '', name: row?.name ?? '', state: row?.state ?? '', city: row?.city ?? '', status };
  if (kind === 'grades' || kind === 'designations') return { code: row?.code ?? '', name: row?.name ?? '', status };
  return { code: row?.code ?? '', name: row?.name ?? '', parentId: row?.parent_id ?? '', status };
}

function OrgForm({ kind, row, legalEntities, departments, onClose }: { kind: Kind; row: Row | null; legalEntities: readonly Row[]; departments: readonly Row[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => initialValues(kind, row, legalEntities));
  const form = useSubmit(async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
    if (row) await api.put(`${ORG_URL}/${kind}/${row.id}`, body); else await api.post(`${ORG_URL}/${kind}`, body);
    toast('Saved');
    await invalidateApi(ORG_URL);
    onClose();
  });
  const text = (key: string, label: string, required = false) => <Input label={label} required={required} minLength={required ? 2 : undefined} value={f[key] ?? ''} error={form.errors[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />;
  return (
    <Modal title={`${row ? 'Edit' : 'Add'} ${NOUN[kind]}`} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        {kind === 'legal-entities' && <>{text('name', 'Name', true)}{text('gstin', 'GSTIN (optional)')}{text('cin', 'CIN (optional)')}{text('stateCode', 'State code')}</>}
        {kind === 'branches' && (
          <>
            <Select label="Legal entity" required value={f['legalEntityId']} options={legalEntities.map((l) => ({ value: l.id, label: l.name }))} error={form.errors['legalEntityId']} onChange={(e) => setF({ ...f, legalEntityId: e.target.value })} />
            {text('code', 'Code', true)}{text('name', 'Name', true)}{text('state', 'State', true)}{text('city', 'City')}
          </>
        )}
        {kind === 'departments' && (
          <>
            {text('code', 'Code', true)}{text('name', 'Name', true)}
            <Select label="Parent department" value={f['parentId']} placeholder="None" options={departments.filter((d) => d.id !== row?.id).map((d) => ({ value: d.id, label: d.name }))} error={form.errors['parentId']} onChange={(e) => setF({ ...f, parentId: e.target.value })} />
          </>
        )}
        <Select label="Status" value={f['status']} options={STATUS_OPTIONS} onChange={(e) => setF({ ...f, status: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
