import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { orgOptions, useOrg } from '../org/useOrg';
import { EMP_TYPE_OPTIONS, type OrgValues } from './types';

/** Legal entity, branch, department and type. A failed org load says so, with a retry, instead of loading forever. */
export function OrgFields({ v, set, errors }: { v: OrgValues; set: (p: Partial<OrgValues>) => void; errors: Record<string, string> }) {
  const org = useOrg();
  return (
    <QueryState query={org} compact loading={<SkeletonRows rows={2} />}>
      {(o) => (
        <div className="columns-form">
          <Select label="Legal entity" required placeholder="Select…" error={errors['legalEntityId']} value={v.legalEntityId} options={orgOptions(o.legalEntities)} onChange={(e) => set({ legalEntityId: e.target.value, branchId: '' })} />
          <Select label="Branch" required placeholder="Select…" error={errors['branchId']} value={v.branchId} options={orgOptions(o.branches.filter((b) => !v.legalEntityId || b.legal_entity_id === v.legalEntityId))} onChange={(e) => set({ branchId: e.target.value })} />
          <Select label="Department" placeholder="None" error={errors['departmentId']} value={v.departmentId ?? ''} options={orgOptions(o.departments)} onChange={(e) => set({ departmentId: e.target.value || null })} />
          <Select label="Employment type" error={errors['employmentType']} value={v.employmentType} options={EMP_TYPE_OPTIONS} onChange={(e) => set({ employmentType: e.target.value })} />
        </div>
      )}
    </QueryState>
  );
}
