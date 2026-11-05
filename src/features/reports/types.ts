import type { Maskable } from '../../lib/masking';

export type ColType = 'text' | 'int' | 'number' | 'percent' | 'money' | 'date';
export interface ReportColumn { key: string; label: string; type: ColType }
export interface ParamDef { key: string; label: string; type: 'date' | 'month' | 'select' | 'int'; options?: { value: string; label: string }[]; min?: number; max?: number; default: string | number }
export interface ReportInfo { key: string; name: string; description: string; category: string; scope: 'all' | 'team'; params: ParamDef[] }
export type ReportRow = Record<string, unknown>;
export interface ReportData extends Maskable { excluded?: number; key?: string; name: string; generatedAt: string; scope?: 'all' | 'team'; params?: Record<string, string | number>; columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow | null; notes: string[]; truncated: boolean }
export interface Schedule { frequency: 'daily' | 'weekly' | 'monthly'; weekday: number | null; dayOfMonth: number | null; period: string; enabled: boolean; nextRunOn: string; recipientIds: string[]; lastResult: string | null }
export interface SavedReport { id: string; name: string; report_key: string; reportName: string; params: Record<string, string>; schedule: Schedule | null }
export interface Snapshot { id: string; name: string; owner: string; generated_at: string; row_count: number }
