import { screens as attendance } from './fixtures/attendance';
import { screens as learning } from './fixtures/learning';
import { screens as money } from './fixtures/money';
import { screens as payroll } from './fixtures/payroll';
import { screens as people } from './fixtures/people';
import { screens as settings } from './fixtures/settings';
import type { Screen } from './fixtures/types';

/** The batch 1 screens, on the fixtures in api.ts. */
const SELF_SERVICE: Screen[] = [
  { name: 'dashboard', path: '/', persona: 'hr', minRows: 0 }, { name: 'attendance-me', path: '/attendance/me', persona: 'employee', minRows: 0 }, { name: 'leave', path: '/leave', persona: 'employee' }, { name: 'leave-team', path: '/leave?tab=team', persona: 'hr', minRows: 0 },
  { name: 'payslips', path: '/payslips', persona: 'employee' }, { name: 'approvals', path: '/approvals', persona: 'hr' }, { name: 'approvals-mine', path: '/approvals?tab=mine', persona: 'hr' }, { name: 'notifications', path: '/notifications', persona: 'employee', minRows: 0 },
  { name: 'employees', path: '/employees', persona: 'hr' }, { name: 'employee', path: '/employees/e1', persona: 'hr', minRows: 0 }, { name: 'documents', path: '/documents', persona: 'hr' }, { name: 'profile', path: '/profile', persona: 'employee', minRows: 0 }, { name: 'account', path: '/account', persona: 'employee', minRows: 0 },
];

export const SCREENS: Screen[] = [...SELF_SERVICE, ...payroll, ...people, ...settings, ...attendance, ...money, ...learning];
