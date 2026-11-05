import { useMemo, useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDateTime } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';

const ROLES_URL = '/api/v1/tenant/roles';

export type RolesData = ApiResponse<'/api/v1/tenant/roles'>;
type Perm = RolesData['permissions'][number];
type SystemRole = RolesData['system'][number];
type CustomRole = RolesData['custom'][number];

const AREA: Record<string, string> = {
  settings: 'Administration', security: 'Administration', users: 'Administration', audit: 'Administration', approvals: 'Approvals',
  org: 'Organization', employees: 'Employees', profile: 'Employees', documents: 'Documents', attendance: 'Attendance', leave: 'Leave',
  overtime: 'Overtime', field_duty: 'Field duty', expenses: 'Expenses', travel: 'Travel', loans: 'Advances & loans', payroll: 'Payroll',
  payslips: 'Payroll', accounting: 'Accounting', recruitment: 'Recruitment', lifecycle: 'Onboarding & exit', policies: 'Policies',
  training: 'Training & competency', competency: 'Training & competency', performance: 'Performance', assets: 'Assets',
  cases: 'Grievance & POSH', grievance: 'Grievance & POSH', posh: 'Grievance & POSH',
};
const areaOf = (k: string) => AREA[k.split('.')[0]!] ?? 'Other';

function RoleForm({ role, copyFrom, perms, allowed, builtIn, onClose }: { role: CustomRole | null; copyFrom?: SystemRole; perms: readonly Perm[]; allowed: Set<string> | null; builtIn: readonly SystemRole[]; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? (copyFrom ? `${copyFrom.name} (custom)` : ''));
  const [description, setDescription] = useState(role?.description ?? '');
  const may = (p: string) => !allowed || allowed.has(p);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((role?.permissions ?? copyFrom?.permissions ?? []).filter((p) => (role ? true : may(p)))));
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const g = new Map<string, Perm[]>();
    const needle = filter.toLowerCase();
    for (const p of perms) if (!needle || `${p.label} ${p.key}`.toLowerCase().includes(needle)) g.set(areaOf(p.key), [...(g.get(areaOf(p.key)) ?? []), p]);
    return [...g.entries()];
  }, [perms, filter]);
  const toggle = (k: string, on: boolean) => { const n = new Set(selected); if (on) n.add(k); else n.delete(k); setSelected(n); };
  const form = useSubmit(async () => {
    const body = { name: name.trim(), description: description.trim() || null, permissions: [...selected] };
    if (role) {
      const r = await api.patch<ApiResponse<'/api/v1/tenant/roles/{key}', 'patch'>>(`${ROLES_URL}/${encodeURIComponent(role.key)}`, body);
      toast(r?.holdersSignedOut ? `Role saved. ${r.holdersSignedOut} ${r.holdersSignedOut === 1 ? 'person was' : 'people were'} signed out so it applies now` : 'Role saved');
    } else {
      await api.post(ROLES_URL, body);
      toast(`Role "${body.name}" created. Assign it under Users & permissions`);
    }
    await invalidateApi(ROLES_URL);
    onClose();
  }, { validate: (): Record<string, string> => (selected.size ? {} : { permissions: 'Choose at least one permission.' }) });
  return (
    <Modal title={role ? `Edit role: ${role.name}` : 'New role'} size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Role name" required minLength={2} maxLength={60} value={name} error={form.errors['name']} onChange={(e) => setName(e.target.value)} />
          {!role && <Select label="Start from" hint="Copies a built-in role's permissions" placeholder="Choose a built-in role…" value="" options={builtIn.map((b) => ({ value: b.key, label: b.name }))} onChange={(e) => { const b = builtIn.find((x) => x.key === e.target.value); if (b) setSelected(new Set(b.permissions.filter(may))); }} />}
        </div>
        <Input label="What it is for (optional)" maxLength={300} placeholder="For example, supervisors on the night shift" value={description} error={form.errors['description']} onChange={(e) => setDescription(e.target.value)} />
        <div className="cluster-between">
          <strong>Permissions ({selected.size})</strong>
          <div className="role-filter"><Input label="Filter permissions" hideLabel type="search" placeholder="Filter permissions" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} /></div>
        </div>
        {form.errors['permissions'] && <span role="alert" className="field__error">{form.errors['permissions']}</span>}
        {allowed && <p className="text-xs text-2">You can include only permissions you hold yourself. An administrator can include any.</p>}
        <div className="stack-3">
          {groups.map(([area, list]) => (
            <fieldset key={area} className="role-area" aria-label={area}>
              <legend>{area}</legend>
              {list.map((p) => (
                <Checkbox
                  key={p.key}
                  aria-label={p.label}
                  className={may(p.key) ? undefined : 'role-perm--off'}
                  checked={selected.has(p.key)}
                  disabled={!may(p.key)}
                  onChange={(e) => toggle(p.key, e.target.checked)}
                  label={<>{p.label} <span className="mono text-xs text-3">{p.key}</span></>}
                />
              ))}
            </fieldset>
          ))}
          {!groups.length && <EmptyState compact title={`No permission matches “${filter}”.`} />}
        </div>
        {role && role.users > 0 && <p className="text-xs text-2">Changing permissions signs out the {role.users} {role.users === 1 ? 'person' : 'people'} with this role so the change applies at once.</p>}
        <FormActions error={form.error} busy={form.busy} submitLabel={role ? 'Save role' : 'Create role'} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function PermissionList({ role, perms }: { role: SystemRole | CustomRole; perms: readonly Perm[] }) {
  const byArea = new Map<string, string[]>();
  for (const p of perms) if (role.permissions.includes(p.key)) byArea.set(areaOf(p.key), [...(byArea.get(areaOf(p.key)) ?? []), p.label]);
  return <div className="stack-1 role-permissions">{[...byArea.entries()].map(([a, l]) => <div key={a}><strong>{a}:</strong> <span className="text-2">{l.join('; ')}</span></div>)}</div>;
}

/** Settings, Roles: built-in roles (read-only) and the organization's own roles. */
export function Roles() {
  const toast = useToast();
  const query = useApiQuery<RolesData>(ROLES_URL);
  const [form, setForm] = useState<{ role: CustomRole | null; copyFrom?: SystemRole } | null>(null);
  const [del, setDel] = useState<CustomRole | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <QueryState query={query}>
      {(d) => {
        const allowed = d.maxPermissions ? new Set(d.maxPermissions) : null;
        const permissionsCell = (r: SystemRole | CustomRole) => (
          <>
            <Button variant="link" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>{r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'}</Button>
            {open === r.key && <PermissionList role={r} perms={d.permissions} />}
          </>
        );
        const customColumns: Column<CustomRole>[] = [
          { key: 'role', header: 'Role', card: 'title', cell: (r) => <><span className="cluster"><strong>{r.name}</strong></span>{r.description && <div className="table__cell-sub">{r.description}</div>}</> },
          { key: 'permissions', header: 'Permissions', cell: permissionsCell },
          { key: 'people', header: 'People', align: 'right', cell: (r) => r.users },
          { key: 'changed', header: 'Last changed', cell: (r) => <>{fmtDateTime(r.updated_at)}{r.updated_by_name && <div className="table__cell-sub">{r.updated_by_name}</div>}</> },
          {
            key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (r.grantable && d.canManage
              ? <div className="table__actions"><Button size="sm" onClick={() => setForm({ role: r })}>Edit</Button><Button size="sm" variant="danger-ghost" disabled={r.users > 0} title={r.users > 0 ? 'Remove it from everyone first' : undefined} onClick={() => setDel(r)}>Delete</Button></div>
              : <span className="text-xs text-2">Administrator only</span>),
          },
        ];
        const systemColumns: Column<SystemRole>[] = [
          { key: 'role', header: 'Role', card: 'title', cell: (r) => r.name },
          { key: 'permissions', header: 'Permissions', cell: permissionsCell },
          { key: 'people', header: 'People', align: 'right', cell: (r) => r.users },
          { key: 'actions', header: 'Actions', card: 'actions', cell: (r) => (d.canManage && r.key !== 'tenant_admin' ? <div className="table__actions"><Button size="sm" onClick={() => setForm({ role: null, copyFrom: r })}>Copy</Button></div> : null) },
        ];
        return (
          <div className="stack-4">
            <Card title="Your organization's roles" aria-label="Organization roles" actions={d.canManage && <Button size="sm" variant="primary" onClick={() => setForm({ role: null })}>New role</Button>}>
              <div className="stack-3">
                <p className="text-sm text-2">Combine exactly the permissions a job needs, such as a shift supervisor who sees team attendance and keeps training records. A person can hold several roles, and their permissions add up.</p>
                <Table label="Your organization's roles" columns={customColumns} rows={d.custom} rowKey={(r) => r.key} empty={<EmptyState compact title="No roles of your own yet." description="Start from a built-in role below, or create one." />} />
              </div>
            </Card>
            <Card title="Built-in roles" aria-label="Built-in roles">
              <div className="stack-3">
                <p className="text-sm text-2">These come with the product and cannot be changed. Copy one to make a variant.</p>
                <Table label="Built-in roles" columns={systemColumns} rows={d.system} rowKey={(r) => r.key} />
              </div>
            </Card>
            {form && <RoleForm role={form.role} copyFrom={form.copyFrom} perms={d.permissions} allowed={allowed} builtIn={d.system.filter((r) => r.key !== 'tenant_admin')} onClose={() => setForm(null)} />}
            {del && (
              <ConfirmDialog
                title={`Delete role "${del.name}"`}
                message="Nobody holds it, so no one loses access. This is recorded in the audit history."
                confirmLabel="Delete role"
                danger
                onClose={() => setDel(null)}
                onConfirm={async () => { await api.del(`${ROLES_URL}/${encodeURIComponent(del.key)}`); toast('Role deleted'); await invalidateApi(ROLES_URL); }}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
