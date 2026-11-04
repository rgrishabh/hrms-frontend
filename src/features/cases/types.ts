export type CaseKind = 'posh' | 'grievance';

export const POSH_CAT: Record<string, string> = { verbal: 'Verbal', physical: 'Physical', non_verbal: 'Non-verbal or gestures', quid_pro_quo: 'Quid pro quo', hostile_environment: 'Hostile environment', online: 'Online or messages', other: 'Other' };
export const GR_CAT: Record<string, string> = { pay: 'Pay', leave: 'Leave', workload: 'Workload', manager: 'Manager', colleague: 'Colleague', safety: 'Safety', facilities: 'Facilities', discrimination: 'Discrimination', policy: 'Policy', other: 'Other' };
export const STATUS: Record<string, string> = { received: 'Received', conciliation: 'Conciliation', inquiry: 'Inquiry', report_submitted: 'Report submitted', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', reopened: 'Reopened', closed: 'Closed', withdrawn: 'Withdrawn' };
export const STATUS_BY_KIND: Record<CaseKind, readonly string[]> = { posh: ['received', 'conciliation', 'inquiry', 'report_submitted', 'closed', 'withdrawn'], grievance: ['open', 'in_progress', 'resolved', 'reopened', 'closed', 'withdrawn'] };
export const categoryLabel = (kind: string, category: string) => (kind === 'posh' ? POSH_CAT : GR_CAT)[category] ?? category;
export const isClosed = (status: string) => status === 'closed' || status === 'withdrawn';

export interface CaseRow {
  id: string; kind: CaseKind; reference: string; category: string; status: string; anonymous: boolean; received_at: string;
  inquiry_due: string | null; report_due: string | null; sla_due: string | null; complainant_name: string | null; assignee_name: string | null;
}

export interface CaseEvent { type: string; text: string | null; from_status: string | null; to_status: string | null; visible_to_complainant: boolean; at: string; actor: string | null }

export interface CaseDetailData {
  id: string; kind: CaseKind; reference: string; category: string; status: string; anonymous: boolean; role: 'handler' | 'complainant'; version: number;
  complainantName: string | null; respondentName?: string | null; respondentText?: string | null; incidentDate: string | null; description: string | null; lateReason: string | null; outcome: string | null;
  receivedAt: string; inquiryDue: string | null; reportDue: string | null; slaDue: string | null; assigneeName: string | null; allowedMoves: string[]; events: CaseEvent[];
}

export interface CommitteeMember { user_id: string; display_name: string; role: 'presiding_officer' | 'member' }
export interface ExternalMember { id: string; name: string; organization: string; since: string }
export interface CommitteeData { members: CommitteeMember[]; external: ExternalMember[]; warnings: string[] }
export interface AnnualReport { year: number; received: number; disposed: number; pending: number; pending_over_90: number }

export const CASES_URL = '/api/v1/cases';
