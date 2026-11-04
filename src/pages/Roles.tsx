import { useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Confirm, useToast, errText } from '../ui';

type Perm = { key: string; label: string; privileged: boolean };
type Role = { key: string; name: string; description?: string | null; permissions: string[]; users: number; grantable: boolean; mfaRequired?: boolean; updated_at?: string; updated_by_name?: string | null };

const AREA: Record<string, string> = {
  settings: 'Administration', security: 'Administration', users: 'Administration', audit: 'Administration', approvals: 'Approvals',
  org: 'Organization', employees: 'Employees', profile: 'Employees', documents: 'Documents', attendance: 'Attendance', leave: 'Leave',
  overtime: 'Overtime', field_duty: 'Field duty', expenses: 'Expenses', travel: 'Travel', loans: 'Advances & loans', payroll: 'Payroll',
  payslips: 'Payroll', accounting: 'Accounting', recruitment: 'Recruitment', lifecycle: 'Onboarding & exit', policies: 'Policies',
  training: 'Training & competency', competency: 'Training & competency', performance: 'Performance', assets: 'Assets',
  cases: 'Grievance & POSH', grievance: 'Grievance & POSH', posh: 'Grievance & POSH',
};
const areaOf = (k: string) => AREA[k.split('.')[0]!] ?? 'Other';

function RoleForm({ role, copyFrom, perms, allowed, builtIn, onClose, onSaved }: {
  role: Role | null; copyFrom?: Role; perms: Perm[]; allowed: Set<string> | null; builtIn: Role[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? (copyFrom ? `${copyFrom.name} (custom)` : ''));
  const [description, setDescription] = useState(role?.description ?? '');
  const may = (p: string) => !allowed || allowed.has(p);
  const [selected, setSelected] = useState<Set<string>>(new Set((role?.permissions ?? copyFrom?.permissions ?? []).filter((p) => role ? true : may(p))));
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const g = new Map<string, Perm[]>();
    for (const p of perms) if (!filter || `${p.label} ${p.key}`.toLowerCase().includes(filter.toLowerCase())) g.set(areaOf(p.key), [...(g.get(areaOf(p.key)) ?? []), p]);
    return [...g.entries()];
  }, [perms, filter]);
  const toggle = (k: string, on: boolean) => { const n = new Set(selected); if (on) n.add(k); else n.delete(k); setSelected(n); };
  const privileged = perms.filter((p) => p.privileged && selected.has(p.key));
  return (
    <Modal title={role ? `Edit role: ${role.name}` : 'New role'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null); setBusy(true);
        try {
          const body = { name: name.trim(), description: description.trim() || null, permissions: [...selected] };
          if (role) {
            const r = await api.patch(`/api/v1/tenant/roles/${encodeURIComponent(role.key)}`, body);
            onSaved(r.holdersSignedOut ? `Role saved. ${r.holdersSignedOut} ${r.holdersSignedOut === 1 ? 'person was' : 'people were'} signed out so it applies now` : 'Role saved');
          } else { await api.post('/api/v1/tenant/roles', body); onSaved(`Role "${body.name}" created. Assign it under Users & permissions`); }
          onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <div className="grid-2">
          <Field label="Role name"><input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {!role && <Field label="Start from" hint="Copies a built-in role's permissions">
            <select aria-label="Start from" value="" onChange={(e) => { const b = builtIn.find((x) => x.key === e.target.value); if (b) setSelected(new Set(b.permissions.filter(may))); }}>
              <option value="">Choose a built-in role…</option>{builtIn.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select></Field>}
        </div>
        <Field label="What it is for (optional)"><input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Shift supervisors on the testing floor" /></Field>
        <div className="row"><strong>Permissions ({selected.size})</strong><span className="spacer" />
          <input aria-label="Filter permissions" placeholder="Filter permissions" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }} /></div>
        {allowed && <p className="hint">You can include only permissions you hold yourself. An administrator can include any.</p>}
        <div className="stack" style={{ maxHeight: '45vh', overflow: 'auto', gap: 10 }}>
          {groups.map(([area, list]) => (
            <fieldset key={area} className="card" style={{ padding: 10 }} aria-label={area}>
              <legend><strong>{area}</strong></legend>
              {list.map((p) => (
                <label key={p.key} className="row" style={{ alignItems: 'flex-start', gap: 8, opacity: may(p.key) || selected.has(p.key) ? 1 : 0.55 }}>
                  <input type="checkbox" aria-label={p.label} checked={selected.has(p.key)} disabled={!may(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                  <span>{p.label}{p.privileged && <span className="badge warn" style={{ marginLeft: 6 }}>2FA</span>}<span className="muted mono" style={{ marginLeft: 6, fontSize: 11 }}>{p.key}</span></span>
                </label>))}
            </fieldset>))}
          {!groups.length && <Empty>No permission matches “{filter}”.</Empty>}
        </div>
        {privileged.length > 0 && <div className="alert warn">People with this role must use two-factor authentication: it includes {privileged.map((p) => p.label.toLowerCase()).join('; ')}.</div>}
        {role && role.users > 0 && <div className="hint">Changing permissions signs out the {role.users} {role.users === 1 ? 'person' : 'people'} with this role so the change applies at once.</div>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !selected.size}>{role ? 'Save role' : 'Create role'}</button></div>
      </form>
    </Modal>
  );
}

function PermissionList({ role, perms }: { role: Role; perms: Perm[] }) {
  const byArea = new Map<string, string[]>();
  for (const p of perms) if (role.permissions.includes(p.key)) byArea.set(areaOf(p.key), [...(byArea.get(areaOf(p.key)) ?? []), p.label]);
  return <div className="stack" style={{ gap: 4 }}>{[...byArea.entries()].map(([a, l]) => <div key={a}><strong>{a}:</strong> <span className="muted">{l.join('; ')}</span></div>)}</div>;
}

/** Settings → Roles: built-in roles (read-only) and the organization's own roles. */
export function Roles() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/tenant/roles'), []);
  const [form, setForm] = useState<{ role: Role | null; copyFrom?: Role } | null>(null);
  const [del, setDel] = useState<Role | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const perms: Perm[] = data.permissions;
  const allowed: Set<string> | null = data.maxPermissions ? new Set(data.maxPermissions) : null;
  const custom: Role[] = data.custom; const system: Role[] = data.system;
  return (
    <div className="stack">
      <section className="card stack" aria-label="Organization roles">
        <div className="row"><h2 style={{ margin: 0 }}>Your organization's roles</h2><span className="spacer" />
          {data.canManage && <button className="btn primary" onClick={() => setForm({ role: null })}>New role</button>}</div>
        <p className="hint">Combine exactly the permissions a job needs, e.g. a shift supervisor who sees team attendance and keeps training records. A person can hold several roles; their permissions add up.</p>
        {!custom.length ? <Empty>No roles of your own yet. Start from a built-in role below, or create one.</Empty> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Role</th><th>Permissions</th><th>People</th><th>Last changed</th><th /></tr></thead><tbody>
            {custom.map((r) => (
              <tr key={r.key}>
                <td><strong>{r.name}</strong>{r.mfaRequired && <span className="badge warn" style={{ marginLeft: 6 }}>2FA</span>}{r.description && <div className="muted">{r.description}</div>}</td>
                <td><button className="btn sm" style={{ border: 'none', padding: 0, background: 'none', color: 'var(--brand)' }} onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
                  {r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'}</button>{open === r.key && <PermissionList role={r} perms={perms} />}</td>
                <td>{r.users}</td>
                <td>{r.updated_at ? fmtDateTime(r.updated_at) : '—'}{r.updated_by_name && <div className="muted">{r.updated_by_name}</div>}</td>
                <td>{r.grantable && data.canManage ? <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setForm({ role: r })}>Edit</button>
                  <button className="btn sm danger" onClick={() => setDel(r)} disabled={r.users > 0} title={r.users > 0 ? 'Remove it from everyone first' : undefined}>Delete</button></div>
                  : <span className="muted" style={{ fontSize: 12 }}>Administrator only</span>}</td>
              </tr>))}
          </tbody></table></div>
        )}
      </section>
      <section className="card stack" aria-label="Built-in roles">
        <h2 style={{ margin: 0 }}>Built-in roles</h2>
        <p className="hint">These come with HRMS and cannot be changed. Copy one to make a variant.</p>
        <div className="table-wrap"><table className="t"><thead><tr><th>Role</th><th>Permissions</th><th>People</th><th /></tr></thead><tbody>
          {system.map((r) => (
            <tr key={r.key}><td>{r.name}</td>
              <td><button className="btn sm" style={{ border: 'none', padding: 0, background: 'none', color: 'var(--brand)' }} onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
                {r.permissions.length} permissions</button>{open === r.key && <PermissionList role={r} perms={perms} />}</td>
              <td>{r.users}</td>
              <td>{data.canManage && r.key !== 'tenant_admin' && <button className="btn sm" onClick={() => setForm({ role: null, copyFrom: r })}>Copy</button>}</td></tr>))}
        </tbody></table></div>
      </section>
      {form && <RoleForm role={form.role} copyFrom={form.copyFrom} perms={perms} allowed={allowed} builtIn={system.filter((r) => r.key !== 'tenant_admin')}
        onClose={() => setForm(null)} onSaved={(m) => { toast(m); reload(); }} />}
      {del && <Confirm title={`Delete role "${del.name}"`} message="Nobody holds it, so no one loses access. This is recorded in the audit history." confirmLabel="Delete role" danger
        onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/v1/tenant/roles/${encodeURIComponent(del.key)}`); toast('Role deleted'); reload(); }} />}
    </div>
  );
}
