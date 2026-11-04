import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Modal, Field, Confirm, Pager, useToast, errText } from '../ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'UTC'];
const SOURCE_LABEL: Record<string, string> = { default: 'Default', deployment: 'Installation default', platform: 'Installation default', tenant: 'Organization setting', branch: 'Branch override', deployment_ceiling: 'Capped by installation limit' };

export function SettingsCenter() {
  const { can, canAny } = useAuth();
  const sections = [
    { to: 'general', label: 'General', show: can('settings.read') },
    { to: 'attendance', label: 'Attendance policy', show: can('settings.read') },
    { to: 'security', label: 'Security & privacy', show: can('settings.read') },
    { to: 'installation', label: 'Installation', show: can('settings.read') },
    { to: 'organization', label: 'Legal entities & branches', show: canAny('org.read') },
    { to: 'users', label: 'Users & permissions', show: can('users.manage') },
    { to: 'jobs', label: 'Scheduled jobs', show: can('settings.read') },
    { to: 'audit', label: 'Audit history', show: can('audit.read') },
  ].filter((s) => s.show);
  return (
    <div className="stack">
      <div><h1>Settings center</h1><p className="sub">Business settings for your organization. Changes apply immediately and are recorded in the audit history.</p></div>
      <nav className="tabs">{sections.map((s) => <NavLink key={s.to} to={`/settings/${s.to}`} className={({ isActive }) => (isActive ? 'active' : '')}>{s.label}</NavLink>)}</nav>
      <Routes>
        <Route path="general" element={<SettingsGroup group="general" />} />
        <Route path="attendance" element={<SettingsGroup group="attendance" />} />
        <Route path="security" element={<SettingsGroup group="security" />} />
        <Route path="installation" element={<Installation />} />
        <Route path="organization" element={<Organization />} />
        <Route path="users" element={<Users />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="audit" element={<Audit />} />
        {/* Absolute targets: relative links inside a splat route resolve against the full URL in React Router v7. */}
        <Route path="*" element={<Navigate to={`/settings/${sections[0]?.to ?? 'general'}`} replace />} />
      </Routes>
    </div>
  );
}

function ValueEditor({ s, value, onChange }: { s: any; value: any; onChange: (v: any) => void }) {
  if (s.control === 'boolean') return <label className="row"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {value ? 'Enabled' : 'Disabled'}</label>;
  if (s.control === 'number') return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
  if (s.control === 'select') return <select value={value} onChange={(e) => onChange(e.target.value)}>{s.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if (s.control === 'timezone') return <select value={value} onChange={(e) => onChange(e.target.value)}>{[...new Set([value, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}</select>;
  if (s.control === 'weekdays') return (
    <div className="weekdays" role="group" aria-label={s.label}>{WEEKDAYS.map((d, i) => {
      const on = (value as number[]).includes(i);
      return <button type="button" key={d} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onChange(on ? value.filter((x: number) => x !== i) : [...value, i])}>{d}</button>;
    })}</div>);
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

const show = (v: any, s: any) => (v === null || v === '' ? (s.options?.find((o: any) => o.value === '')?.label ?? 'Not set')
  : s.control === 'weekdays' ? (v as number[]).map((i) => WEEKDAYS[i]).join(', ') || 'None' : s.control === 'boolean' ? (v ? 'Enabled' : 'Disabled')
  : s.control === 'select' ? (s.options?.find((o: any) => o.value === v)?.label ?? String(v)) : String(v));

function SettingRow({ s, branchId, onSaved }: { s: any; branchId: string; onSaved: () => void }) {
  const toast = useToast();
  const scope = branchId ? 'branch' : 'tenant';
  const own = scope === 'branch' ? s.branchValue : s.tenantValue;
  const [draft, setDraft] = useState<any>(s.effective);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.effective);
  const branchUnsupported = scope === 'branch' && !s.scopes.includes('branch');
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.put(`/api/v1/tenant/settings/${s.key}`, { value: draft, scope, branchId: branchId || undefined, expectedVersion: scope === 'tenant' ? s.version ?? undefined : undefined }); toast(`${s.label} saved`); onSaved(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setError(null);
    try { await api.del(`/api/v1/tenant/settings/${s.key}${qs({ scope, branchId })}`); toast(`${s.label} now inherits`); onSaved(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="setting">
      <div>
        <div style={{ fontWeight: 600 }}>{s.label}</div>
        <div className="muted" style={{ fontSize: 13 }}>{s.description}</div>
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          <span className={`badge ${s.source === 'branch' || s.source === 'tenant' ? 'info' : ''}`}>{SOURCE_LABEL[s.source]}</span>
          {s.source !== 'default' && <span className="muted" style={{ fontSize: 12 }}>Default: {show(s.defaultValue, s)}</span>}
          {scope === 'branch' && s.tenantValue !== null && <span className="muted" style={{ fontSize: 12 }}>Organization: {show(s.tenantValue, s)}</span>}
          {s.feature && !s.featureEnabled && <span className="badge warn">Module disabled</span>}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {branchUnsupported ? <div className="muted">Set at organization level only: {show(s.effective, s)}</div> : !s.editable ? <div>{show(s.effective, s)} <span className="muted">(read only)</span></div> : (
          <>
            <ValueEditor s={s} value={draft} onChange={setDraft} />
            <div className="row">
              <button className="btn sm primary" disabled={!dirty || busy} onClick={save}>Save</button>
              {dirty && <button className="btn sm" onClick={() => { setDraft(s.effective); setError(null); }}>Cancel</button>}
              {own !== null && !dirty && <button className="btn sm" disabled={busy} onClick={reset}>Reset to inherited</button>}
            </div>
          </>
        )}
        <ErrorBox error={error} />
      </div>
    </div>
  );
}

function SettingsGroup({ group }: { group: string }) {
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/tenant/settings${qs({ branchId })}`), [branchId]);
  const items = (data?.items ?? []).filter((s: any) => s.group === group && (`${s.label} ${s.description}`.toLowerCase().includes(search.toLowerCase())));
  const branchable = (data?.items ?? []).some((s: any) => s.group === group && s.scopes.includes('branch'));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Search settings" aria-label="Search settings" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 200px' }} />
        {branchable && <select aria-label="Editing level" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Organization level</option>{org.data?.branches.map((b: any) => <option key={b.id} value={b.id}>Branch override: {b.name}</option>)}</select>}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !items.length ? <Empty>No settings match.</Empty> : items.map((s: any) => <SettingRow key={`${s.key}:${branchId}:${s.version}:${JSON.stringify(s.effective)}`} s={s} branchId={branchId} onSaved={reload} />)}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = { core_hr: 'Core HR', workforce: 'Workforce management', payroll_finance: 'Payroll & finance', talent: 'Talent & laboratory', operations: 'Operations & compliance' };

/** Read-only: everything here is set by the deployment (Docker Compose .env or Terraform), not in the app. */
function Installation() {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/tenant/installation'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const row = (l: string, v: any) => <div className="stat"><div className="l">{l}</div><div>{v ?? '—'}</div></div>;
  const byCat: Record<string, any[]> = {};
  for (const m of data.modules) (byCat[m.category] ??= []).push(m);
  return (
    <div className="stack">
      <div className="alert info">These settings belong to this installation's deployment configuration and can only be changed by your system operator (then the application is restarted). Business settings such as attendance policies are under the other tabs.</div>
      <div className="card stack">
        <h3>Branding</h3>
        <div className="row" style={{ gap: 16 }}>
          {data.brand.logoUrl ? <img src={data.brand.logoUrl} alt="Logo" style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} /> : <span className="muted">No logo configured</span>}
          {['primaryColor', 'secondaryColor', 'accentColor'].map((k) => (
            <div key={k} className="row" style={{ gap: 6 }}><span style={{ width: 22, height: 22, borderRadius: 4, background: data.brand[k], border: '1px solid var(--border)' }} /><span className="mono">{data.brand[k]}</span></div>))}
        </div>
        <div className="grid grid-4">
          {row('Product', data.product.name)}{row('Brand name', data.brand.name)}{row('Short name', data.brand.shortName)}{row('Login message', data.brand.loginMessage)}
          {row('Support email', data.brand.supportEmail)}{row('Support phone', data.brand.supportPhone)}{row('Help link', data.brand.helpUrl)}
        </div>
      </div>
      <div className="card stack">
        <h3>Organization</h3>
        <div className="grid grid-4">
          {row('Name', data.organization.name)}{row('Legal name', data.organization.legalName)}{row('Country', data.organization.country)}{row('Currency', data.organization.currency)}
          {row('Default timezone', data.organization.timezone)}{row('Default date format', data.organization.dateFormat)}{row('Financial year starts', new Date(2000, data.organization.fiscalYearStartMonth - 1, 1).toLocaleString('en-IN', { month: 'long' }))}
        </div>
      </div>
      <div className="card stack">
        <h3>Domains</h3>
        <div className="table-wrap"><table className="t"><thead><tr><th>Hostname</th><th>Status</th></tr></thead><tbody>
          {data.domains.map((d: any) => <tr key={d.hostname}><td className="mono">{d.hostname}{d.is_primary && <span className="badge info" style={{ marginLeft: 6 }}>Primary</span>}</td><td><StatusBadge status={d.activation_status} /></td></tr>)}
        </tbody></table></div>
      </div>
      {Object.entries(byCat).map(([cat, mods]) => (
        <div key={cat} className="card">
          <h3>{CATEGORY_LABEL[cat] ?? cat}</h3>
          <div className="table-wrap"><table className="t"><thead><tr><th>Module</th><th>Release</th><th>Enabled</th><th>Configured</th><th>State</th></tr></thead><tbody>
            {mods.map((m) => (
              <tr key={m.key}>
                <td><div style={{ fontWeight: 600 }}>{m.name}</div><div className="muted" style={{ fontSize: 12 }}>{m.description}</div>{m.dependencies.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Requires: {m.dependencies.join(', ')}</div>}</td>
                <td>{m.supported ? <span className="badge ok">Available</span> : <span className="badge">Planned</span>}</td>
                <td>{m.core ? <span className="badge info">Core</span> : m.enabled ? 'Yes' : 'No'}</td>
                <td>{!m.enabled ? '—' : m.configured ? '✓' : <span className="badge warn">Incomplete</span>}</td>
                <td>{m.usable ? <span className="badge ok">Usable{m.operational === 'degraded' ? ' · degraded' : ''}</span> : <span className="badge" title={m.blockers.join('\n')}>{m.blockers[0] ?? 'Unavailable'}</span>}</td>
              </tr>))}
          </tbody></table></div>
        </div>
      ))}
    </div>
  );
}

function Organization() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/org'), []);
  const [edit, setEdit] = useState<{ kind: 'legal-entities' | 'branches' | 'departments'; row: any } | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const manage = can('org.manage');
  const leName = (id: string) => data.legalEntities.find((l: any) => l.id === id)?.name;
  return (
    <div className="stack">
      {([['legal-entities', 'Legal entities', data.legalEntities, ['name', 'gstin', 'status']], ['branches', 'Branches', data.branches, ['code', 'name', 'state', 'city', 'status']],
        ['departments', 'Departments', data.departments, ['code', 'name', 'status']]] as const).map(([kind, title, rows, cols]) => (
        <div key={kind} className="card stack">
          <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><span className="spacer" />{manage && <button className="btn sm" onClick={() => setEdit({ kind, row: {} })}>Add</button>}</div>
          {!rows.length ? <div className="muted">None yet.</div> : (
            <div className="table-wrap"><table className="t"><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}{kind === 'branches' && <th>legal entity</th>}{manage && <th />}</tr></thead><tbody>
              {rows.map((r: any) => <tr key={r.id}>{cols.map((c) => <td key={c}>{c === 'status' ? <StatusBadge status={r[c]} /> : r[c] ?? '—'}</td>)}{kind === 'branches' && <td>{leName(r.legal_entity_id)}</td>}
                {manage && <td><button className="btn sm" onClick={() => setEdit({ kind, row: r })}>Edit</button></td>}</tr>)}
            </tbody></table></div>)}
        </div>
      ))}
      {edit && <OrgForm kind={edit.kind} row={edit.row} legalEntities={data.legalEntities} departments={data.departments} onClose={() => setEdit(null)} onSaved={() => { toast('Saved'); reload(); }} />}
    </div>
  );
}

function OrgForm({ kind, row, legalEntities, departments, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(kind === 'legal-entities' ? { name: row.name ?? '', gstin: row.gstin ?? '', cin: row.cin ?? '', stateCode: row.state_code ?? '', status: row.status ?? 'active' }
    : kind === 'branches' ? { legalEntityId: row.legal_entity_id ?? legalEntities[0]?.id ?? '', code: row.code ?? '', name: row.name ?? '', state: row.state ?? '', city: row.city ?? '', status: row.status ?? 'active' }
      : { code: row.code ?? '', name: row.name ?? '', parentId: row.parent_id ?? '', status: row.status ?? 'active' });
  const [error, setError] = useState<string | null>(null);
  const inp = (k: string, lbl: string, extra: any = {}) => <Field label={lbl}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></Field>;
  return (
    <Modal title={`${row.id ? 'Edit' : 'Add'} ${kind.replace('-', ' ').replace(/s$/, '')}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
        try { if (row.id) await api.put(`/api/v1/org/${kind}/${row.id}`, body); else await api.post(`/api/v1/org/${kind}`, body); onSaved(); onClose(); }
        catch (x) { setError(errText(x)); }
      }}>
        {kind === 'legal-entities' && <>{inp('name', 'Name', { required: true })}{inp('gstin', 'GSTIN (optional)')}{inp('cin', 'CIN (optional)')}{inp('stateCode', 'State code')}</>}
        {kind === 'branches' && <>
          <Field label="Legal entity"><select value={f.legalEntityId} onChange={(e) => setF({ ...f, legalEntityId: e.target.value })}>{legalEntities.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          {inp('code', 'Code', { required: true })}{inp('name', 'Name', { required: true })}{inp('state', 'State', { required: true })}{inp('city', 'City')}</>}
        {kind === 'departments' && <>{inp('code', 'Code', { required: true })}{inp('name', 'Name', { required: true })}
          <Field label="Parent department"><select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}><option value="">None</option>{departments.filter((d: any) => d.id !== row.id).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></>}
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function Users() {
  const toast = useToast();
  const { me } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const roles = useLoad(() => api.get('/api/v1/tenant/roles'), []);
  const url = `/api/v1/tenant/users${qs({ search, page })}`;
  const { data, loading, error, reload } = useLoad(() => api.get(url), [url]);
  const [edit, setEdit] = useState<any>(null);
  const allRoles = [...(roles.data?.system ?? []), ...(roles.data?.custom ?? [])];
  const roleName = (k: string) => allRoles.find((r: any) => r.key === k)?.name ?? k;
  // The server refuses changes to an account holding roles this user may not grant; say so instead of offering a form that fails.
  const manageable = (u: any) => u.id === me!.user.id || u.roles.every((k: string) => allRoles.find((r: any) => r.key === k)?.grantable !== false);
  return (
    <div className="stack">
      <div className="row"><input placeholder="Search users" aria-label="Search users" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ flex: '1 1 240px' }} /><button className="btn primary" onClick={() => setEdit({})}>Add user</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No users found.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>User</th><th>Roles</th><th>Employee</th><th>Status</th><th>Last sign-in</th><th /></tr></thead><tbody>
            {data.items.map((u: any) => <tr key={u.id}><td><div>{u.display_name}</div><div className="muted">{u.email}</div>{u.mfa_enabled && <span className="badge ok">2FA</span>}</td><td>{u.roles.map(roleName).join(', ')}</td>
              <td className="mono">{u.employee_code ?? '—'}</td><td><StatusBadge status={u.status} />{u.locked && <span className="badge warn" style={{ marginLeft: 4 }}>Locked</span>}</td>
              <td>{u.last_login_at ? fmtDateTime(u.last_login_at) : '—'}</td><td>{manageable(u) ? <button className="btn sm" onClick={() => setEdit(u)}>Manage</button> : <span className="muted" style={{ fontSize: 12 }}>Administrator only</span>}</td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {edit && <UserForm user={edit} self={edit.id === me!.user.id} roles={allRoles} onClose={() => setEdit(null)} onSaved={() => { toast('User saved'); reload(); }} />}
    </div>
  );
}

function UserForm({ user, self, roles, onClose, onSaved }: any) {
  const isNew = !user.id;
  const [f, setF] = useState({ email: '', displayName: '', initialPassword: '', employeeId: '' });
  const [selected, setSelected] = useState<string[]>(user.roles ?? ['employee']);
  const [status, setStatus] = useState(user.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const emps = useLoad(() => (isNew ? api.get(`/api/v1/employees${qs({ search: empSearch, pageSize: 20 })}`) : Promise.resolve(null)), [empSearch]);
  return (
    <Modal title={isNew ? 'Add user' : `Manage ${user.display_name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          if (isNew) await api.post('/api/v1/tenant/users', { ...f, employeeId: f.employeeId || undefined, roles: selected });
          else await api.patch(`/api/v1/tenant/users/${user.id}`, { roles: selected, status });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        {isNew && <>
          <Field label="Email"><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Display name"><input required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="Initial password" hint="Share securely; the user should change it after first sign-in"><input type="password" autoComplete="new-password" required value={f.initialPassword} onChange={(e) => setF({ ...f, initialPassword: e.target.value })} /></Field>
          <Field label="Link to employee record (optional)"><input placeholder="Search employees" aria-label="Search employees to link" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
            <select aria-label="Link to employee record" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">Not linked</option>{emps.data?.items.filter((x: any) => !x.user_id).map((x: any) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name} ({x.employee_code})</option>)}</select></Field>
        </>}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6 }}><legend>Roles</legend>
          <div className="grid grid-2" style={{ gap: 6 }}>{roles.filter((r: any) => r.grantable !== false || selected.includes(r.key)).map((r: any) => (
            <label key={r.key} className="row"><input type="checkbox" checked={selected.includes(r.key)} disabled={(self && r.key === 'tenant_admin') || r.grantable === false}
              onChange={(e) => setSelected(e.target.checked ? [...selected, r.key] : selected.filter((x) => x !== r.key))} />{r.name}</label>))}</div>
        </fieldset>
        {!isNew && !self && <Field label="Account status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="disabled">Disabled (signs out immediately)</option></select></Field>}
        {!isNew && user.locked && <button type="button" className="btn" onClick={async () => { await api.patch(`/api/v1/tenant/users/${user.id}`, { unlock: true }); onSaved(); onClose(); }}>Unlock account</button>}
        {!isNew && !self && user.mfa_enabled && <button type="button" className="btn" onClick={async () => { try { await api.patch(`/api/v1/tenant/users/${user.id}`, { resetMfa: true }); onSaved(); onClose(); } catch (x) { setError(errText(x)); } }}>Reset two-factor authentication (signs the user out)</button>}
        {roles.some((r: any) => r.grantable === false) && <div className="muted" style={{ fontSize: 12 }}>Roles with permissions you do not hold yourself can only be granted by an administrator.</div>}
        {!isNew && <div className="muted" style={{ fontSize: 12 }}>Changing roles signs the user out so new permissions apply immediately.</div>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!selected.length}>Save</button></div>
      </form>
    </Modal>
  );
}

function Audit() {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const url = `/api/v1/tenant/audit${qs({ category, page, pageSize: 50 })}`;
  const { data, loading, error } = useLoad(() => api.get(url), [url]);
  return (
    <div className="stack">
      <div className="row"><select aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>
        {['auth', 'configuration', 'data', 'security', 'access'].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>No audit entries.</Empty> : (
        <>
          <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
            {data.items.map((l: any) => <tr key={l.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td><td>{l.actor_name ?? (l.actor_type === 'device' ? 'Device' : 'System')}</td>
              <td><span className="badge">{l.category}</span> {l.action}</td><td className="mono">{l.setting_key ?? l.target_type ?? ''}</td>
              <td><details><summary className="muted">View</summary><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(l.change_metadata, null, 2)}</pre></details></td></tr>)}
          </tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Jobs() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/tenant/jobs'), []);
  const [busy, setBusy] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const sched = (s: any) => (s.kind === 'daily' ? `Daily at ${s.at}` : `Monthly on day ${s.day} at ${s.at}`);
  return (
    <div className="stack">
      <div className="alert info">Jobs run automatically in the background ({data.timezone}). Each run happens once per period even with several app instances; failures retry up to {data.maxAttempts} times. Everything they do is safe to repeat.</div>
      {data.items.map((j: any) => {
        const last = j.recentRuns[0];
        return (
          <div key={j.key} className="card stack">
            <div className="row">
              <div><h3 style={{ margin: 0 }}>{j.name}</h3><div className="muted" style={{ fontSize: 13 }}>{j.description}</div></div>
              <span className="spacer" />
              {j.active ? <span className="badge info">{sched(j.schedule)} · next {j.nextRun}</span> : <span className="badge">Inactive: module not enabled</span>}
              {last && <StatusBadge status={last.status} />}
              {j.canRun && j.active && <button className="btn sm" disabled={busy === j.key} onClick={async () => {
                setBusy(j.key);
                try { const r = await api.post(`/api/v1/tenant/jobs/${j.key}/run`); toast(r.status === 'succeeded' ? `${j.name} completed` : `${j.name} failed: ${r.error}`, r.status === 'succeeded' ? 'ok' : 'error'); reload(); }
                catch (e) { toast(errText(e), 'error'); } finally { setBusy(null); }
              }}>{busy === j.key ? 'Running…' : 'Run now'}</button>}
            </div>
            {j.recentRuns.length > 0 && (
              <details><summary className="muted">Recent runs ({j.recentRuns.length})</summary>
                <div className="table-wrap" style={{ marginTop: 8 }}><table className="t"><thead><tr><th>Started</th><th>Period</th><th>Trigger</th><th>Status</th><th>Attempts</th><th>Result</th></tr></thead><tbody>
                  {j.recentRuns.map((r: any) => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.started_at)}</td><td className="mono">{r.period_key.startsWith('manual:') ? '—' : r.period_key}</td>
                    <td>{r.trigger === 'manual' ? `Manual${r.triggered_by_name ? ` (${r.triggered_by_name})` : ''}` : 'Schedule'}</td><td><StatusBadge status={r.status} /></td><td>{r.attempts}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.error ? <span style={{ color: 'var(--danger)' }}>{r.error}</span> : r.result ? Object.entries(r.result).filter(([k]) => k !== 'durationMs').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : ''}</td></tr>)}
                </tbody></table></div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
