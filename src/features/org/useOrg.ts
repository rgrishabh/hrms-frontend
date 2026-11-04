import type { SelectOption } from '../../components/Select';
import { useApiQuery } from '../../lib/query';

export interface OrgItem { id: string; name: string; code?: string | null; status?: string; legal_entity_id?: string; version?: number }
export interface Org { legalEntities: OrgItem[]; branches: OrgItem[]; departments: OrgItem[] }

/** GET /org, shared by every page that filters or assigns by branch, department or legal entity. */
export const useOrg = (enabled = true) => useApiQuery<Org>(enabled ? '/api/v1/org' : null);

export const orgOptions = (items: readonly OrgItem[] | undefined): SelectOption[] => (items ?? []).map((o) => ({ value: o.id, label: o.name }));
