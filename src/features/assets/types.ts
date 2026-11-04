export type AssetCategory = 'lab_instrument' | 'it' | 'ppe' | 'vehicle' | 'furniture' | 'tool' | 'other';

export interface Asset {
  id: string; tag: string; name: string; category: AssetCategory; serial_number: string | null; status: string; purchase_date: string | null; calibration_due: string | null; notes: string | null;
  branch_id: string | null; branch_name: string | null; holder_id: string | null; holder_name: string | null; issued_at: string | null; due_back: string | null; acknowledged_at: string | null;
}

export interface MyAsset { id: string; tag: string; name: string; category: AssetCategory; serial_number: string | null; issued_at: string; due_back: string | null; condition_out: string | null; acknowledged_at: string | null }

export interface AssetHistoryItem {
  id: string; employee_name: string; employee_code: string; issued_at: string; condition_out: string | null; due_back: string | null; returned_at: string | null; condition_in: string | null; outcome: string | null; acknowledged_at: string | null; issued_by_name: string; received_by_name: string | null;
}

export const ASSETS_URL = '/api/v1/assets';
export const STATUS: Record<string, string> = { available: 'Available', assigned: 'Issued', in_repair: 'In repair', retired: 'Retired', lost: 'Lost' };
export const OUTCOME: Record<string, string> = { returned: 'Returned', lost: 'Lost', damaged: 'Damaged' };
