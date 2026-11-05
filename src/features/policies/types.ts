import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';
export const CATEGORY: Record<string, string> = { hr: 'HR', code_of_conduct: 'Code of conduct', posh: 'POSH', safety: 'Health & safety', quality: 'Quality', it_security: 'IT security', data_protection: 'Data protection', other: 'Other' };
export const CATEGORY_OPTIONS = Object.entries(CATEGORY).map(([value, label]) => ({ value, label }));
export const POLICIES_URL = '/api/v1/policies';

/** due_on comes from published_at, which the schema allows to be null. */
export type MyPolicy = Refine<ApiItem<'/api/v1/policies/mine'>, { due_on: string | null }>;
export type MyPolicies = Refine<ApiResponse<'/api/v1/policies/mine'>, { items: MyPolicy[] }>;
export type PolicyVersionView = ApiResponse<'/api/v1/policies/versions/{id}'>;
/** The published version comes from a left join, so a policy with none has null in all of these; the schema says otherwise. */
export type PolicyRow = Refine<ApiItem<'/api/v1/policies'>, { published_version: number | null; published_version_id: string | null; effective_from: string | null; requires_ack: boolean | null; audience: number | null; acknowledged: number | null }>;
export type Policies = Refine<ApiResponse<'/api/v1/policies'>, { items: PolicyRow[] }>;
export type PolicyDetailData = ApiResponse<'/api/v1/policies/{id}'>;
export type PolicyVersion = PolicyDetailData['versions'][number];
/** Branch and department are left joins too. */
export type AckRow = Refine<ApiItem<'/api/v1/policies/versions/{id}/acknowledgements'>, { branch: string | null; department: string | null }>;
export type AckPage = Refine<ApiResponse<'/api/v1/policies/versions/{id}/acknowledgements'>, { items: AckRow[] }>;
