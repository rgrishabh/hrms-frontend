import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export type CaseKind = 'posh' | 'grievance';

export const POSH_CAT: Record<string, string> = { verbal: 'Verbal', physical: 'Physical', non_verbal: 'Non-verbal or gestures', quid_pro_quo: 'Quid pro quo', hostile_environment: 'Hostile environment', online: 'Online or messages', other: 'Other' };
export const GR_CAT: Record<string, string> = { pay: 'Pay', leave: 'Leave', workload: 'Workload', manager: 'Manager', colleague: 'Colleague', safety: 'Safety', facilities: 'Facilities', discrimination: 'Discrimination', policy: 'Policy', other: 'Other' };
export const STATUS: Record<string, string> = { received: 'Received', conciliation: 'Conciliation', inquiry: 'Inquiry', report_submitted: 'Report submitted', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', reopened: 'Reopened', closed: 'Closed', withdrawn: 'Withdrawn' };
export const STATUS_BY_KIND: Record<CaseKind, readonly string[]> = { posh: ['received', 'conciliation', 'inquiry', 'report_submitted', 'closed', 'withdrawn'], grievance: ['open', 'in_progress', 'resolved', 'reopened', 'closed', 'withdrawn'] };
export const categoryLabel = (kind: string, category: string) => (kind === 'posh' ? POSH_CAT : GR_CAT)[category] ?? category;
export const isClosed = (status: string) => status === 'closed' || status === 'withdrawn';

/** Each row's kind is one of the two, though the schema says string. */
export type CaseRow = Refine<ApiItem<'/api/v1/cases'>, { kind: CaseKind }>;
type ApiCase = ApiResponse<'/api/v1/cases/{id}'>;
/** The spec has actor as a string, but an event no user made has none. */
export type CaseEvent = Refine<ApiCase['events'][number], { actor: string | null }>;
/** The spec has description as a string, but it reads back null where the text is gone. */
export type CaseDetailData = Refine<ApiCase, { kind: CaseKind; role: 'handler' | 'complainant'; description: string | null; events: CaseEvent[] }>;
type ApiCommittee = ApiResponse<'/api/v1/cases/committee'>;
export type CommitteeMember = Refine<ApiCommittee['members'][number], { role: 'presiding_officer' | 'member' }>;
export type CommitteeData = Refine<ApiCommittee, { members: CommitteeMember[] }>;
export type AnnualReport = ApiResponse<'/api/v1/cases/posh/annual-report'>;
export type CaseList = Refine<ApiResponse<'/api/v1/cases'>, { items: CaseRow[] }>;

export const CASES_URL = '/api/v1/cases';
