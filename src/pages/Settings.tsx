import { useEffect, useRef } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { Audit } from '../features/settings/Audit';
import { AuditChain } from '../features/settings/AuditChain';
import { CompanySettings } from '../features/settings/Company';
import { DataRights } from '../features/settings/DataRights';
import { Installation } from '../features/settings/Installation';
import { Jobs } from '../features/settings/Jobs';
import { Organization } from '../features/settings/Organization';
import { Roles } from '../features/settings/Roles';
import { SettingsGroup } from '../features/settings/SettingsGroup';
import { Users } from '../features/settings/Users';
import '../components/Tabs.css';
import '../features/settings/Settings.css';

export function SettingsCenter() {
  const { can, canAny, config, me } = useAuth();
  // The chain answers only to the Owner and Super-admin. Roles, not a permission, on the server too.
  const ownerLike = !!me?.roles.some((r) => ['owner', 'tenant_admin'].includes(r.key));
  const sections = [
    { to: 'general', label: 'General', show: can('settings.read') },
    { to: 'attendance', label: 'Attendance policy', show: can('settings.read') },
    { to: 'security', label: 'Security & privacy', show: can('settings.read') },
    { to: 'company', label: 'Company', show: canAny('settings.read', 'company.manage', 'payroll.manage', 'payroll.approve') },
    { to: 'retention', label: 'Data retention', show: can('settings.read') },
    { to: 'data-rights', label: 'Data rights', show: canAny('settings.read', 'data_rights.manage', 'data_rights.execute', 'employees.manage') },
    { to: 'installation', label: 'Installation', show: can('settings.read') },
    { to: 'organization', label: 'Organization', show: can('org.read') },
    { to: 'users', label: 'Users & permissions', show: can('users.manage') },
    { to: 'roles', label: 'Roles', show: canAny('users.manage', 'settings.read') && config?.mode === 'multi' },
    { to: 'jobs', label: 'Scheduled jobs', show: can('settings.read') },
    { to: 'audit', label: 'Audit history', show: can('audit.read') },
    { to: 'audit-chain', label: 'Audit chain', show: ownerLike },
  ].filter((s) => s.show);
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // On a phone the links scroll sideways, so a deep link must not leave the current section out of sight.
  useEffect(() => { nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [pathname]);
  return (
    <div className="stack-4">
      <PageHeader title="Settings center" description="Business settings for your organization. Changes apply immediately and are recorded in the audit history." />
      {/* Real links, not role=tab: each section has its own URL, so it can be bookmarked and opened in a new tab. */}
      <nav ref={nav} className="tabs tabs-bar settings-nav" aria-label="Settings sections">
        {sections.map((s) => <NavLink key={s.to} to={`/settings/${s.to}`} className="tabs-bar__tab">{s.label}</NavLink>)}
      </nav>
      <Routes>
        <Route path="general" element={<SettingsGroup group="general" />} />
        <Route path="attendance" element={<SettingsGroup group="attendance" />} />
        <Route path="security" element={<SettingsGroup group="security" />} />
        <Route path="company" element={<CompanySettings />} />
        <Route path="retention" element={<SettingsGroup group="retention" />} />
        <Route path="data-rights" element={<DataRights />} />
        <Route path="audit-chain" element={<AuditChain />} />
        <Route path="installation" element={<Installation />} />
        <Route path="organization" element={<Organization />} />
        <Route path="users" element={<Users />} />
        <Route path="roles" element={<Roles />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="audit" element={<Audit />} />
        {/* Absolute targets: relative links inside a splat route resolve against the full URL in React Router v7. */}
        <Route path="*" element={<Navigate to={`/settings/${sections[0]?.to ?? 'general'}`} replace />} />
      </Routes>
    </div>
  );
}
