export const CATEGORY: Record<string, string> = { hr: 'HR', code_of_conduct: 'Code of conduct', posh: 'POSH', safety: 'Health & safety', quality: 'Quality', it_security: 'IT security', data_protection: 'Data protection', other: 'Other' };
export const CATEGORY_OPTIONS = Object.entries(CATEGORY).map(([value, label]) => ({ value, label }));
export const POLICIES_URL = '/api/v1/policies';

export interface MyPolicy { id: string; title: string; category: string; version_no: number; effective_from: string; change_summary: string; requires_ack: boolean; acknowledged_at: string | null; due_on: string | null }
export interface MyPolicies { items: MyPolicy[]; pending: number; overdue: number; date: string }
export interface PolicyVersionView { id: string; policyId: string; code: string; title: string; versionNo: number; status: string; body: string | null; fileName: string | null; hasFile: boolean; contentSha256: string; requiresAck: boolean; changeSummary: string; effectiveFrom: string; publishedAt: string | null; acknowledgedAt: string | null }
export interface PolicyRow { id: string; code: string; title: string; category: string; owner: string | null; status: string; published_version: number | null; effective_from: string | null; requires_ack: boolean | null; drafts: number; audience: number | null; acknowledged: number | null }
export interface PolicyVersion { id: string; version_no: number; status: string; change_summary: string; effective_from: string; requires_ack: boolean; audience_branch_ids: string[]; audience_department_ids: string[]; created_by: string; created_by_name: string; published_by_name: string | null; acknowledgements: number }
export interface PolicyDetailData { id: string; code: string; title: string; category: string; owner: string | null; status: string; versions: PolicyVersion[] }
export interface AckRow { employee_id: string; name: string; employee_code: string; branch: string | null; department: string | null; acknowledged_at: string | null }
