import type { Maskable } from '../../lib/masking';

export interface PayLine { kind: string; name: string; amount: number | string; basis?: string | null; code?: string }
export interface RunItem extends Maskable {
  id: string; employee_id: string; employee_code: string; employee_name: string; employed_days: number | string; lop_days: number | string; paid_days: number | string; gross: number | string | null; deductions: number | string | null; net: number | string | null;
  employer_cost: number | string | null; warnings: string[] | null; hold: boolean; hold_released_at?: string | null; lines: PayLine[] | null;
}
export interface Adjustment extends Maskable { id: string; employee_id: string; kind: 'earning' | 'deduction' | 'lop_days'; label: string; amount: number | string | null; taxable: boolean; note: string | null; created_by_name: string }
export interface RunTotals { employees?: number; gross?: number | string; net?: number | string; employerCost?: number | string }
export interface RunRow extends Maskable {
  id: string; period: string; kind: 'regular' | 'fnf'; status: string; totals: RunTotals | null; warnings: number; warnings_acknowledged: boolean; computed_at: string | null;
  legal_entity_name: string; employee_name: string | null; released_count: number;
  /** With reveal: people above the reader's level, left out of the figures. */
  excluded?: number;
}
export interface Run extends RunRow { employee_id: string | null; computed_by: string | null; items: RunItem[]; adjustments: Adjustment[]; attendanceLocked: boolean; page: number; pageSize: number; total: number }

export interface PayComponent { id: string; code: string; name: string; kind: 'earning' | 'deduction'; calc: 'fixed' | 'percent'; base_codes: string[]; prorate: boolean; taxable: boolean; pf_wage: boolean; esi_wage: boolean; position: number; status: string }
export interface Salary extends Maskable { id: string; effective_from: string; amounts: Record<string, number | string> | null; annual_ctc?: number | string | null; reason: string; status: string; created_by_name: string }
export interface Statutory extends Maskable { uan: string | null; pf_member_id: string | null; pf_excluded: boolean; esi_ip_number: string | null; pan: string | null; tax_regime: string; pt_state: string | null }
export type RuleKind = 'pf' | 'esi' | 'pt' | 'lwf' | 'tds';
export interface StatutoryRule { id: string; kind: RuleKind; scope: string; effective_from: string; effective_to: string | null; params: unknown; source_reference: string; status: string; created_by: string; created_by_name: string; verified_by_name: string | null }

export interface FnfSuggestion extends Maskable {
  lastWorkingDay: string; kind: string; noticeShortfallDays: number; shortfallWaived: boolean; leaveYear: number; leaveBalances: { code: string; name: string; paid: boolean; balance: number | string }[];
  salary: Record<string, number | string> | null; note: string; period: string; today: string;
}

export const RUNS_URL = '/api/v1/payroll/runs';
export const COMPONENTS_URL = '/api/v1/payroll/components';
