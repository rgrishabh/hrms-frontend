import type { SelectOption } from '../../components/Select';

export const STAGE_LABEL: Record<string, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected', withdrawn: 'Withdrawn' };
export const SOURCES: Record<string, string> = { job_portal: 'Job portal', referral: 'Employee referral', website: 'Company website', agency: 'Agency', campus: 'Campus', walk_in: 'Walk-in', other: 'Other' };
export const KINDS: Record<string, string> = { phone: 'Phone screen', technical: 'Technical', practical_lab: 'Practical test', hr: 'HR', panel: 'Panel', other: 'Other' };
export const RECOMMENDATION: Record<string, string> = { strong_yes: 'Strong yes', yes: 'Yes', no: 'No', strong_no: 'Strong no' };
const EMP_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];
export const EMP_TYPE_OPTIONS: SelectOption[] = EMP_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
export const REQ_STATUSES = ['draft', 'pending', 'approved', 'on_hold', 'closed', 'rejected', 'cancelled'];
export const options = (labels: Record<string, string>): SelectOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

export const personName = (c: { first_name: string; last_name?: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(' ');
export const years = (m: number | null | undefined) => (m == null ? '—' : `${(m / 12).toFixed(1)} yrs`);

export interface OrgValues { legalEntityId: string; branchId: string; departmentId: string | null; employmentType: string }

export interface RequisitionRow {
  id: string; code: string; title: string; designation: string | null; employment_type: string; branch_name: string; department_name?: string | null; hiring_manager_name?: string | null;
  filled: number; positions: number; pipeline?: Record<string, number>; status: string;
}
export interface RequisitionApplication { id: string; first_name: string; last_name: string | null; current_company: string | null; experience_months: number | null; source: string; avg_rating: number | string | null; stage: string }
export interface Requisition extends RequisitionRow {
  version: number; legal_entity_id: string; legal_entity_name?: string; branch_id: string; department_id: string | null; justification: string; budget_ctc_max: number | string | null;
  hiring_manager_id: string | null; target_date: string | null; created_by: string; created_by_name?: string; applications: RequisitionApplication[];
}
export interface RequisitionValues extends OrgValues {
  id?: string; code?: string; version?: number; title: string; designation: string; positions: number | string; justification: string; budgetCtcMax: number | string;
  hiringManagerId: string | null; hiringManagerName?: string | null; targetDate: string;
}

export interface CandidateRow {
  id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; current_designation: string | null; current_company: string | null;
  experience_months: number | null; source: string; applications: number; retain_until: string | null; employee_id?: string | null;
}
export interface Candidate extends Omit<CandidateRow, 'applications'> {
  location: string | null; notice_days: number | null; qualification: string | null; referred_by_name?: string | null; expected_ctc: number | string | null; consent_at: string | null; consent_note: string | null;
  has_resume: boolean; status: string; applications: { id: string; requisition_code: string; title: string; stage: string; updated_at: string }[];
}

export interface PanelMember { user_id: string; name: string; submitted_at: string | null; hidden?: boolean; rating: number | null; recommendation: string | null; notes: string | null }
export interface Interview { id: string; round: number; kind: string; status: string; scheduled_at: string; location: string | null; panel: PanelMember[] }
export interface Offer {
  id: string; designation: string; employment_type: string; annual_ctc: number | string | null; joining_date: string; probation_months: number | null; status: string; above_budget: boolean; notes: string | null;
  employee_id: string | null; branch_name: string; legal_entity_id?: string; branch_id?: string; department_id?: string | null; contract_end_date?: string | null;
}
export interface Application {
  id: string; stage: string; version: number; access: 'full' | 'panel' | string; requisition: { id: string; code: string; title: string; status: string };
  candidate: { id: string; first_name: string; last_name: string | null; current_designation: string | null; current_company: string | null; experience_months: number | null; qualification: string | null; has_resume: boolean };
  events: { at: string; from_stage: string | null; to_stage: string; actor_name: string | null; note: string | null }[]; interviews: Interview[]; offers: Offer[]; allowedMoves: string[];
}
export interface MyInterview { id: string; application_id: string; round: number; kind: string; scheduled_at: string; location: string | null; submitted_at: string | null; first_name: string; last_name: string | null; requisition_title: string; requisition_code: string }
