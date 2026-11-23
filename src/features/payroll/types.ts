import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export type RunRow = ApiItem<'/api/v1/payroll/runs'>;
export type Run = ApiResponse<'/api/v1/payroll/runs/{id}'>;
export type RunItem = Run['items'][number];
export type Adjustment = Run['adjustments'][number];

export type PayComponent = ApiItem<'/api/v1/payroll/components'>;
export type Salary = ApiItem<'/api/v1/payroll/employees/{id}/salaries'>;
export type Statutory = ApiResponse<'/api/v1/payroll/employees/{id}/statutory'>;
export type RuleKind = 'pf' | 'esi' | 'pt' | 'lwf' | 'tds';
/** Each kind of rule has its own params, and the schema describes only one of them. The screen shows them as JSON. */
export type StatutoryRule = Refine<ApiItem<'/api/v1/payroll/statutory-rules'>, { kind: RuleKind; params: unknown }>;

export type FnfSuggestion = ApiResponse<'/api/v1/payroll/fnf-suggestions/{employeeId}'>;

export const RUNS_URL = '/api/v1/payroll/runs';
export const COMPONENTS_URL = '/api/v1/payroll/components';
