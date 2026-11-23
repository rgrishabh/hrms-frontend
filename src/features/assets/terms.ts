import { useAuth } from '../../auth';
import type { SelectOption } from '../../components/Select';
import type { AssetCategory } from './types';

const BASE: Record<Exclude<AssetCategory, 'lab_instrument'>, string> = { it: 'IT equipment', ppe: 'PPE', vehicle: 'Vehicle', furniture: 'Furniture', tool: 'Tool', other: 'Other' };

export interface AssetTerms {
  lab: boolean;
  description: string;
  dueLabel: string;
  dueFilter: string;
  overdueWord: string;
  categoryLabel: (c: AssetCategory) => string;
  /** The category list for a form or filter. An existing record keeps its own category even when the lab flag is off. */
  categoryOptions: (current?: AssetCategory) => SelectOption[];
}

/**
 * The product is white-label: lab words appear only behind FEATURE_LAB_COMPETENCY. The API keeps its
 * `lab_instrument` value and `calibration_due` field, so this is purely what people read.
 */
export function useAssetTerms(): AssetTerms {
  const { hasFeature } = useAuth();
  const lab = hasFeature('FEATURE_LAB_COMPETENCY');
  const label = (c: AssetCategory) => (c === 'lab_instrument' ? (lab ? 'Lab instrument' : 'Instrument') : BASE[c]);
  return {
    lab,
    description: lab ? 'Laboratory instruments, IT equipment and PPE: who holds what, calibration due dates, issue and return.' : 'Equipment and other company property: who holds what, service due dates, issue and return.',
    dueLabel: lab ? 'Calibration due' : 'Service due',
    dueFilter: lab ? 'Calibration' : 'Service',
    overdueWord: lab ? 'expired' : 'overdue',
    categoryLabel: label,
    categoryOptions: (current) => {
      const keys = Object.keys(BASE) as AssetCategory[];
      const all: AssetCategory[] = lab || current === 'lab_instrument' ? ['lab_instrument', ...keys] : keys;
      return all.map((value) => ({ value, label: label(value) }));
    },
  };
}
