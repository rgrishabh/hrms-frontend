import type { SelectOption } from '../../components/Select';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';

export type Org = ApiResponse<'/api/v1/org'>;
export type OrgItem = Org['legalEntities' | 'branches' | 'departments'][number];

/** GET /org, shared by every page that filters or assigns by branch, department or legal entity. */
export const useOrg = (enabled = true) => useApiQuery<Org>(enabled ? '/api/v1/org' : null);

export const orgOptions = (items: readonly OrgItem[] | undefined): SelectOption[] => (items ?? []).map((o) => ({ value: o.id, label: o.name }));
