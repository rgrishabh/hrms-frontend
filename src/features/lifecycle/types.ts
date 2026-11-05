import type { SelectOption } from '../../components/Select';

export const OWNER: Record<string, string> = { hr: 'HR', it: 'IT', admin: 'Admin', finance: 'Finance', manager: 'Manager', employee: 'New joiner / leaver' };
export const SEP_KIND: Record<string, string> = { resignation: 'Resignation', termination: 'Termination', retirement: 'Retirement', contract_end: 'Contract end', death: 'Death', absconding: 'Absconding', mutual: 'Mutual separation' };
export const RECOMMENDATION: Record<string, string> = { confirm: 'Confirm', extend: 'Extend', terminate: 'Terminate' };
export const options = (labels: Record<string, string>): SelectOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

export interface MyTask { id: string; title: string; description: string | null; owner: string; due_date: string; checklist_id: string; kind: string; employee_name: string }
export interface ChecklistTask { id: string; title: string; owner: string; due_date: string; status: string; note: string | null; done_by_name: string | null; done_at: string | null; canAct: boolean }
export interface Checklist { id: string; kind: 'onboarding' | 'offboarding'; status: string; anchor_date: string; separation_id: string | null; employee: { id: string; name: string; status: string }; tasks: ChecklistTask[] }
export interface ChecklistRow { id: string; status: string; anchor_date: string; employee_name: string; employee_code: string; done: number; tasks: number; overdue: number }
export interface ProbationRow { id: string; employee_id: string; employee_name: string; employee_code: string; designation: string | null; date_of_joining: string; probation_end: string; recommendation: string | null; extend_months: number | null; comments: string | null; status: string }
export interface SeparationRow { id: string; kind: string; status: string; employee_name: string; employee_code: string; notice_date: string; requested_lwd: string; approved_lwd: string | null; shortfall_days: number; waive_shortfall: boolean; fnf_status: string }
export interface Separation extends Omit<SeparationRow, 'employee_name' | 'employee_code'> {
  initiated_by: string; initiated_by_name: string; employee: { id: string; name: string; status: string }; masked?: boolean; maskedFields?: string[]; reason: string | null; notice_days_required: number; fnf_note: string | null;
  checklist: { id: string; status: string; tasks: { status: string }[] } | null; leaveBalances?: { code: string; balance: number | string }[] | null; exit_interview?: Record<string, unknown> | null;
}
export interface TemplateTask { title: string; description: string | null; owner: string; offsetDays: number | string }
export interface Template { id: string; kind: string; name: string; is_default: boolean; status: string; tasks: TemplateTask[] }
