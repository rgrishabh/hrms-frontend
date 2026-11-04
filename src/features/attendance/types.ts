export interface AttendanceEvent { id: string; direction: string; event_time: string; source: string; status: string }

export interface DailyResult {
  work_date: string; status: string; shift_code: string | null; first_in: string | null; last_out: string | null; worked_minutes: number; late_minutes: number; early_exit_minutes: number; overtime_minutes: number;
  leave_fraction: number | string; leave_type_code: string | null; duty_fraction: number | string; exceptions: string[]; locked?: boolean;
}

export interface Regularization { id: string; work_date: string; requested_in: string | null; requested_out: string | null; reason: string; status: string }
