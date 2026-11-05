import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { Jobs } from './Jobs';
import { Organization } from './Organization';
import { Roles } from './Roles';
import { SettingsGroup } from './SettingsGroup';
import { Users } from './Users';

afterEach(() => vi.restoreAllMocks());

describe('users', () => {
  const USER = { id: 'u2', email: 'bo@x.test', display_name: 'Bo', status: 'active', roles: ['employee'], mfa_enabled: true, locked: false, invite_pending: false, salary_access_level: 1, effective_salary_level: 1, employee_code: 'E2', last_login_at: null };
  const ROLES = { system: [{ key: 'tenant_admin', name: 'Administrator', permissions: [], users: 1, grantable: true }, { key: 'employee', name: 'Employee', permissions: [], users: 2, grantable: true }, { key: 'payroll_admin', name: 'Payroll', permissions: [], users: 1, grantable: false }], custom: [{ key: 'custom_x', name: 'Front desk', permissions: [], users: 0, grantable: true }], permissions: [], canManage: true, maxPermissions: null };
  const api = (users: unknown[], extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if (init.method && init.method !== 'GET') return { ok: true };
    if (url.includes('/tenant/roles')) return ROLES;
    if (url.includes('/tenant/users')) return { items: users, page: 1, pageSize: 25, total: users.length };
    return { items: [] };
  };
  const manage = async (name = 'Bo') => { await userEvent.click(await screen.findByRole('button', { name: 'Manage' })); return screen.findByRole('dialog', { name: `Manage ${name}` }); };

  it('shows role names, badges, and refuses a form for someone holding a role this user may not grant', async () => {
    mockPageApi(['users.manage'], api([{ ...USER, invite_pending: true, locked: true }, { ...USER, id: 'u3', display_name: 'Cy', email: 'cy@x.test', mfa_enabled: false, roles: ['payroll_admin', 'unknown_role'], employee_code: null }, { ...USER, id: 'u4', display_name: 'Di', roles: [] }]));
    renderPage(<Users />);
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(within(table).getAllByText('2FA')).toHaveLength(2);
    expect(within(table).getByText('Invited')).toBeTruthy();
    expect(within(table).getByText('Locked')).toBeTruthy();
    expect(within(table).getByText('Payroll, unknown_role')).toBeTruthy();
    expect(within(table).getByText('Administrator only')).toBeTruthy();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });
  it('an empty list and a failed roles list both say so', async () => {
    mockPageApi(['users.manage'], (url) => (url.includes('/tenant/roles') ? problem(500, 'Roles are unavailable') : { items: [], page: 1, pageSize: 25, total: 0 }));
    renderPage(<Users />);
    expect(await screen.findByText('No users found.')).toBeTruthy();
    expect(await screen.findByText(/Roles are unavailable/)).toBeTruthy();
  });
  it('searching sends the text to the server', async () => {
    const f = mockPageApi(['users.manage'], api([USER]));
    renderPage(<Users />);
    await screen.findByRole('table', { name: 'Users' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'bo');
    await waitFor(() => expect(reads(f, '/tenant/users?search=bo')).not.toHaveLength(0));
  });
  it('adding someone posts the details and says the invitation went out', async () => {
    const f = mockPageApi(['users.manage'], api([], (url, init) => {
      if (init.method === 'POST') return { inviteSent: true };
      if (url.includes('/api/v1/employees')) return { items: [{ id: 'e7', first_name: 'Asha', last_name: 'Rao', employee_code: 'E-7' }, { id: 'e8', first_name: 'Taken', last_name: null, employee_code: 'E-8', user_id: 'u9' }], page: 1, pageSize: 20, total: 2 };
      return undefined;
    }));
    renderPage(<Users />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add user' });
    await userEvent.type(within(dlg).getByLabelText(/Email/), 'new@x.test');
    await userEvent.type(within(dlg).getByLabelText(/Display name/), 'New Person');
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Link to employee record/ }));
    await within(dlg).findByRole('option', { name: /Asha Rao/ });
    expect(within(dlg).queryByRole('option', { name: /Taken/ })).toBeNull();
    await userEvent.click(within(dlg).getByRole('option', { name: /Asha Rao/ }));
    expect(within(dlg).queryByRole('checkbox', { name: 'Payroll' })).toBeNull();
    expect(within(dlg).getByText(/Roles with permissions you do not hold/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Front desk' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/tenant/users')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/users')[0]!)).toEqual({ email: 'new@x.test', displayName: 'New Person', employeeId: 'e7', roles: ['employee', 'custom_x'] });
    expect(await screen.findByText('Invitation sent to new@x.test.')).toBeTruthy();
  });
  it('tells the operator how to issue a link when email is not set up', async () => {
    mockPageApi(['users.manage'], api([], (url, init) => (init.method === 'POST' ? { inviteSent: false } : undefined)));
    renderPage(<Users />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add user' });
    await userEvent.type(within(dlg).getByLabelText(/Email/), 'new@x.test');
    await userEvent.type(within(dlg).getByLabelText(/Display name/), 'New');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/no invitation went out.*hrms bootstrap --issue-link --admin-email new@x\.test/)).toBeTruthy();
  });
  it('removing the last role blocks saving and says why', async () => {
    const f = mockPageApi(['users.manage'], api([], (url, init) => (init.method === 'POST' ? { inviteSent: true } : undefined)));
    renderPage(<Users />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add user' });
    await userEvent.type(within(dlg).getByLabelText(/Email/), 'new@x.test');
    await userEvent.type(within(dlg).getByLabelText(/Display name/), 'New');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Employee' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Choose at least one role.');
    expect(writes(f, '/tenant/users')).toHaveLength(0);
  });
  it('a smaller installation offers the fixed roles and does not ask for the role list', async () => {
    const f = mockPageApi(['users.manage'], api([]), {}, 'e1', { mode: 'single_hr' });
    renderPage(<Users />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add user' });
    expect(within(dlg).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['HR', 'HR Executive', 'Employee']);
    expect(reads(f, '/tenant/roles')).toHaveLength(0);
  });
  it('managing someone saves roles and status with a patch', async () => {
    const f = mockPageApi(['users.manage'], api([USER]));
    renderPage(<Users />);
    const dlg = await manage();
    await userEvent.selectOptions(within(dlg).getByLabelText('Account status'), 'disabled');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/tenant/users/u2')).toHaveLength(1));
    expect((writes(f, '/tenant/users/u2')[0]![1] as RequestInit).method).toBe('PATCH');
    expect(bodyOf(writes(f, '/tenant/users/u2')[0]!)).toEqual({ roles: ['employee'], status: 'disabled' });
    expect(await screen.findByText('User saved')).toBeTruthy();
  });
  it('unlocks an account', async () => {
    const f = mockPageApi(['users.manage'], api([{ ...USER, locked: true }]));
    renderPage(<Users />);
    const dlg = await manage();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Unlock account' }));
    await waitFor(() => expect(writes(f, '/tenant/users/u2')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/users/u2')[0]!)).toEqual({ unlock: true });
  });
  it('resetting two-factor asks first, with the consequence', async () => {
    const f = mockPageApi(['users.manage'], api([USER]));
    renderPage(<Users />);
    const dlg = await manage();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Reset two-factor authentication' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reset two-factor authentication' });
    expect(within(confirm).getByText(/Their recovery codes stop working/)).toBeTruthy();
    expect(writes(f, '/tenant/users/u2')).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(writes(f, '/tenant/users/u2')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/users/u2')[0]!)).toEqual({ resetMfa: true });
  });
  it('sends a password reset link, and shows a failure as a message', async () => {
    let refuse = false;
    const f = mockPageApi(['users.manage'], api([USER], (url) => (url.endsWith('/password-reset') && refuse ? problem(503, 'Email is not set up') : undefined)));
    renderPage(<Users />);
    const dlg = await manage();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send password reset' }));
    expect(await screen.findByText('Password reset link sent to bo@x.test.')).toBeTruthy();
    expect(writes(f, '/tenant/users/u2/password-reset')).toHaveLength(1);
    refuse = true;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send password reset' }));
    expect(await screen.findByText('Email is not set up')).toBeTruthy();
  });
  it('someone still invited gets the invitation again instead of a reset', async () => {
    const f = mockPageApi(['users.manage'], api([{ ...USER, invite_pending: true }]));
    renderPage(<Users />);
    const dlg = await manage();
    expect(within(dlg).queryByRole('button', { name: 'Send password reset' })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send invitation again' }));
    expect(await screen.findByText('Invitation sent to bo@x.test.')).toBeTruthy();
    expect(writes(f, '/tenant/users/u2/invite')).toHaveLength(1);
  });
  it('your own account hides status, reset links and salary level, and you cannot drop administrator', async () => {
    mockPageApi(['users.manage'], api([{ ...USER, id: 'u1', roles: ['tenant_admin'] }]));
    renderPage(<Users />);
    const dlg = await manage();
    expect(within(dlg).queryByLabelText('Account status')).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Send password reset' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Reset two-factor authentication' })).toBeNull();
    expect(within(dlg).queryByText('Salary access level')).toBeNull();
    expect((within(dlg).getByRole('checkbox', { name: 'Administrator' }) as HTMLInputElement).disabled).toBe(true);
  });
  it('changes a salary level only below your own, after confirming', async () => {
    const f = mockPageApi(['users.manage'], api([USER], (url, init) => (init.method === 'PUT' ? { effectiveLevel: 2 } : undefined)), {}, 'e1', { salaryLevel: 3 });
    renderPage(<Users />);
    const dlg = await manage();
    const input = within(dlg).getByLabelText(/Stored level/);
    const change = within(dlg).getByRole('button', { name: 'Change level' }) as HTMLButtonElement;
    expect(change.disabled).toBe(true);
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    expect(change.disabled).toBe(true);
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    expect(change.disabled).toBe(false);
    await userEvent.click(change);
    const confirm = await screen.findByRole('dialog', { name: 'Change salary access level' });
    expect(within(confirm).getByText(/Bo moves to stored level 2 and is signed out/)).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change level' }));
    await waitFor(() => expect(writes(f, '/tenant/users/u2/salary-level')).toHaveLength(1));
    expect(bodyOf(writes(f, '/salary-level')[0]!)).toEqual({ level: 2 });
    expect(await screen.findByText('Salary level changed. Effective level is now 2.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage Bo' })).toBeNull());
  });
  it('someone at or above your level can only be changed by someone higher', async () => {
    mockPageApi(['users.manage'], api([{ ...USER, effective_salary_level: 3 }]), {}, 'e1', { salaryLevel: 3 });
    renderPage(<Users />);
    const dlg = await manage();
    expect(within(dlg).getByText(/only someone higher can change it/)).toBeTruthy();
    expect(within(dlg).queryByLabelText(/Stored level/)).toBeNull();
  });
});

describe('roles', () => {
  const PERMS = [{ key: 'assets.manage', label: 'Manage assets', privileged: false }, { key: 'payroll.approve', label: 'Approve payroll', privileged: true }, { key: 'zzz.other', label: 'Something new', privileged: false }];
  const CUSTOM = { key: 'desk', name: 'Front desk', description: 'For reception', permissions: ['assets.manage'], users: 0, grantable: true, mfaRequired: true, updated_at: '2026-10-01T04:30:00Z', updated_by_name: 'Kavita' };
  const SYSTEM = [{ key: 'tenant_admin', name: 'Administrator', permissions: ['assets.manage'], users: 1, grantable: true }, { key: 'hr', name: 'HR', permissions: ['assets.manage', 'payroll.approve'], users: 2, grantable: true }];
  const data = (over = {}) => ({ system: SYSTEM, custom: [CUSTOM], permissions: PERMS, canManage: true, maxPermissions: null, ...over });
  const api = (over = {}, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    return init.method && init.method !== 'GET' ? { ok: true } : data(over);
  };
  it('expands a role into its permissions by area and collapses again', async () => {
    mockPageApi(['users.manage'], api());
    renderPage(<Roles />);
    await screen.findByText('Front desk');
    expect(screen.getByText('For reception')).toBeTruthy();
    expect(screen.getByText('Kavita')).toBeTruthy();
    const one = within(screen.getByRole('table', { name: "Your organization's roles" })).getByRole('button', { name: '1 permission' });
    await userEvent.click(one);
    expect(one.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Assets:')).toBeTruthy();
    expect(screen.getByText('Manage assets')).toBeTruthy();
    await userEvent.click(one);
    expect(screen.queryByText('Assets:')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '2 permissions' }));
    expect(screen.getByText('Payroll:')).toBeTruthy();
  });
  it('without manage rights there is nothing to change, and an empty list says where to start', async () => {
    mockPageApi(['users.read'], api({ canManage: false, custom: [] }));
    renderPage(<Roles />);
    expect(await screen.findByText('No roles of your own yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });
  it('a role beyond what you may grant is left to an administrator, and the administrator role cannot be copied', async () => {
    mockPageApi(['users.manage'], api({ custom: [{ ...CUSTOM, grantable: false }] }));
    renderPage(<Roles />);
    expect(await screen.findByText('Administrator only')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
  });
  it('a role with holders cannot be deleted; one without asks and then deletes', async () => {
    const f = mockPageApi(['users.manage'], api({ custom: [CUSTOM, { ...CUSTOM, key: 'held one', name: 'Held', users: 3 }] }));
    renderPage(<Roles />);
    await screen.findByText('Held');
    const del = screen.getAllByRole('button', { name: 'Delete' }) as HTMLButtonElement[];
    expect(del[1]!.disabled).toBe(true);
    expect(del[1]!.title).toBe('Remove it from everyone first');
    await userEvent.click(del[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Delete role "Front desk"' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(writes(f, '/tenant/roles/desk')).toHaveLength(1));
    expect(await screen.findByText('Role deleted')).toBeTruthy();
  });
  it('creating needs a permission, warns about two-factor, and posts the body', async () => {
    const f = mockPageApi(['users.manage'], api());
    renderPage(<Roles />);
    await userEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dlg = await screen.findByRole('dialog', { name: 'New role' });
    await userEvent.type(within(dlg).getByLabelText(/Role name/), 'Night shift');
    await userEvent.type(within(dlg).getByLabelText(/What it is for/), 'Supervisors');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create role' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Choose at least one permission.');
    expect(writes(f, '/tenant/roles')).toHaveLength(0);
    await userEvent.selectOptions(within(dlg).getByLabelText(/Start from/), 'hr');
    expect(within(dlg).getByText('Permissions (2)')).toBeTruthy();
    expect(within(dlg).getByText(/must use two-factor authentication: it includes approve payroll/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Approve payroll' }));
    expect(within(dlg).queryByText(/must use two-factor authentication/)).toBeNull();
    expect(within(dlg).getByText('Permissions (1)')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(writes(f, '/tenant/roles')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/roles')[0]!)).toEqual({ name: 'Night shift', description: 'Supervisors', permissions: ['assets.manage'] });
    expect(await screen.findByText('Role "Night shift" created. Assign it under Users & permissions')).toBeTruthy();
  });
  it('filtering groups permissions and says when nothing matches', async () => {
    mockPageApi(['users.manage'], api());
    renderPage(<Roles />);
    await userEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dlg = await screen.findByRole('dialog', { name: 'New role' });
    expect(within(dlg).getByRole('group', { name: 'Other' })).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText('Filter permissions'), 'payroll');
    expect(within(dlg).getByRole('group', { name: 'Payroll' })).toBeTruthy();
    expect(within(dlg).queryByRole('group', { name: 'Assets' })).toBeNull();
    await userEvent.type(within(dlg).getByLabelText('Filter permissions'), 'nope');
    expect(within(dlg).getByText('No permission matches “payrollnope”.')).toBeTruthy();
  });
  it('copying a built-in keeps only what you may hold, and marks the rest off', async () => {
    const f = mockPageApi(['users.manage'], api({ maxPermissions: ['assets.manage'] }));
    renderPage(<Roles />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    const dlg = await screen.findByRole('dialog', { name: 'New role' });
    expect((within(dlg).getByLabelText(/Role name/) as HTMLInputElement).value).toBe('HR (custom)');
    expect(within(dlg).getByText(/You can include only permissions you hold yourself/)).toBeTruthy();
    expect((within(dlg).getByRole('checkbox', { name: 'Approve payroll' }) as HTMLInputElement).disabled).toBe(true);
    await userEvent.selectOptions(within(dlg).getByLabelText(/Start from/), 'hr');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(writes(f, '/tenant/roles')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/roles')[0]!)).toMatchObject({ name: 'HR (custom)', description: null, permissions: ['assets.manage'] });
  });
  it('editing warns about sign-outs, patches the encoded key and reports who was signed out', async () => {
    const held = { ...CUSTOM, key: 'night shift', users: 1 };
    const f = mockPageApi(['users.manage'], api({ custom: [held] }, (url, init) => (init.method === 'PATCH' ? { holdersSignedOut: 1 } : undefined)));
    renderPage(<Roles />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit role: Front desk' });
    expect(within(dlg).getByText(/signs out the 1 person with this role/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(writes(f, '/tenant/roles/night%20shift')).toHaveLength(1));
    expect(await screen.findByText('Role saved. 1 person was signed out so it applies now')).toBeTruthy();
  });
  it('a plain save says only that, several holders read in the plural, and a refusal stays open', async () => {
    let answer: unknown = { holdersSignedOut: 0 };
    mockPageApi(['users.manage'], api({ custom: [{ ...CUSTOM, users: 4 }] }, (url, init) => (init.method === 'PATCH' ? answer : undefined)));
    renderPage(<Roles />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    let dlg = await screen.findByRole('dialog', { name: 'Edit role: Front desk' });
    expect(within(dlg).getByText(/signs out the 4 people with this role/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('Role saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    answer = { holdersSignedOut: 2 };
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    dlg = await screen.findByRole('dialog', { name: 'Edit role: Front desk' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('Role saved. 2 people were signed out so it applies now')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    answer = problem(409, 'Name already taken');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    dlg = await screen.findByRole('dialog', { name: 'Edit role: Front desk' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save role' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Name already taken');
  });
});

describe('settings by group', () => {
  const S = { key: 'x.grace', group: 'attendance', label: 'Grace minutes', description: 'Minutes allowed', control: 'number', options: null, scopes: ['tenant'], feature: null, editable: true, effective: 10, source: 'default', defaultValue: 10, tenantValue: null, branchValue: null, version: 1 };
  const ORG = { legalEntities: [], branches: [{ id: 'b1', name: 'Pune' }], departments: [] };
  const api = (items: unknown[], extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if (init.method && init.method !== 'GET') return { ok: true };
    return url.endsWith('/org') ? ORG : { items };
  };
  const show = () => renderPage(<SettingsGroup group="attendance" />);

  it('a number can be emptied to null and Cancel puts the value back', async () => {
    const f = mockPageApi(['settings.manage'], api([S]));
    show();
    const input = await screen.findByRole('spinbutton', { name: 'Grace minutes' }) as HTMLInputElement;
    await userEvent.clear(input);
    expect(input.value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input.value).toBe('10');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/tenant/settings/x.grace')).toHaveLength(1));
    expect(bodyOf(writes(f, '/tenant/settings/x.grace')[0]!)).toEqual({ value: null, scope: 'tenant', expectedVersion: 1 });
    expect(await screen.findByText('Grace minutes saved')).toBeTruthy();
  });
  it('edits each kind of control', async () => {
    const f = mockPageApi(['settings.manage'], api([
      { ...S, key: 'x.on', label: 'Allow web', control: 'boolean', effective: false, defaultValue: false },
      { ...S, key: 'x.sel', label: 'Rounding', control: 'select', options: [{ value: 'up', label: 'Round up' }, { value: 'down', label: 'Round down' }], effective: 'up', defaultValue: 'up' },
      { ...S, key: 'x.tz', label: 'Zone', control: 'timezone', effective: 'Asia/Tokyo', defaultValue: 'UTC' },
      { ...S, key: 'x.days', label: 'Week off', control: 'weekdays', effective: [0], defaultValue: [0] },
      { ...S, key: 'x.text', label: 'Footer', control: 'text', effective: null, defaultValue: null },
    ]));
    show();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Allow web: Disabled' }));
    expect(screen.getByRole('checkbox', { name: 'Allow web: Enabled' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rounding' }), 'down');
    const zone = screen.getByRole('combobox', { name: 'Zone' }) as HTMLSelectElement;
    expect([...zone.options].map((o) => o.value)).toContain('Asia/Tokyo');
    await userEvent.selectOptions(zone, 'UTC');
    const week = screen.getByRole('group', { name: 'Week off' });
    await userEvent.click(within(week).getByRole('button', { name: 'Mon' }));
    await userEvent.click(within(week).getByRole('button', { name: 'Sun' }));
    expect(within(week).getByRole('button', { name: 'Mon' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(week).getByRole('button', { name: 'Sun' }).getAttribute('aria-pressed')).toBe('false');
    await userEvent.type(screen.getByRole('textbox', { name: 'Footer' }), 'Hi');
    const saves = screen.getAllByRole('button', { name: 'Save' });
    for (const b of saves) await userEvent.click(b);
    await waitFor(() => expect(writes(f, '/tenant/settings/x.text')).toHaveLength(1));
    expect(bodyOf(writes(f, '/x.on')[0]!)['value']).toBe(true);
    expect(bodyOf(writes(f, '/x.sel')[0]!)['value']).toBe('down');
    expect(bodyOf(writes(f, '/x.tz')[0]!)['value']).toBe('UTC');
    expect(bodyOf(writes(f, '/x.days')[0]!)['value']).toEqual([1]);
    expect(bodyOf(writes(f, '/x.text')[0]!)['value']).toBe('Hi');
  });
  it('read-only values read as words, with where they came from', async () => {
    mockPageApi(['settings.read'], api([
      { ...S, key: 'a', label: 'A', control: 'weekdays', editable: false, effective: [0, 6], source: 'tenant', defaultValue: [] },
      { ...S, key: 'b', label: 'B', control: 'boolean', editable: false, effective: true, source: 'platform', defaultValue: false },
      { ...S, key: 'c', label: 'C', control: 'select', options: [{ value: '', label: 'Nobody' }, { value: 'x', label: 'Ex' }], editable: false, effective: 'x', source: 'deployment_ceiling', defaultValue: null },
      { ...S, key: 'd', label: 'D', control: 'text', editable: false, effective: null, source: 'something_new', defaultValue: 'y' },
    ]));
    show();
    expect(await screen.findByText(/Sun, Sat/)).toBeTruthy();
    expect(screen.getByText('Default: None')).toBeTruthy();
    expect(screen.getByText('Organization setting')).toBeTruthy();
    expect(screen.getByText('Installation default')).toBeTruthy();
    expect(screen.getByText('Default: Disabled')).toBeTruthy();
    expect(screen.getByText('Capped by installation limit')).toBeTruthy();
    expect(screen.getByText('Default: Nobody')).toBeTruthy();
    expect(screen.getByText(/^Ex/)).toBeTruthy();
    expect(screen.getByText('something_new')).toBeTruthy();
    expect(screen.getByText(/^Not set/)).toBeTruthy();
    expect(screen.getAllByText('(read only)')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
  it('searches by label and description, and says when nothing matches or the group is empty', async () => {
    mockPageApi(['settings.read'], api([S, { ...S, key: 'y', group: 'leave', label: 'Elsewhere' }]));
    show();
    await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    expect(screen.queryByText('Elsewhere')).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    await userEvent.type(search, 'minutes');
    expect(screen.getByRole('spinbutton', { name: 'Grace minutes' })).toBeTruthy();
    await userEvent.type(search, 'zzz');
    expect(await screen.findByText('No settings match.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(await screen.findByRole('spinbutton', { name: 'Grace minutes' })).toBeTruthy();
  });
  it('a group with nothing explains why', async () => {
    mockPageApi(['settings.read'], api([]));
    show();
    expect(await screen.findByText('Nothing to set here.')).toBeTruthy();
    expect(screen.getByText('Settings of modules that are off do not appear.')).toBeTruthy();
  });
  it('a branch override sends the branch and no version; organization-only settings say so', async () => {
    const both = { ...S, scopes: ['tenant', 'branch'], tenantValue: 7, effective: 7, source: 'tenant' };
    const orgOnly = { ...S, key: 'x.org', label: 'Org only', effective: 3 };
    const f = mockPageApi(['settings.manage'], api([both, orgOnly]));
    show();
    await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Editing level' }), 'b1');
    expect(await screen.findByText('Set at organization level only: 3')).toBeTruthy();
    expect(screen.getByText('Organization: 7')).toBeTruthy();
    expect(reads(f, '/tenant/settings?branchId=b1').length).toBeGreaterThan(0);
    const input = screen.getByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/x.grace')).toHaveLength(1));
    expect(bodyOf(writes(f, '/x.grace')[0]!)).toEqual({ value: 9, scope: 'branch', branchId: 'b1' });
  });
  it('resetting an own value deletes it at that level; a refusal shows the reason', async () => {
    let refuse = false;
    const f = mockPageApi(['settings.manage'], api([{ ...S, tenantValue: 10, source: 'tenant' }], (url, init) => (init.method === 'DELETE' && refuse ? problem(409, 'Locked by the installation') : undefined)));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Reset to inherited' }));
    await waitFor(() => expect(writes(f, '/tenant/settings/x.grace?scope=tenant')).toHaveLength(1));
    expect(await screen.findByText('Grace minutes now inherits')).toBeTruthy();
    refuse = true;
    await userEvent.click(screen.getByRole('button', { name: 'Reset to inherited' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Locked by the installation');
  });
  it('undo removes a value that was only inherited, and a failed undo says why', async () => {
    let refuse = false;
    const f = mockPageApi(['settings.manage'], api([S], (url, init) => (init.method === 'DELETE' && refuse ? problem(409, 'Too late to undo') : undefined)));
    show();
    const input = await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/tenant/settings/x.grace?scope=tenant')).toHaveLength(1));
    expect(await screen.findByText('Grace minutes restored')).toBeTruthy();
    const again = await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.clear(again);
    await userEvent.type(again, '13');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    refuse = true;
    await userEvent.click((await screen.findAllByRole('button', { name: 'Undo' })).at(-1)!);
    expect(await screen.findByText('Too late to undo')).toBeTruthy();
  });
});

describe('jobs', () => {
  const RUN = { id: 'r1', period_key: '2026-10', trigger: 'schedule', status: 'succeeded', attempts: 1, started_at: '2026-10-01T04:30:00Z', result: { credited: 12, durationMs: 40, detail: { a: 1 } }, error: null, triggered_by_name: null };
  const JOB = { key: 'leave.accrue', name: 'Leave accrual', description: 'Credits leave', schedule: { kind: 'monthly', at: '01:00', day: 1 }, feature: null, active: true, nextRun: '2026-11-06 01:00', canRun: true, recentRuns: [RUN] };
  const data = (items: unknown[]) => ({ timezone: 'Asia/Kolkata', maxAttempts: 3, items });
  it('describes schedule, runs and results, leaving out timing', async () => {
    mockPageApi(['settings.read'], () => data([JOB, { ...JOB, key: 'b', name: 'Inactive job', active: false, canRun: true, recentRuns: [{ ...RUN, id: 'r2', period_key: 'manual:1', trigger: 'manual', triggered_by_name: 'Kavita', status: 'failed', error: 'SMTP down', result: null }, { ...RUN, id: 'r3', period_key: 'manual:2', trigger: 'manual', result: {} }] }]));
    renderPage(<Jobs />);
    expect(await screen.findByText(/Monthly on day 1 at 01:00 · next 2026-11-06 01:00/)).toBeTruthy();
    expect(screen.getByText('Inactive: not switched on or not set up')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Run now' })).toHaveLength(1);
    const first = screen.getByRole('table', { name: 'Recent runs of Leave accrual' });
    expect(within(first).getByText('credited: 12 · detail: {"a":1}')).toBeTruthy();
    expect(within(first).getByText('Schedule')).toBeTruthy();
    expect(within(first).getByText('2026-10')).toBeTruthy();
    const second = screen.getByRole('table', { name: 'Recent runs of Inactive job' });
    expect(within(second).getByText('Manual (Kavita)')).toBeTruthy();
    expect(within(second).getByText('Manual')).toBeTruthy();
    expect(within(second).getByText('SMTP down')).toBeTruthy();
    expect(within(second).getAllByText('—').length).toBeGreaterThan(1);
  });
  it('with no jobs says so', async () => {
    mockPageApi(['settings.read'], () => data([]));
    renderPage(<Jobs />);
    expect(await screen.findByText('No scheduled jobs.')).toBeTruthy();
  });
  it('a refused run shows the server reason, not a set-up message', async () => {
    mockPageApi(['settings.read'], (url, init) => (init.method === 'POST' ? problem(409, 'Already running') : data([JOB])));
    renderPage(<Jobs />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('Already running')).toBeTruthy();
  });
  it('not set up with no reason gives the general explanation', async () => {
    mockPageApi(['settings.read'], (url, init) => (init.method === 'POST' ? problem(409, 'Not set up', { code: 'feature_not_configured' }) : data([JOB])));
    renderPage(<Jobs />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/switched on but not set up yet/)).toBeTruthy();
  });
});

describe('organization', () => {
  const ORG = {
    legalEntities: [{ id: 'l1', name: 'Acme Pvt Ltd', gstin: '27AAA', cin: 'U1', state_code: '27', status: 'active' }, { id: 'l2', name: 'Acme Two', gstin: null, status: 'inactive' }],
    branches: [{ id: 'b1', code: 'HQ', name: 'Head office', state: 'MH', city: 'Pune', status: 'active', legal_entity_id: 'l1' }, { id: 'b2', code: null, name: 'Orphan', state: null, city: null, status: 'active', legal_entity_id: 'gone' }],
    departments: [{ id: 'd1', code: 'ENG', name: 'Engineering', status: 'active', parent_id: null }, { id: 'd2', code: 'QA', name: 'Quality', status: 'active', parent_id: 'd1' }],
    grades: [{ id: 'g1', code: 'G1', name: 'Grade one', status: 'active' }],
    designations: [{ id: 'p1', code: 'MGR', name: 'Manager', status: 'active' }],
  };
  const api = (url: string, init: RequestInit) => (init.method && init.method !== 'GET' ? { ok: true } : ORG);
  const region = (name: string) => screen.findByRole('region', { name });
  const open = async (section: string, button: 'Add' | 'Edit', title: string, index = 0) => {
    await userEvent.click(within(await region(section)).getAllByRole('button', { name: button })[index]!);
    return screen.findByRole('dialog', { name: title });
  };
  it('lists each kind with dashes for gaps and the legal entity by name', async () => {
    mockPageApi(['org.read'], api);
    renderPage(<Organization />);
    const branches = within(await region('Branches'));
    expect(branches.getByText('Acme Pvt Ltd')).toBeTruthy();
    expect(branches.getAllByText('—').length).toBe(4);
    expect(within(screen.getByRole('region', { name: 'Legal entities' })).getByText('27AAA')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Grades' })).getByText('G1')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Designations' })).getByText('MGR')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Departments' })).getByText('ENG')).toBeTruthy();
  });
  it('an installation without grades shows an empty section', async () => {
    const { grades: _g, designations: _d, ...rest } = ORG;
    mockPageApi(['org.read'], () => rest);
    renderPage(<Organization />);
    expect(within(await region('Grades')).getByText('None yet.')).toBeTruthy();
  });
  it('adds a legal entity, sending null for what was left empty', async () => {
    const f = mockPageApi(['org.manage'], api);
    renderPage(<Organization />);
    const dlg = await open('Legal entities', 'Add', 'Add legal entity');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'New Co');
    await userEvent.type(within(dlg).getByLabelText(/CIN/), 'U9');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/org/legal-entities')).toHaveLength(1));
    expect(bodyOf(writes(f, '/org/legal-entities')[0]!)).toEqual({ name: 'New Co', gstin: null, cin: 'U9', stateCode: null, status: 'active' });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
  it('edits a branch with PUT to its own URL, keeping its values', async () => {
    const f = mockPageApi(['org.manage'], api);
    renderPage(<Organization />);
    const dlg = await open('Branches', 'Edit', 'Edit branch');
    expect((within(dlg).getByLabelText(/^State/) as HTMLInputElement).value).toBe('MH');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Legal entity/), 'l2');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Status/), 'inactive');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/org/branches/b1')).toHaveLength(1));
    expect((writes(f, '/org/branches/b1')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/org/branches/b1')[0]!)).toEqual({ legalEntityId: 'l2', code: 'HQ', name: 'Head office', state: 'MH', city: 'Pune', status: 'inactive' });
  });
  it('a new branch starts on the first legal entity', async () => {
    mockPageApi(['org.manage'], api);
    renderPage(<Organization />);
    const dlg = await open('Branches', 'Add', 'Add branch');
    expect((within(dlg).getByLabelText(/Legal entity/) as HTMLSelectElement).value).toBe('l1');
  });
  it('a department cannot be its own parent', async () => {
    const f = mockPageApi(['org.manage'], api);
    renderPage(<Organization />);
    const dlg = await open('Departments', 'Edit', 'Edit department', 1);
    const parent = within(dlg).getByLabelText(/Parent department/) as HTMLSelectElement;
    expect([...parent.options].map((o) => o.text)).toEqual(['None', 'Engineering']);
    expect(parent.value).toBe('d1');
    await userEvent.selectOptions(parent, '');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/org/departments/d2')).toHaveLength(1));
    expect(bodyOf(writes(f, '/org/departments/d2')[0]!)).toMatchObject({ code: 'QA', name: 'Quality', parentId: null });
  });
  it.each([['Grades', 'grade', 'grades'], ['Designations', 'designation', 'designations']])('%s take a code and a name', async (section, noun, path) => {
    const f = mockPageApi(['org.manage'], api);
    renderPage(<Organization />);
    const dlg = await open(section, 'Add', `Add ${noun}`);
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'X9');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Ninth');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, `/org/${path}`)).toHaveLength(1));
    expect(bodyOf(writes(f, `/org/${path}`)[0]!)).toEqual({ code: 'X9', name: 'Ninth', status: 'active' });
  });
  it('a refused save keeps the form and the field error', async () => {
    mockPageApi(['org.manage'], (url, init) => (init.method === 'POST' ? problem(422, 'Check the form', { errors: [{ field: 'code', message: 'Code is taken' }] }) : ORG));
    renderPage(<Organization />);
    const dlg = await open('Grades', 'Add', 'Add grade');
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'G1');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Dup');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Code is taken')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Dup');
  });
});
