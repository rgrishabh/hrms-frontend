/** Layer 1 flags as served by GET /api/v1/config/public. See docs/CONFIGURATION.md in hrms-deployment. */
export type FeatureFlag =
  | 'FEATURE_DOCUMENTS' | 'FEATURE_ONBOARDING' | 'FEATURE_OFFBOARDING' | 'FEATURE_POLICIES' | 'FEATURE_ATTENDANCE' | 'FEATURE_ATTENDANCE_WEB'
  | 'FEATURE_ATTENDANCE_MOBILE' | 'FEATURE_ATTENDANCE_GEOFENCE' | 'FEATURE_ATTENDANCE_SELFIE' | 'FEATURE_ATTENDANCE_BIOMETRIC'
  | 'FEATURE_ATTENDANCE_REGULARIZATION' | 'FEATURE_SHIFTS' | 'FEATURE_HOLIDAYS' | 'FEATURE_LEAVE' | 'FEATURE_OVERTIME' | 'FEATURE_COMP_OFF'
  | 'FEATURE_FIELD_DUTY' | 'FEATURE_PAYROLL' | 'FEATURE_PAYSLIPS' | 'FEATURE_PAYROLL_STATUTORY' | 'FEATURE_LOANS' | 'FEATURE_SALARY_ADVANCE'
  | 'FEATURE_ACCOUNTING_EXPORTS' | 'FEATURE_EXPENSE_CLAIMS' | 'FEATURE_TRAVEL' | 'FEATURE_RECRUITMENT' | 'FEATURE_PERFORMANCE_REVIEW'
  | 'FEATURE_TRAINING' | 'FEATURE_LAB_COMPETENCY' | 'FEATURE_ASSET_MANAGEMENT' | 'FEATURE_GRIEVANCE' | 'FEATURE_POSH' | 'FEATURE_REPORTS_ADVANCED'
  | 'FEATURE_EMAIL_NOTIFICATIONS' | 'FEATURE_PUSH_NOTIFICATIONS';

export type Features = Partial<Record<FeatureFlag, boolean>>;

/** Module keys still used inside unmigrated pages, mapped to the flag that controls each. */
const MODULE_TO_FLAG: Record<string, readonly FeatureFlag[]> = {
  accounting_exports: ['FEATURE_ACCOUNTING_EXPORTS'],
  advances_loans: ['FEATURE_LOANS', 'FEATURE_SALARY_ADVANCE'],
  assets: ['FEATURE_ASSET_MANAGEMENT'],
  attendance: ['FEATURE_ATTENDANCE'],
  'attendance.biometric': ['FEATURE_ATTENDANCE_BIOMETRIC'],
  'attendance.regularization': ['FEATURE_ATTENDANCE_REGULARIZATION'],
  'core.documents': ['FEATURE_DOCUMENTS'],
  'core.offboarding': ['FEATURE_OFFBOARDING'],
  'core.onboarding': ['FEATURE_ONBOARDING'],
  'core.policies': ['FEATURE_POLICIES'],
  expenses: ['FEATURE_EXPENSE_CLAIMS'],
  field_duty: ['FEATURE_FIELD_DUTY'],
  grievance: ['FEATURE_GRIEVANCE'],
  holidays: ['FEATURE_HOLIDAYS'],
  'lab.competency': ['FEATURE_LAB_COMPETENCY'],
  leave: ['FEATURE_LEAVE'],
  'notifications.email': ['FEATURE_EMAIL_NOTIFICATIONS'],
  overtime: ['FEATURE_OVERTIME'],
  payroll: ['FEATURE_PAYROLL'],
  'payroll.payslips': ['FEATURE_PAYSLIPS'],
  'payroll.statutory': ['FEATURE_PAYROLL_STATUTORY'],
  performance: ['FEATURE_PERFORMANCE_REVIEW'],
  posh: ['FEATURE_POSH'],
  recruitment: ['FEATURE_RECRUITMENT'],
  'reports.advanced': ['FEATURE_REPORTS_ADVANCED'],
  shifts: ['FEATURE_SHIFTS'],
  training: ['FEATURE_TRAINING'],
  travel: ['FEATURE_TRAVEL'],
};

/** Off unless the server says on. An unknown module key is off, so a stale check hides rather than shows. */
export function moduleEnabled(features: Features, key: string): boolean {
  return (MODULE_TO_FLAG[key] ?? []).some((flag) => features[flag] === true);
}

/** Any listed flag on. A route with no flags is always on (employee records, approvals, audit). */
export function anyFlagOn(features: Features, flags: readonly FeatureFlag[] | undefined): boolean {
  return !flags?.length || flags.some((f) => features[f] === true);
}
