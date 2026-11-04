// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Features } from '../lib/features';
import { NAV_LABELS } from './nav-labels';
import { bottomNav, canEnter, navFor, reachableRoutes, routeById, ROUTES, routeExists, viewsFor, type Viewer } from './registry';

const SELF = ['attendance.self', 'employees.directory', 'leave.self', 'documents.self', 'expenses.self', 'competency.self', 'policies.self', 'lifecycle.self', 'payslips.self', 'cases.self', 'performance.self', 'assets.self', 'overtime.self', 'field_duty.self', 'travel.self', 'loans.self', 'profile.self'];
const viewer = (perms: string[], hasEmployee = true): Viewer => ({ permissions: new Set(perms), hasEmployee });
const ALL_ON = Object.fromEntries(ROUTES.flatMap((r) => r.flags ?? []).map((f) => [f, true])) as Features;
const labels = (view: Parameters<typeof navFor>[0], v: Viewer, f: Features = ALL_ON) => navFor(view, v, f).flatMap((g) => g.items.map((i) => i.label));

describe('views', () => {
  it('an employee has one view, and no role switcher choices', () => {
    expect(viewsFor(viewer(SELF), 'multi')).toEqual(['employee']);
  });
  it('a reporting manager has Manager and Employee', () => {
    expect(viewsFor(viewer([...SELF, 'attendance.team.read', 'leave.team.read']), 'multi')).toEqual(['manager', 'employee']);
  });
  it('an HR administrator holds HR, Admin and Employee, HR first', () => {
    expect(viewsFor(viewer([...SELF, 'employees.manage', 'settings.read']), 'multi')).toEqual(['hr', 'admin', 'employee']);
  });
  it('super-admin needs the full set', () => {
    expect(viewsFor(viewer(['users.manage', 'settings.manage', 'security.manage', 'employees.manage', 'payroll.manage']), 'multi')[0]).toBe('super');
    expect(viewsFor(viewer(['users.manage', 'settings.manage']), 'multi')).not.toContain('super');
  });
  it('single-person modes have no Manager view', () => {
    expect(viewsFor(viewer([...SELF, 'leave.team.read']), 'single')).toEqual(['employee']);
  });
  it('a login with no employee record does not get the Employee view', () => {
    expect(viewsFor(viewer(['settings.read'], false), 'multi')).toEqual(['admin']);
  });
});

describe('navigation', () => {
  it('an employee sees self-service tasks only, grouped', () => {
    const items = labels('employee', viewer(SELF));
    for (const hidden of ['Payroll', 'Settings', 'Attendance setup', 'Reports', 'Team attendance', 'Recruitment']) expect(items).not.toContain(hidden);
    for (const shown of ['Dashboard', 'My profile', 'My attendance', 'Roster', 'Leave', 'Payslips']) expect(items).toContain(shown);
    expect(navFor('employee', viewer(SELF), ALL_ON).map((g) => g.title)).toEqual(['Home', 'Time', 'Pay', 'Work']);
  });
  it('flags remove items: a default install shows far fewer than 22', () => {
    const defaults: Features = { FEATURE_DOCUMENTS: true, FEATURE_ATTENDANCE: true, FEATURE_SHIFTS: true, FEATURE_LEAVE: true };
    const items = labels('employee', viewer(SELF), defaults);
    expect(items).toEqual(['Dashboard', 'Notifications', 'Approvals', 'My attendance', 'Leave', 'Roster', 'Employees', 'Documents', 'My profile']);
  });
  it('a plain org.read user is not offered Settings in navigation but may still enter', () => {
    const v = viewer([...SELF, 'org.read', 'attendance.team.read']);
    expect(labels('manager', v)).not.toContain('Settings');
    expect(canEnter(routeById('settings')!, v)).toBe(true);
  });
  it('super-admin is the union of HR and Admin', () => {
    const v = viewer(['users.manage', 'settings.manage', 'settings.read', 'security.manage', 'employees.manage', 'employees.read', 'payroll.manage', 'attendance.devices.manage']);
    const items = labels('super', v);
    expect(items).toContain('Payroll');
    expect(items).toContain('Attendance setup');
    expect(items).toContain('Settings');
  });
  it('the training page takes the Competency name when the lab flag is on', () => {
    const v = viewer(SELF);
    expect(labels('employee', v, { ...ALL_ON, FEATURE_LAB_COMPETENCY: false })).toContain('Training');
    expect(labels('employee', v, { ...ALL_ON, FEATURE_LAB_COMPETENCY: true })).toContain('Competency');
  });
  it('every label is in the list e2e helpers check against', () => {
    for (const r of ROUTES) expect(NAV_LABELS).toContain(r.label);
  });
});

describe('guards', () => {
  it('self routes need an employee record', () => {
    expect(canEnter(routeById('attendance-me')!, viewer(['attendance.self'], false))).toBe(false);
    expect(canEnter(routeById('attendance-me')!, viewer(['attendance.self']))).toBe(true);
  });
  it('an employee cannot enter payroll', () => { expect(canEnter(routeById('payroll')!, viewer(SELF))).toBe(false); });
  it('a statutory-only custom role can enter payroll', () => { expect(canEnter(routeById('payroll')!, viewer(['payroll.statutory']))).toBe(true); });
  it('a route with flags does not exist when they are off', () => {
    expect(routeExists(routeById('payroll')!, {})).toBe(false);
    expect(routeExists(routeById('loans')!, { FEATURE_SALARY_ADVANCE: true })).toBe(true);
    expect(routeExists(routeById('employees')!, {})).toBe(true);
  });
  it('the palette lists only reachable pages, without path parameters', () => {
    const items = reachableRoutes(viewer(SELF), { FEATURE_LEAVE: true }).map((i) => i.id);
    expect(items).toContain('leave');
    expect(items).not.toContain('payroll');
    expect(items).not.toContain('employee-profile');
  });
});

describe('bottom navigation', () => {
  it('keeps the five tasks in order and drops what is off', () => {
    expect(bottomNav(viewer(SELF), ALL_ON).map((i) => i.short)).toEqual(['Home', 'Attendance', 'Leave', 'Payslips', 'Profile']);
    expect(bottomNav(viewer(SELF), { FEATURE_LEAVE: true }).map((i) => i.short)).toEqual(['Home', 'Leave', 'Profile']);
  });
});

describe('module boundaries', () => {
  const src = join(process.cwd(), 'src');
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []; });
  it('no page imports another page, so a chunk never drags a whole page along', () => {
    const offenders = files(join(src, 'pages')).flatMap((f) => {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]!);
      return imports.filter((i) => i.startsWith('./') && !i.endsWith('.css') && !f.includes('/auth/')).map((i) => `${f} -> ${i}`);
    });
    expect(offenders).toEqual([]);
  });
  it('migrated pages are fully migrated: no legacy UI layer, inline styles or any', () => {
    const migrated = ['Dashboard', 'MyAttendance', 'Leave', 'Payslips', 'Approvals', 'Notifications', 'Employees', 'Documents', 'PersonalDetails', 'auth/Login', 'auth/Setup', 'auth/Account', 'auth/Mfa', 'auth/ChangePasswordForm', 'auth/CardPage'].map((n) => join(src, 'pages', `${n}.tsx`));
    const features = ['attendance/AttendanceCalendar', 'attendance/PunchCard', 'approvals/Delegations', 'documents/DocumentTable', 'documents/EmployeeDocuments', 'profile/PersonalDetails', 'leave/ApplyForm', 'leave/LeaveAdmin', 'leave/TeamCalendar', 'dashboard/SummaryBlocks', 'payroll/PayLines'].map((n) => join(src, 'features', `${n}.tsx`));
    for (const f of [...migrated, ...features]) {
      const text = readFileSync(f, 'utf8');
      expect(text, `${f} uses the legacy UI layer`).not.toMatch(/from '(\.\.\/)+ui'/);
      expect(text, `${f} has an inline style`).not.toMatch(/style=\{/);
      expect(text, `${f} uses any`).not.toMatch(/: any\b|<any>|as any\b/);
    }
  });
  it('nothing writes to the console except the logger', () => {
    const offenders = files(src).filter((f) => !f.endsWith('logger.ts') && !f.includes('.test.') && /\bconsole\.\w+\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('the SMS feature is gone', () => {
    const offenders = files(src).filter((f) => !f.endsWith('registry.test.ts') && /\bsms\b/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('the entry and shell import no page statically', () => {
    for (const f of [...files(join(src, 'app')), join(src, 'main.tsx')].filter((x) => !x.endsWith('.test.ts') && !x.endsWith('.test.tsx'))) {
      const text = readFileSync(f, 'utf8');
      const named = text.match(/^import .*pages\/(?!auth\/).*/gm);
      expect(named, f).toBeNull();
    }
  });
});
