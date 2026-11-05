import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsCenter } from '../../pages/Settings';
import { mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

afterEach(() => vi.restoreAllMocks());

const show = (path: string) => renderPage(<Routes><Route path="/settings/*" element={<SettingsCenter />} /></Routes>, path);
const ORG = { legalEntities: [{ id: 'l1', name: 'Acme Pvt Ltd', gstin: null, cin: null, state_code: null, status: 'active' }], branches: [{ id: 'b1', code: 'HQ', name: 'Head office', state: 'MH', city: null, status: 'active', legal_entity_id: 'l1' }], departments: [] };
const SETTING = { key: 'attendance.grace', group: 'attendance', label: 'Grace minutes', description: 'Minutes allowed', control: 'number', options: null, scopes: ['tenant'], feature: 'attendance.web', editable: true, effective: 10, source: 'tenant', defaultValue: 5, platformValue: null, tenantValue: 10, branchValue: null, version: 2 };

describe('settings: organization', () => {
  it('names the record in the singular, in every form title', async () => {
    mockPageApi(['org.read', 'org.manage'], (url) => (url.endsWith('/org') ? ORG : { items: [] }));
    show('/settings/organization');
    await userEvent.click(within(await screen.findByRole('region', { name: 'Legal entities' })).getByRole('button', { name: 'Add' }));
    await screen.findByRole('dialog', { name: 'Add legal entity' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Branches' })).getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog', { name: 'Edit branch' });
  });
  it('someone with only org.read gets that one section, and nothing else is requested', async () => {
    const f = mockPageApi(['org.read'], (url) => (url.endsWith('/org') ? ORG : { items: [] }));
    show('/settings');
    await screen.findByRole('region', { name: 'Branches' });
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Organization']);
    expect(reads(f, '/tenant/')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });
});

describe('settings: values', () => {
  it('each editor is named by its setting, and a feature setting is not called disabled', async () => {
    mockPageApi(['settings.read', 'settings.manage'], (url) => (url.includes('/tenant/settings') ? { items: [SETTING] } : ORG));
    show('/settings/attendance');
    await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    expect(screen.queryByText('Module disabled')).toBeNull();
  });
  it('a refused save stays on the row with the reason', async () => {
    mockPageApi(['settings.read', 'settings.manage'], (url, init) => {
      if (init.method === 'PUT') return problem(409, 'Out of date', { code: 'conflict' });
      return url.includes('/tenant/settings') ? { items: [SETTING] } : ORG;
    });
    show('/settings/attendance');
    const input = await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Out of date');
    expect((screen.getByRole('spinbutton', { name: 'Grace minutes' }) as HTMLInputElement).value).toBe('12');
  });
  it('a saved value can be undone from the toast', async () => {
    const f = mockPageApi(['settings.read', 'settings.manage'], (url, init) => {
      if (init.method === 'PUT') return { ok: true };
      return url.includes('/tenant/settings') ? { items: [SETTING] } : ORG;
    });
    show('/settings/attendance');
    const input = await screen.findByRole('spinbutton', { name: 'Grace minutes' });
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, 'tenant/settings/attendance.grace')).toHaveLength(2));
    expect(JSON.parse((writes(f, 'tenant/settings/attendance.grace')[1]![1] as RequestInit).body as string).value).toBe(10);
  });
});

describe('settings: long wording', () => {
  it('a text area edits it and saves what was typed', async () => {
    const f = mockPageApi(['settings.read', 'settings.manage'], (url) => (url.includes('/tenant/settings') ? { items: [{ ...SETTING, key: 'cards.id_back_terms', group: 'general', label: 'ID card back: terms', control: 'textarea', feature: null, effective: 'Old words', tenantValue: null }] } : ORG));
    show('/settings/general');
    const area = await screen.findByLabelText('ID card back: terms');
    expect(area.tagName).toBe('TEXTAREA');
    await userEvent.clear(area);
    await userEvent.type(area, 'New words');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(writes(f, '/tenant/settings/cards.id_back_terms').length).toBe(1));
  });
});

describe('settings: installation', () => {
  it('reads the configuration the server sends today, with no organization block', async () => {
    mockPageApi(['settings.read'], () => ({
      product: { name: 'Example HR' }, brand: { name: 'Example', legalName: 'Example Pvt Ltd', logoUrl: null, primaryColor: '#14532d', secondaryColor: null, accentColor: null, supportEmail: 's@x.test', supportPhone: null, helpUrl: null, loginMessage: null, domain: 'x.test', locale: 'en-IN', timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD/MM/YYYY', financialYearStart: '04-01', country: 'IN' },
      features: {}, mode: 'multi', mfa: { available: true, enforced: false, methods: [] }, managedBy: 'deployment',
      domains: [{ hostname: 'x.test', activation_status: 'active', is_primary: true }],
      modules: [{ key: 'leave', name: 'Leave', description: 'Leave requests', category: 'workforce', core: false, dependencies: [], supported: true, enabled: true, configured: true, dependenciesMet: true, operational: 'healthy', usable: true, blockers: [] }],
    }));
    show('/settings/installation');
    expect(await screen.findByText('Example Pvt Ltd')).toBeTruthy();
    expect(screen.getByText('Asia/Kolkata')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Workforce management modules' })).toBeTruthy();
  });
});

const JOB = { key: 'leave.accrue', name: 'Leave accrual', description: 'Credits leave', schedule: { kind: 'daily', at: '01:00' }, feature: null, active: true, nextRun: '2026-11-06 01:00', canRun: true, recentRuns: [] };

describe('settings: jobs', () => {
  it('a manual run is reported as queued, not as a failure', async () => {
    mockPageApi(['settings.read'], (_url, init) => (init.method === 'POST' ? { runId: 'r1', status: 'queued' } : { timezone: 'Asia/Kolkata', maxAttempts: 3, items: [JOB] }));
    show('/settings/jobs');
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('Leave accrual queued. It starts on the next worker pass.')).toBeTruthy();
    expect(screen.queryByText(/failed/)).toBeNull();
  });
  it('a job that is on but not set up says what is missing', async () => {
    mockPageApi(['settings.read'], (_url, init) => (init.method === 'POST' ? problem(409, 'Not set up', { code: 'feature_not_configured', reason: 'No mail transport is configured' }) : { timezone: 'Asia/Kolkata', maxAttempts: 3, items: [JOB] }));
    show('/settings/jobs');
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No mail transport is configured');
  });
});

describe('settings: roles', () => {
  it('Enter in the permission filter does not submit the role', async () => {
    const f = mockPageApi(['users.manage'], () => ({ system: [], custom: [], permissions: [{ key: 'assets.manage', label: 'Assets', privileged: false }], canManage: true, maxPermissions: null }));
    show('/settings/roles');
    await userEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dlg = await screen.findByRole('dialog', { name: 'New role' });
    await userEvent.type(within(dlg).getByLabelText(/Role name/), 'Front desk');
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Assets/ }));
    await userEvent.type(within(dlg).getByLabelText('Filter permissions'), 'ass{Enter}');
    expect(writes(f, '/tenant/roles')).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'New role' })).toBeTruthy();
  });
});

describe('settings: users', () => {
  const USER = { id: 'u2', email: 'b@x.test', display_name: 'Bo', status: 'active', roles: [], mfa_enabled: false, locked: true, employee_id: null, employee_code: null, last_login_at: null };
  it('a failed unlock keeps the form open with the reason', async () => {
    mockPageApi(['users.manage'], (url, init) => {
      if (init.method === 'PATCH') return problem(500, 'Could not unlock');
      if (url.includes('/tenant/users')) return { items: [USER], page: 1, pageSize: 25, total: 1 };
      return { system: [], custom: [], permissions: [] };
    });
    show('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Manage' }));
    const dlg = await screen.findByRole('dialog', { name: 'Manage Bo' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Unlock account' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Could not unlock');
  });
  it('a linked employee stays visible after searching for another', async () => {
    mockPageApi(['users.manage'], (url) => {
      if (url.includes('/tenant/users')) return { items: [], page: 1, pageSize: 25, total: 0 };
      if (url.includes('/employees')) return { items: url.includes('zzz') ? [] : [{ id: 'e7', first_name: 'Asha', last_name: 'Rao', employee_code: 'E-7' }], page: 1, pageSize: 20, total: 1 };
      return { system: [], custom: [], permissions: [] };
    });
    show('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add user' });
    const field = within(dlg).getByRole('combobox', { name: /Link to employee record/ });
    await userEvent.click(field);
    await userEvent.click(await within(dlg).findByRole('option', { name: /Asha Rao/ }));
    expect(within(dlg).getByText(/Asha Rao/)).toBeTruthy();
  });
});
