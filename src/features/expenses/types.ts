export const VEHICLE: Record<string, string> = { car: 'Car', two_wheeler: 'Two-wheeler' };

export type ClaimScope = 'mine' | 'team';

export interface ClaimRow {
  id: string; title: string; status: string; employee_name: string; items: number; total: string | number; flagged: number;
  created_at: string; submitted_at?: string | null; approved_at?: string | null; paid_at?: string | null;
}

export interface ClaimItem {
  id: string; expense_date: string; category_name: string; description: string; amount: string | number; has_receipt: boolean;
  calc?: 'per_diem' | 'mileage' | null; quantity?: string | number | null; rate?: string | number | null; tier?: string | null; vehicle?: string | null;
  merchant?: string | null; invoice_number?: string | null; gstin?: string | null; duplicate_of?: string | null;
}

export interface Claim {
  id: string; title: string; status: string; employee_id: string; employee_name: string; purpose: string; project: string | null; total: string | number;
  payment_reference?: string | null; travel_request_id?: string | null; advance_adjusted?: string | number | null; editable: boolean; items: ClaimItem[];
}

export interface ExpenseCategory {
  id: string; code: string; name: string; description: string | null; requires_receipt: boolean; max_amount: string | number | null; gst_applicable: boolean; status: string; calc: 'per_diem' | 'mileage' | null;
}

export interface Payable { id: string; employee_name: string; employee_code: string; title: string; payable: string | number; total: string | number; advance_adjusted: string | number; approved_at: string; age_days: number }

export interface Batch {
  id: string; status: string; total: string | number; claim_count: number; created_at: string; payment_reference?: string | null;
  prepared_by: string; prepared_by_name: string; approved_by_name?: string | null; paid_by_name?: string | null;
}

export interface Ageing {
  pipeline: { status: string; amount: string | number; claims: number }[];
  approvedUnpaidByAge: { bucket: string; amount: string | number; claims: number }[];
}

export interface AllowanceRate {
  id: string; kind: 'per_diem' | 'mileage'; tier: string | null; grade: string | null; vehicle: string | null; rate: string | number; effective_from: string;
  state: 'current' | 'scheduled' | 'superseded'; note: string | null; created_by_name: string | null;
}

export interface AllowanceRates { items: AllowanceRate[]; tiers: string[]; canManage: boolean }

export interface AllowanceQuote { rate: string | number | null; quantity?: string | number; amount?: string }

export const CLAIMS_URL = '/api/v1/expenses/claims';
export const CATEGORIES_URL = '/api/v1/expenses/categories';
export const RATES_URL = '/api/v1/expenses/allowance-rates';
