import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';
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

export type RequisitionPage = ApiResponse<'/api/v1/recruitment/requisitions'>;
export type RequisitionRow = RequisitionPage['items'][number];
export type Requisition = ApiResponse<'/api/v1/recruitment/requisitions/{id}'>;
export type RequisitionApplication = Requisition['applications'][number];
export interface RequisitionValues extends OrgValues {
  id?: string; code?: string; version?: number; title: string; designation: string; positions: number | string; justification: string; budgetCtcMax: number | string;
  hiringManagerId: string | null; hiringManagerName?: string | null; targetDate: string;
}

export type CandidatePage = ApiResponse<'/api/v1/recruitment/candidates'>;
export type CandidateRow = CandidatePage['items'][number];
export type Candidate = ApiResponse<'/api/v1/recruitment/candidates/{id}'>;

type ApiApplication = ApiResponse<'/api/v1/recruitment/applications/{id}'>;
export type Interview = ApiApplication['interviews'][number];
export type PanelMember = Interview['panel'][number];
export type Offer = ApiApplication['offers'][number];
/** The spec has actor_name as a string, but a move no user made has none. */
export type Application = Refine<ApiApplication, { events: Refine<ApiApplication['events'][number], { actor_name: string | null }>[] }>;
export type MyInterview = ApiItem<'/api/v1/recruitment/interviews/mine'>;
