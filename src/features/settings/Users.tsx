import { useState } from 'react';
import { UsersRound } from 'lucide-react';
import { api, errorMessage, qs, type Paged } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { useDebouncedValue } from '../../components/hooks';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Picker, type PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { toPickerItem, type EmployeeHit } from '../employees/searchEmployees';
import type { RolesData } from './Roles';

const USERS_URL = '/api/v1/tenant/users';

interface UserRow { id: string; email: string; display_name: string; status: string; roles: string[]; mfa_enabled: boolean; locked: boolean; invite_pending: boolean; salary_access_level: number; effective_salary_level: number; employee_code?: string | null; last_login_at: string | null }
type RoleChoice = RolesData['system'][number];

/** `/tenant/roles` answers 404 in the smaller modes, where the choice is fixed. Owner cannot be granted here. */
const SMALL_MODE_ROLES: Record<'single' | 'single_hr', readonly Pick<RoleChoice, 'key' | 'name'>[]> = {
  single: [{ key: 'employee', name: 'Employee' }],
  single_hr: [{ key: 'hr_admin', name: 'HR' }, { key: 'hr_executive', name: 'HR Executive' }, { key: 'employee', name: 'Employee' }],
};

const searchUnlinked = async (text: string): Promise<PickerItem[]> => {
  const r = await api.get<{ items: (EmployeeHit & { user_id?: string | null })[] }>(`/api/v1/employees${qs({ search: text || undefined, pageSize: 20 })}`);
  return r.items.filter((e) => !e.user_id).map(toPickerItem);
};

export function Users() {
  const { me, config } = useAuth();
  const mode = config?.mode ?? 'multi';
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const roles = useApiQuery<RolesData>(mode === 'multi' ? '/api/v1/tenant/roles' : null);
  const query = useApiQuery<Paged<UserRow>>(`${USERS_URL}${qs({ search: debounced, page })}`, { placeholderData: (p) => p });
  const [edit, setEdit] = useState<UserRow | 'new' | null>(null);
  const allRoles: RoleChoice[] = mode === 'multi' ? [...(roles.data?.system ?? []), ...(roles.data?.custom ?? [])] : (SMALL_MODE_ROLES[mode] as RoleChoice[]);
  const roleName = (key: string) => allRoles.find((r) => r.key === key)?.name ?? key;
  // The server refuses changes to an account holding roles this user may not grant; say so instead of offering a form that fails.
  const manageable = (u: UserRow) => u.id === me?.user.id || u.roles.every((k) => allRoles.find((r) => r.key === k)?.grantable !== false);
  const columns: Column<UserRow>[] = [
    { key: 'user', header: 'User', card: 'title', cell: (u) => <>{u.display_name}<div className="table__cell-sub settings-wrap">{u.email}</div>{u.mfa_enabled && <Badge tone="ok">2FA</Badge>}</> },
    { key: 'status', header: 'Status', card: 'status', cell: (u) => <span className="cluster"><StatusBadge status={u.status} />{u.invite_pending && <Badge tone="info">Invited</Badge>}{u.locked && <Badge tone="warn">Locked</Badge>}</span> },
    { key: 'roles', header: 'Roles', cell: (u) => u.roles.map(roleName).join(', ') || '—' },
    { key: 'employee', header: 'Employee', cell: (u) => <span className="mono">{u.employee_code ?? '—'}</span> },
    { key: 'level', header: 'Salary level', cell: (u) => <span className="tnum">{u.effective_salary_level}</span> },
    { key: 'login', header: 'Last sign-in', cell: (u) => fmtDateTime(u.last_login_at) },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (u) => <div className="table__actions">{manageable(u) ? <Button size="sm" onClick={() => setEdit(u)}>Manage</Button> : <span className="text-xs text-2">Administrator only</span>}</div> },
  ];
  return (
    <div className="stack-3">
      <FilterBar search={{ label: 'Search users', placeholder: 'Search users', value: search, onChange: (v) => { setSearch(v); setPage(1); } }} actions={<Button variant="primary" onClick={() => setEdit('new')}>Add user</Button>} />
      {roles.isError && <ErrorState compact error={roles.error} onRetry={() => void roles.refetch()} />}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<UsersRound />} title="No users found." />}>
        {(d) => <Table label="Users" columns={columns} rows={d.items} rowKey={(u) => u.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {edit && <UserForm user={edit === 'new' ? null : edit} self={edit !== 'new' && edit.id === me?.user.id} roles={allRoles} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserForm({ user, self, roles, onClose }: { user: UserRow | null; self: boolean; roles: readonly RoleChoice[]; onClose: () => void }) {
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [f, setF] = useState({ email: '', displayName: '' });
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [selected, setSelected] = useState<string[]>(user?.roles ?? ['employee']);
  const [status, setStatus] = useState(user?.status ?? 'active');
  const done = async () => { toast('User saved'); await invalidateApi(USERS_URL); onClose(); };
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const sendLink = async (kind: 'invite' | 'password-reset') => {
    setLinkBusy(kind);
    try {
      await api.post(`${USERS_URL}/${user!.id}/${kind}`);
      toast(kind === 'invite' ? `Invitation sent to ${user!.email}.` : `Password reset link sent to ${user!.email}.`);
    } catch (x) { toast(errorMessage(x), 'error'); } finally { setLinkBusy(null); }
  };
  const form = useSubmit(async () => {
    if (user) await api.patch(`${USERS_URL}/${user.id}`, { roles: selected, status });
    else {
      const r = await api.post<{ inviteSent: boolean }>(USERS_URL, { ...f, employeeId: employee?.id, roles: selected });
      toast(r.inviteSent ? `Invitation sent to ${f.email}.` : `User added, but no invitation went out because email is not set up. An operator can issue a link with: hrms bootstrap --issue-link --admin-email ${f.email}`);
      await invalidateApi(USERS_URL);
      onClose();
      return;
    }
    await done();
  }, { validate: (): Record<string, string> => (selected.length ? {} : { roles: 'Choose at least one role.' }) });
  const unlock = useSubmit(async () => {
    await api.patch(`${USERS_URL}/${user!.id}`, { unlock: true });
    await done();
  });
  return (
    <Modal title={user ? `Manage ${user.display_name}` : 'Add user'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        {!user && (
          <>
            <Input label="Email" type="email" required autoComplete="off" value={f.email} error={form.errors['email']} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Input label="Display name" required value={f.displayName} error={form.errors['displayName']} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
            <p className="text-sm text-2">They get an email with a link to choose their own password. It works once, for 72 hours.</p>
            <Picker label="Link to employee record (optional)" placeholder="Search name or code" queryKey="employees:unlinked" search={searchUnlinked} value={employee} error={form.errors['employeeId']} onChange={setEmployee} />
          </>
        )}
        <fieldset className="table-toolbar__group">
          <legend>Roles</legend>
          <div className="columns-form">
            {roles.filter((r) => r.grantable !== false || selected.includes(r.key)).map((r) => <Checkbox key={r.key} label={r.name} checked={selected.includes(r.key)} disabled={(self && r.key === 'tenant_admin') || r.grantable === false} onChange={(e) => setSelected(e.target.checked ? [...selected, r.key] : selected.filter((x) => x !== r.key))} />)}
          </div>
          {form.errors['roles'] && <span role="alert" className="field__error">{form.errors['roles']}</span>}
        </fieldset>
        {user && !self && <Select label="Account status" value={status} options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (signs out immediately)' }]} onChange={(e) => setStatus(e.target.value)} />}
        {user && (
          <div className="cluster">
            {user.locked && <Button loading={unlock.busy} onClick={() => void unlock.submit()}>Unlock account</Button>}
            {!self && user.mfa_enabled && <Button onClick={() => setResetting(true)}>Reset two-factor authentication</Button>}
            {!self && user.status === 'active' && (user.invite_pending
              ? <Button loading={linkBusy === 'invite'} onClick={() => void sendLink('invite')}>Send invitation again</Button>
              : <Button loading={linkBusy === 'password-reset'} onClick={() => void sendLink('password-reset')}>Send password reset</Button>)}
          </div>
        )}
        {user && !self && <SalaryLevel user={user} onSaved={onClose} />}
        {roles.some((r) => r.grantable === false) && <p className="text-xs text-2">Roles with permissions you do not hold yourself can only be granted by an administrator.</p>}
        {user && <p className="text-xs text-2">Changing roles signs the user out so new permissions apply immediately.</p>}
        <FormActions error={form.error ?? unlock.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
      {resetting && user && (
        <ConfirmDialog
          title="Reset two-factor authentication"
          confirmLabel="Reset"
          danger
          message={`${user.display_name ?? user.email} will have to set up two-factor authentication again at next sign-in. Their recovery codes stop working.`}
          onClose={() => setResetting(false)}
          onConfirm={async () => { await api.patch(`${USERS_URL}/${user.id}`, { resetMfa: true }); await done(); }}
        />
      )}
    </Modal>
  );
}

/** Who this person's L4 access reaches. Capped below the editor's own level, by the server as well as here. */
function SalaryLevel({ user, onSaved }: { user: UserRow; onSaved: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const mine = me?.salaryLevel ?? 0;
  const [level, setLevel] = useState(String(user.salary_access_level));
  const [confirming, setConfirming] = useState(false);
  const editable = user.effective_salary_level < mine;
  const valid = /^\d+$/.test(level) && Number(level) < mine && Number(level) !== user.salary_access_level;
  return (
    <fieldset className="table-toolbar__group stack-2">
      <legend>Salary access level</legend>
      <p className="text-sm text-2">Effective level {user.effective_salary_level}, stored {user.salary_access_level}. Roles can raise or cap it. They see pay data only of people below this level. Your level is {mine}.</p>
      {editable
        ? (
          <div className="cluster">
            <Input label="Stored level" type="number" min={0} max={mine - 1} value={level} hint={`0 to ${mine - 1}. They will be signed out.`} onChange={(e) => setLevel(e.target.value)} />
            <Button disabled={!valid} onClick={() => setConfirming(true)}>Change level</Button>
          </div>
        )
        : <p className="text-sm text-2">This person is at or above your level, so only someone higher can change it.</p>}
      {confirming && (
        <ConfirmDialog
          title="Change salary access level"
          confirmLabel="Change level"
          message={`${user.display_name} moves to stored level ${level} and is signed out. This is recorded in the audit history.`}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const r = await api.put<{ effectiveLevel: number }>(`${USERS_URL}/${user.id}/salary-level`, { level: Number(level) });
            toast(`Salary level changed. Effective level is now ${r.effectiveLevel}.`);
            await invalidateApi(USERS_URL);
            onSaved();
          }}
        />
      )}
    </fieldset>
  );
}
