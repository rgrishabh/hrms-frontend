import type { BadgeTone } from '../../components/Badge';

export const ACTIVITY: Record<string, string> = { sampling: 'Sampling', perform: 'Perform test', review: 'Review results', authorize_report: 'Authorize reports' };
export const ACTIVITY_SHORT: Record<string, string> = { sampling: 'S', perform: 'P', review: 'R', authorize_report: 'A' };
export const APPROACH: Record<string, string> = { witnessed: 'Witnessed performance', replicate: 'Replicate / CRM analysis', retained_sample: 'Retained sample retest', proficiency_test: 'Proficiency test', interlab_comparison: 'Interlaboratory comparison', written: 'Written / oral test', other: 'Other' };
export const RESULT_LABEL: Record<string, string> = { competent: 'Competent', not_yet_competent: 'Not yet competent' };
export const asOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export const COURSE_KIND: Record<string, string> = { induction: 'Induction', safety: 'Safety', quality: 'Quality', external: 'External', other: 'Other' };
/** Kinds that only mean something with competency records switched on. */
export const LAB_COURSE_KIND: Record<string, string> = { method: 'Method', instrument: 'Instrument' };

const VALIDITY_TONE: Record<string, BadgeTone> = { valid: 'ok', expiring: 'warn', expired: 'danger', failed: 'danger', revoked: 'neutral' };
export const validityTone = (v: string): BadgeTone => VALIDITY_TONE[v] ?? 'neutral';

export interface MyAuthorization { id: string; method_code: string; method_name: string; standard_ref: string | null; activity: string; status: string; valid_from: string | null; review_due: string | null }
export interface MyTraining { id: string; course_code: string; course_name: string; completed_on: string; expires_on: string | null; result: string; validity: string }
export interface Mine { authorizations: MyAuthorization[]; training: MyTraining[] }

export interface MatrixMethod { id: string; code: string; name: string; discipline: string | null; matrix: string | null }
export interface MatrixCell { status: string; reviewDue: string | null; inForce: boolean }
export interface MatrixRow { employeeId: string; employeeCode: string; name: string; cells: Record<string, Record<string, MatrixCell>> }
export interface MatrixData { methods: MatrixMethod[]; rows: MatrixRow[] }

export interface AuthorizationRow { id: string; employee_id: string; employee_code: string; employee_name: string; method_code: string; method_name: string; activity: string; status: string; review_due: string | null; missing_training: number }
export interface AuthorizationDetailData {
  id: string; employee_id: string; employee_name: string; method_code: string; method_name: string; activity: string; status: string; review_due: string | null; requested_by: string | null;
  check: { authorized: boolean; reasons: string[]; reviewDue: string | null } | null;
  assessment: { approach: string; assessed_on: string; result: string; evidence: string; assessor_name: string } | null;
  events: { action: string; reason: string | null; at: string; actor_name: string | null }[];
}

export interface AssessmentRow { id: string; employee_id: string; employee_name: string; employee_code: string; method_code: string; method_name: string; activity: string; approach: string; assessed_on: string; result: string; evidence: string; assessor_name: string; used: boolean }

export interface TrainingRecord { id: string; employee_id: string; employee_code: string; employee_name: string; course_code: string; course_name: string; completed_on: string; expires_on: string | null; validity: string; status: string; trainer: string | null; provider: string | null }

export interface Course { id: string; code: string; name: string; kind: string; description: string | null; validity_months: number | null; status: string; records: number }
export interface Method { id: string; code: string; name: string; standard_ref: string | null; discipline: string | null; matrix: string | null; review_months: number; status: string; requirements: { id: string; code: string; name: string }[] }

export const AUTH_URL = '/api/v1/competency';
