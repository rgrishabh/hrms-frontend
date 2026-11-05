import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

type Month = ApiResponse<'/api/v1/attendance/me'>;

export type AttendanceEvent = Month['events'][number];

/** The schema says `shift_code` is always a string; the route left-joins shifts, so a day without a shift answers null. */
export type DailyResult = Refine<Month['days'][number], { shift_code: string | null }>;

/** What /attendance/me and /attendance/employees/{id} both answer: the one query behind them. */
export type AttendanceMonth = Refine<Month, { days: DailyResult[] }>;

/** The schema has no masking here; the route answers `reason: null` with `masked` for a reader who may not see it. */
export type Regularization = Refine<ApiItem<'/api/v1/attendance/regularizations'>, { reason: string | null; masked?: boolean; maskedFields?: string[] }>;

export type Shift = ApiItem<'/api/v1/attendance/shifts'>;
