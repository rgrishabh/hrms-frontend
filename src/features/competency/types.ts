import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';
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

type ApiMine = ApiResponse<'/api/v1/competency/me'>;
/** The spec has review dates as strings, but an authorization still pending has none. */
export type MyAuthorization = Refine<ApiMine['authorizations'][number], { review_due: string | null }>;
export type MyTraining = ApiMine['training'][number];
export type Mine = Refine<ApiMine, { authorizations: MyAuthorization[] }>;

type ApiMatrix = ApiResponse<'/api/v1/competency/matrix'>;
export type MatrixMethod = ApiMatrix['methods'][number];
/** The schema names the activities it saw; really a cell for each method, then each activity. */
export interface MatrixCell { status: string; reviewDue: string | null; inForce: boolean }
export type MatrixRow = Refine<ApiMatrix['rows'][number], { cells: Record<string, Record<string, MatrixCell>> }>;
export type MatrixData = Refine<ApiMatrix, { rows: MatrixRow[] }>;

export type AuthorizationRow = Refine<ApiItem<'/api/v1/competency/authorizations'>, { review_due: string | null; valid_from: string | null }>;
export type AuthorizationPage = Refine<ApiResponse<'/api/v1/competency/authorizations'>, { items: AuthorizationRow[] }>;
type ApiAuthorization = ApiResponse<'/api/v1/competency/authorizations/{id}'>;
export type AuthorizationDetailData = Refine<ApiAuthorization, { check: Refine<NonNullable<ApiAuthorization['check']>, { reviewDue: string | null }> | null }>;

export type AssessmentRow = ApiItem<'/api/v1/competency/assessments'>;

export type TrainingRecord = ApiItem<'/api/v1/competency/training-records'>;

export type Course = ApiItem<'/api/v1/competency/courses'>;
export type Method = ApiItem<'/api/v1/competency/methods'>;

export const AUTH_URL = '/api/v1/competency';
