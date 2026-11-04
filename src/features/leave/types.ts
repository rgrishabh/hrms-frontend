export interface LeaveBalance { id: string; name: string; code: string; paid: boolean; requires_balance: boolean; allow_half_day: boolean; available: number | string; used: number | string; pending: number | string }
export interface LeaveRequest { id: string; type_name: string; start_date: string; end_date: string; start_half: string; end_half: string; days: number | string; reason: string; status: string }
export interface LeaveCalendarItem { employee_id: string; name: string; employee_code: string; type_code: string; status: string; start_date: string; end_date: string; start_half: string; end_half: string }
export interface LeaveType {
  id: string; code: string; name: string; description: string | null; paid: boolean; allow_half_day: boolean; requires_balance: boolean; accrual_method: string; annual_entitlement: number | string; carry_forward_max: number | string;
  max_balance: number | string | null; count_non_working_days: boolean; min_notice_days: number; max_consecutive_days: number | string | null; eligible_after_days: number; applicable_employment_types: string[]; status: string;
}
