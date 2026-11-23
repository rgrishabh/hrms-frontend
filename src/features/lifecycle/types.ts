import type { SelectOption } from '../../components/Select';
import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export const OWNER: Record<string, string> = { hr: 'HR', it: 'IT', admin: 'Admin', finance: 'Finance', manager: 'Manager', employee: 'New joiner / leaver' };
export const SEP_KIND: Record<string, string> = { resignation: 'Resignation', termination: 'Termination', retirement: 'Retirement', contract_end: 'Contract end', death: 'Death', absconding: 'Absconding', mutual: 'Mutual separation' };
export const RECOMMENDATION: Record<string, string> = { confirm: 'Confirm', extend: 'Extend', terminate: 'Terminate' };
export const options = (labels: Record<string, string>): SelectOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

export type MyTask = ApiItem<'/api/v1/lifecycle/tasks/mine'>;
export type Checklist = ApiResponse<'/api/v1/lifecycle/checklists/{id}'>;
export type ChecklistTask = Checklist['tasks'][number];
export type ChecklistRow = ApiItem<'/api/v1/lifecycle/checklists'>;
export type ProbationRow = ApiItem<'/api/v1/lifecycle/probation'>;
export type SeparationRow = ApiItem<'/api/v1/lifecycle/separations'>;
/** The exit interview holds whatever was asked: free question keys, plus bookkeeping keys starting with an underscore. */
export type Separation = Refine<ApiResponse<'/api/v1/lifecycle/separations/{id}'>, { exit_interview?: Record<string, unknown> | null }>;
export type Template = ApiItem<'/api/v1/lifecycle/templates'>;
/** A task being edited, where the days are whatever is typed so far. */
export interface TemplateTask { title: string; description: string | null; owner: string; offsetDays: number | string }
