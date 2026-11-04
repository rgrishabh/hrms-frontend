import type { ComponentType } from 'react';
import {
  Banknote, BarChart3, Bell, BookOpenCheck, Briefcase, CalendarClock, CalendarDays, CheckSquare, ClipboardList, Clock, FileText, GraduationCap, HandCoins, Home,
  Landmark, Laptop, MapPin, Plane, Receipt, Scale, Settings, ShieldAlert, SlidersHorizontal, Star, UserRound, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Features, FeatureFlag } from '../lib/features';
import type { ManagementMode } from '../lib/config';
import { anyFlagOn } from '../lib/features';
import type { NavLabel } from './nav-labels';
import { lazyRoute } from './lazyRoute';

/** A task-based view of the product. A person sees only the views their permissions give them. */
export type ViewId = 'employee' | 'manager' | 'hr' | 'admin' | 'super';
export const VIEW_LABEL: Record<ViewId, string> = { employee: 'Employee', manager: 'Manager', hr: 'HR', admin: 'Admin', super: 'Super-admin' };

const VIEW_PRIORITY: readonly ViewId[] = ['super', 'hr', 'admin', 'manager', 'employee'];

/** Who holds a view. Permissions only, never role keys: custom roles can combine anything. */
const VIEW_GATE: Record<Exclude<ViewId, 'employee'>, { any?: readonly string[]; all?: readonly string[] }> = {
  manager: { any: ['attendance.team.read', 'leave.team.read', 'expenses.team.read', 'overtime.team.read', 'field_duty.team.read', 'travel.team.read', 'loans.team.read'] },
  hr: { any: ['employees.read', 'employees.manage', 'payroll.read', 'payroll.manage', 'payroll.approve', 'lifecycle.read', 'lifecycle.manage', 'recruitment.read', 'recruitment.manage', 'leave.read', 'leave.manage', 'expenses.read', 'expenses.pay', 'policies.manage', 'competency.manage', 'competency.authorize', 'grievance.manage', 'performance.manage'] },
  admin: { any: ['settings.read', 'settings.manage', 'security.manage', 'users.manage', 'audit.read', 'attendance.devices.manage'] },
  super: { all: ['users.manage', 'settings.manage', 'security.manage', 'employees.manage', 'payroll.manage'] },
};

/** Where a route appears in one view, and what the viewer needs for it to appear there. */
export interface NavPlacement { view: ViewId; group: string; any?: readonly string[]; self?: readonly string[] }

export interface RouteDef {
  id: string;
  path: string;
  label: NavLabel;
  /** Overrides the label when a feature renames the page. */
  labelFor?: (features: Features) => NavLabel;
  icon: LucideIcon;
  /** The page exists when any of these is on. None means it is always on. */
  flags?: readonly FeatureFlag[];
  /** Entry requires one of these. Omitted means anyone signed in. */
  access?: { any?: readonly string[]; self?: readonly string[] };
  /** Parent for breadcrumbs, on routes that are not in navigation themselves. */
  parent?: string;
  nav: readonly NavPlacement[];
  keywords?: string;
  load: () => Promise<ComponentType>;
  /** A nested router lives inside this page. */
  splat?: boolean;
}

export interface Viewer { permissions: ReadonlySet<string>; hasEmployee: boolean }

const HOME = 'Home';
const everywhere: NavPlacement[] = (['employee', 'manager', 'hr', 'admin', 'super'] as const).map((view) => ({ view, group: HOME }));

const route = (d: RouteDef) => d;

/** The single table behind routes, navigation, guards, breadcrumbs and the command palette. */
export const ROUTES: readonly RouteDef[] = [
  route({ id: 'dashboard', path: '/', label: 'Dashboard', icon: Home, nav: everywhere, keywords: 'home', load: () => import('../pages/Dashboard').then((m) => m.Dashboard) }),
  route({ id: 'notifications', path: '/notifications', label: 'Notifications', icon: Bell, nav: everywhere, load: () => import('../pages/Notifications').then((m) => m.Notifications) }),
  route({ id: 'approvals', path: '/approvals', label: 'Approvals', icon: CheckSquare, nav: everywhere, keywords: 'inbox requests delegate away', load: () => import('../pages/Approvals').then((m) => m.Approvals) }),
  route({ id: 'attendance-me', path: '/attendance/me', label: 'My attendance', icon: Clock, flags: ['FEATURE_ATTENDANCE'], access: { self: ['attendance.self'] }, nav: [{ view: 'employee', group: 'Time', self: ['attendance.self'] }], keywords: 'punch clock in out regularization correction', load: () => import('../pages/MyAttendance').then((m) => m.MyAttendance) }),
  route({ id: 'leave', path: '/leave', label: 'Leave', icon: CalendarDays, flags: ['FEATURE_LEAVE'], access: { self: ['leave.self'], any: ['leave.team.read', 'leave.read', 'leave.manage'] }, nav: [{ view: 'employee', group: 'Time', self: ['leave.self'] }, { view: 'manager', group: 'Team', any: ['leave.team.read'] }, { view: 'hr', group: 'Time', any: ['leave.read', 'leave.manage'] }], keywords: 'holiday absence balance', load: () => import('../pages/Leave').then((m) => m.Leave) }),
  route({ id: 'roster', path: '/attendance/roster', label: 'Roster', icon: CalendarClock, flags: ['FEATURE_SHIFTS'], access: { self: ['attendance.self'], any: ['attendance.team.read', 'attendance.read'] }, nav: [{ view: 'employee', group: 'Time', self: ['attendance.self'] }, { view: 'manager', group: 'Team', any: ['attendance.team.read'] }, { view: 'hr', group: 'Time', any: ['attendance.read'] }], keywords: 'shift schedule', load: () => import('../pages/Rosters').then((m) => m.RosterPage) }),
  route({ id: 'attendance-team', path: '/attendance/team', label: 'Team attendance', icon: UsersRound, flags: ['FEATURE_ATTENDANCE'], access: { any: ['attendance.read', 'attendance.team.read'] }, nav: [{ view: 'manager', group: 'Team', any: ['attendance.team.read'] }, { view: 'hr', group: 'Time', any: ['attendance.read'] }], load: () => import('../pages/TeamAttendance').then((m) => m.TeamAttendance) }),
  route({ id: 'overtime', path: '/overtime', label: 'Overtime', icon: CalendarClock, flags: ['FEATURE_OVERTIME'], access: { self: ['overtime.self'], any: ['overtime.team.read', 'overtime.read', 'overtime.approve', 'overtime.manage'] }, nav: [{ view: 'employee', group: 'Time', self: ['overtime.self'] }, { view: 'manager', group: 'Team', any: ['overtime.team.read'] }, { view: 'hr', group: 'Time', any: ['overtime.read', 'overtime.approve', 'overtime.manage'] }], load: () => import('../pages/Overtime').then((m) => m.Overtime) }),
  route({ id: 'field-duty', path: '/field-duty', label: 'Field duty', icon: MapPin, flags: ['FEATURE_FIELD_DUTY'], access: { self: ['field_duty.self'], any: ['field_duty.team.read', 'field_duty.read', 'field_duty.approve', 'field_duty.manage'] }, nav: [{ view: 'employee', group: 'Time', self: ['field_duty.self'] }, { view: 'manager', group: 'Team', any: ['field_duty.team.read'] }, { view: 'hr', group: 'Time', any: ['field_duty.read', 'field_duty.approve', 'field_duty.manage'] }], load: () => import('../pages/FieldDuty').then((m) => m.FieldDuty) }),
  route({ id: 'attendance-admin', path: '/attendance/admin', label: 'Attendance setup', icon: SlidersHorizontal, flags: ['FEATURE_ATTENDANCE'], access: { any: ['attendance.configure', 'attendance.devices.manage', 'attendance.lock', 'attendance.recalculate'] }, nav: [{ view: 'hr', group: 'Time', any: ['attendance.configure', 'attendance.lock', 'attendance.recalculate'] }, { view: 'admin', group: 'Organization', any: ['attendance.configure', 'attendance.devices.manage'] }], keywords: 'shifts holidays devices locks biometric', load: () => import('../pages/AttendanceAdmin').then((m) => m.AttendanceAdmin) }),

  route({ id: 'payslips', path: '/payslips', label: 'Payslips', icon: Receipt, flags: ['FEATURE_PAYSLIPS'], access: { self: ['payslips.self'] }, nav: [{ view: 'employee', group: 'Pay', self: ['payslips.self'] }], keywords: 'salary', load: () => import('../pages/Payslips').then((m) => m.Payslips) }),
  route({ id: 'expenses', path: '/expenses', label: 'Expenses', icon: Wallet, flags: ['FEATURE_EXPENSE_CLAIMS'], access: { any: ['expenses.self', 'expenses.team.read', 'expenses.read', 'expenses.pay', 'expenses.manage'] }, nav: [{ view: 'employee', group: 'Pay', any: ['expenses.self'] }, { view: 'manager', group: 'Team', any: ['expenses.team.read'] }, { view: 'hr', group: 'Pay', any: ['expenses.read', 'expenses.pay', 'expenses.manage'] }], keywords: 'claims reimbursement', load: () => import('../pages/Expenses').then((m) => m.Expenses) }),
  route({ id: 'travel', path: '/travel', label: 'Travel', icon: Plane, flags: ['FEATURE_TRAVEL'], access: { self: ['travel.self'], any: ['travel.team.read', 'travel.read', 'travel.approve', 'expenses.pay'] }, nav: [{ view: 'employee', group: 'Pay', self: ['travel.self'] }, { view: 'manager', group: 'Team', any: ['travel.team.read'] }, { view: 'hr', group: 'Pay', any: ['travel.read', 'travel.approve', 'expenses.pay'] }], load: () => import('../pages/Travel').then((m) => m.Travel) }),
  route({ id: 'loans', path: '/loans', label: 'Advances & loans', icon: HandCoins, flags: ['FEATURE_LOANS', 'FEATURE_SALARY_ADVANCE'], access: { self: ['loans.self'], any: ['loans.team.read', 'loans.read', 'loans.approve', 'loans.manage'] }, nav: [{ view: 'employee', group: 'Pay', self: ['loans.self'] }, { view: 'manager', group: 'Team', any: ['loans.team.read'] }, { view: 'hr', group: 'Pay', any: ['loans.read', 'loans.approve', 'loans.manage'] }], load: () => import('../pages/Loans').then((m) => m.Loans) }),
  route({ id: 'payroll', path: '/payroll', label: 'Payroll', icon: Banknote, flags: ['FEATURE_PAYROLL'], access: { any: ['payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory'] }, nav: [{ view: 'hr', group: 'Pay', any: ['payroll.read', 'payroll.manage', 'payroll.approve', 'payroll.statutory'] }], keywords: 'salary runs statutory', load: () => import('../pages/Payroll').then((m) => m.Payroll) }),
  route({ id: 'accounting', path: '/accounting', label: 'Accounting', icon: Landmark, flags: ['FEATURE_ACCOUNTING_EXPORTS'], access: { any: ['accounting.export', 'accounting.configure'] }, nav: [{ view: 'hr', group: 'Pay', any: ['accounting.export', 'accounting.configure'] }], keywords: 'journal ledger tally', load: () => import('../pages/Accounting').then((m) => m.Accounting) }),

  route({ id: 'employees', path: '/employees', label: 'Employees', icon: Users, access: { any: ['employees.read', 'employees.directory'] }, nav: [{ view: 'employee', group: 'Work', any: ['employees.directory'] }, { view: 'manager', group: 'Team', any: ['employees.directory', 'employees.read'] }, { view: 'hr', group: 'People', any: ['employees.read', 'employees.manage'] }], keywords: 'people directory staff', load: () => import('../pages/Employees').then((m) => m.Employees) }),
  route({ id: 'employee-profile', path: '/employees/:id', label: 'Employees', icon: Users, parent: 'employees', access: { any: ['employees.read', 'employees.directory'], self: ['profile.self'] }, nav: [], load: () => import('../pages/Employees').then((m) => m.EmployeeProfile) }),
  route({ id: 'documents', path: '/documents', label: 'Documents', icon: FileText, flags: ['FEATURE_DOCUMENTS'], nav: [{ view: 'employee', group: 'Work' }, { view: 'hr', group: 'People', any: ['documents.read', 'documents.manage'] }], load: () => import('../pages/Documents').then((m) => m.Documents) }),
  route({ id: 'policies', path: '/policies', label: 'Policies', icon: BookOpenCheck, flags: ['FEATURE_POLICIES'], access: { any: ['policies.self', 'policies.read', 'policies.manage', 'policies.publish'] }, nav: [{ view: 'employee', group: 'Work', any: ['policies.self'] }, { view: 'hr', group: 'People', any: ['policies.read', 'policies.manage', 'policies.publish'] }, { view: 'admin', group: 'Organization', any: ['policies.read', 'policies.publish'] }], load: () => import('../pages/Policies').then((m) => m.Policies) }),
  route({ id: 'performance', path: '/performance', label: 'Performance', icon: Star, flags: ['FEATURE_PERFORMANCE_REVIEW'], access: { any: ['performance.self', 'performance.manage'] }, nav: [{ view: 'employee', group: 'Work', any: ['performance.self'] }, { view: 'manager', group: 'Team', any: ['performance.self'] }, { view: 'hr', group: 'People', any: ['performance.manage'] }], keywords: 'review goals', load: () => import('../pages/Performance').then((m) => m.Performance) }),
  route({ id: 'competency', path: '/competency', label: 'Training', labelFor: (f) => (f.FEATURE_LAB_COMPETENCY ? 'Competency' : 'Training'), icon: GraduationCap, flags: ['FEATURE_TRAINING'], access: { any: ['competency.self', 'training.manage', 'competency.read', 'competency.manage', 'competency.assess', 'competency.authorize'] }, nav: [{ view: 'employee', group: 'Work', any: ['competency.self'] }, { view: 'manager', group: 'Team', any: ['competency.assess', 'competency.read'] }, { view: 'hr', group: 'People', any: ['training.manage', 'competency.read', 'competency.manage', 'competency.authorize'] }], keywords: 'authorization methods courses', load: () => import('../pages/Competency').then((m) => m.Competency) }),
  route({ id: 'assets', path: '/assets', label: 'Assets', icon: Laptop, flags: ['FEATURE_ASSET_MANAGEMENT'], access: { self: ['assets.self'], any: ['assets.manage'] }, nav: [{ view: 'employee', group: 'Work', self: ['assets.self'] }, { view: 'hr', group: 'People', any: ['assets.manage'] }, { view: 'admin', group: 'Organization', any: ['assets.manage'] }], keywords: 'equipment instruments', load: () => import('../pages/Assets').then((m) => m.Assets) }),
  route({ id: 'lifecycle', path: '/lifecycle', label: 'Onboarding & exit', icon: ClipboardList, flags: ['FEATURE_ONBOARDING', 'FEATURE_OFFBOARDING'], nav: [{ view: 'employee', group: 'Work', any: ['lifecycle.self'] }, { view: 'hr', group: 'People', any: ['lifecycle.read', 'lifecycle.manage'] }], keywords: 'probation separation resign checklist', load: () => import('../pages/Lifecycle').then((m) => m.Lifecycle) }),
  route({ id: 'cases', path: '/cases', label: 'Grievances & POSH', icon: ShieldAlert, flags: ['FEATURE_POSH', 'FEATURE_GRIEVANCE'], nav: [{ view: 'employee', group: 'Work', any: ['cases.self'] }, { view: 'hr', group: 'People', any: ['grievance.manage', 'posh.admin'] }, { view: 'admin', group: 'Organization', any: ['posh.admin'] }], keywords: 'complaint committee', load: () => import('../pages/Cases').then((m) => m.Cases) }),
  // Everyone can sit on an interview panel, so the page stays reachable; only requisition owners and HR see it in navigation.
  route({ id: 'recruitment', path: '/recruitment', label: 'Recruitment', icon: Briefcase, flags: ['FEATURE_RECRUITMENT'], nav: [{ view: 'manager', group: 'Team', any: ['recruitment.requisition'] }, { view: 'hr', group: 'People', any: ['recruitment.read', 'recruitment.manage', 'recruitment.approve'] }], keywords: 'hiring candidates interviews offers', load: () => import('../pages/Recruitment').then((m) => m.Recruitment) }),

  route({ id: 'reports', path: '/reports', label: 'Reports', icon: BarChart3, access: { any: ['employees.read', 'attendance.read', 'attendance.team.read', 'leave.read', 'leave.team.read', 'payroll.read', 'expenses.read', 'competency.read', 'training.manage'] }, nav: [{ view: 'manager', group: 'Team', any: ['attendance.team.read', 'leave.team.read'] }, { view: 'hr', group: 'Insights', any: ['employees.read', 'attendance.read', 'leave.read', 'payroll.read', 'expenses.read', 'competency.read', 'training.manage'] }], load: () => import('../pages/Reports').then((m) => m.Reports) }),
  route({ id: 'settings', path: '/settings', splat: true, label: 'Settings', icon: Settings, access: { any: ['settings.read', 'users.manage', 'audit.read', 'org.read'] }, nav: [{ view: 'hr', group: 'Organization', any: ['settings.read', 'org.manage'] }, { view: 'admin', group: 'Organization', any: ['settings.read', 'users.manage', 'audit.read'] }], keywords: 'users roles audit jobs configuration', load: () => import('../pages/Settings').then((m) => m.SettingsCenter) }),

  route({ id: 'profile', path: '/profile', label: 'My profile', icon: UserRound, access: { self: ['profile.self'] }, nav: [{ view: 'employee', group: 'Work', self: ['profile.self'] }], keywords: 'contacts nominee address', load: () => import('../pages/PersonalDetails').then((m) => m.MyProfile) }),
  route({ id: 'account', path: '/account', label: 'My account', icon: Scale, nav: [], keywords: 'password two-factor mfa sessions theme', load: () => import('../pages/auth/Account').then((m) => m.Account) }),
];

export const LAZY_COMPONENTS: ReadonlyMap<string, ComponentType> = new Map(ROUTES.map((r) => [r.id, lazyRoute(r.load)]));

const holdsAny = (v: Viewer, list?: readonly string[]) => !!list?.some((p) => v.permissions.has(p));

/** Can this viewer enter the route? Used by the guard; navigation is a stricter subset of this. */
export function canEnter(r: RouteDef, v: Viewer): boolean {
  if (!r.access) return true;
  return holdsAny(v, r.access.any) || (v.hasEmployee && holdsAny(v, r.access.self));
}

export const routeExists = (r: RouteDef, features: Features) => anyFlagOn(features, r.flags);

const placementVisible = (p: NavPlacement, v: Viewer) => {
  if (p.view === 'employee' && !v.hasEmployee) return false;
  if (!p.any && !p.self) return true;
  return holdsAny(v, p.any) || (v.hasEmployee && holdsAny(v, p.self));
};

export function viewsFor(v: Viewer, mode: ManagementMode): ViewId[] {
  const allowed = VIEW_PRIORITY.filter((view) => {
    if (view === 'employee') return v.hasEmployee;
    if (view === 'manager' && mode !== 'multi') return false; // no reporting-line approvals in single modes
    const gate = VIEW_GATE[view];
    return (gate.any ? holdsAny(v, gate.any) : true) && (gate.all ? gate.all.every((p) => v.permissions.has(p)) : true);
  });
  return allowed.length ? allowed : ['employee'];
}

export interface NavItem { id: string; path: string; label: NavLabel; icon: LucideIcon }
export interface NavGroup { title: string; items: NavItem[] }

/** Task-grouped navigation for one view. Super-admin is the union of HR and Admin. */
export function navFor(view: ViewId, v: Viewer, features: Features): NavGroup[] {
  const sources: readonly ViewId[] = view === 'super' ? ['hr', 'admin', 'super'] : [view];
  const groups = new Map<string, NavItem[]>();
  for (const r of ROUTES) {
    if (!routeExists(r, features)) continue;
    const placement = r.nav.find((p) => sources.includes(p.view) && placementVisible(p, v));
    if (!placement) continue;
    const items = groups.get(placement.group) ?? [];
    items.push({ id: r.id, path: r.path, label: r.labelFor?.(features) ?? r.label, icon: r.icon });
    groups.set(placement.group, items);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

/** Everything this viewer can reach, in any view, for the command palette. */
export function reachableRoutes(v: Viewer, features: Features): NavItem[] {
  return ROUTES
    .filter((r) => !r.path.includes(':') && routeExists(r, features) && canEnter(r, v))
    .map((r) => ({ id: r.id, path: r.path, label: r.labelFor?.(features) ?? r.label, icon: r.icon }));
}

const BOTTOM_NAV: readonly { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Home' }, { id: 'attendance-me', label: 'Attendance' }, { id: 'leave', label: 'Leave' }, { id: 'payslips', label: 'Payslips' }, { id: 'profile', label: 'Profile' },
];

/** The phone's bottom bar: the five self-service tasks, minus any the viewer does not have. */
export function bottomNav(v: Viewer, features: Features): (NavItem & { short: string })[] {
  return BOTTOM_NAV.flatMap(({ id, label }) => {
    const r = ROUTES.find((x) => x.id === id);
    if (!r || !routeExists(r, features) || !canEnter(r, v)) return [];
    return [{ id: r.id, path: r.path, label: r.label, icon: r.icon, short: label }];
  });
}

export function routeById(id: string) { return ROUTES.find((r) => r.id === id); }
