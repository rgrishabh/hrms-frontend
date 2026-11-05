import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export type ColType = 'text' | 'int' | 'number' | 'percent' | 'money' | 'date';
type ReportApi = ApiResponse<'/api/v1/reports/{key}'>;
export type ReportColumn = Refine<ReportApi['columns'][number], { type: ColType }>;
type Catalogue = ApiResponse<'/api/v1/reports'>;
type ApiReportInfo = Catalogue['items'][number];
/** A default is a number on an `int` option, though the spec says string. */
export type ParamDef = Refine<ApiReportInfo['params'][number], { type: 'date' | 'month' | 'select' | 'int'; default: string | number }>;
export type ReportInfo = Refine<ApiReportInfo, { params: ParamDef[] }>;
export type ReportCatalogue = Refine<Catalogue, { items: ReportInfo[] }>;
/** Keyed by the report's own columns. A row whose figures are withheld also carries `masked` and `maskedFields`. */
export type ReportRow = Record<string, unknown>;
type Rows = { columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow | null };
export type ReportData = Refine<ReportApi, Rows>;
export type ReportCopy = Refine<ApiResponse<'/api/v1/reports/snapshots/{id}'>, Rows>;
/** What a report and a stored copy of one have in common on screen. */
export type ReportResult = Pick<ReportData, 'name' | 'generatedAt' | 'columns' | 'rows' | 'totals' | 'notes' | 'truncated' | 'excluded'>;
type ApiSaved = ApiItem<'/api/v1/reports/saved'>;
/** The spec has `unknown` where it only saw nulls. */
export type Schedule = Refine<NonNullable<ApiSaved['schedule']>, { frequency: 'daily' | 'weekly' | 'monthly'; weekday: number | null; dayOfMonth: number | null; lastResult: string | null }>;
export type SavedReport = Refine<ApiSaved, { params: Record<string, string | number>; schedule: Schedule | null }>;
export type Snapshot = ApiItem<'/api/v1/reports/snapshots'>;
