/**
 * Every navigation label in the product. Pure data: e2e helpers import it to reject assertions
 * about labels that do not exist, and the route registry is typed against it.
 */
export const NAV_LABELS = [
  'Dashboard', 'Notifications', 'Approvals', 'My profile', 'My attendance', 'Team attendance', 'Roster', 'Attendance setup',
  'Leave', 'Overtime', 'Field duty', 'Travel', 'Advances & loans', 'Expenses', 'Payslips', 'Payroll', 'Accounting',
  'Employees', 'Documents', 'Recruitment', 'Onboarding & exit', 'Performance', 'Competency', 'Training', 'Grievances & POSH',
  'Policies', 'Assets', 'Reports', 'Settings', 'My account',
] as const;
export type NavLabel = (typeof NAV_LABELS)[number];
