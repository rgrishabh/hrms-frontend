import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export const VEHICLE: Record<string, string> = { car: 'Car', two_wheeler: 'Two-wheeler' };

export type ClaimScope = 'mine' | 'team';

export type ClaimRow = ApiItem<'/api/v1/expenses/claims'>;
export type Claim = ApiResponse<'/api/v1/expenses/claims/{id}'>;
export type ClaimItem = Claim['items'][number];

export type ExpenseCategory = Refine<ApiItem<'/api/v1/expenses/categories'>, { calc: 'per_diem' | 'mileage' | null }>;
export type ExpenseCategories = Refine<ApiResponse<'/api/v1/expenses/categories'>, { items: ExpenseCategory[] }>;

export type Payable = ApiItem<'/api/v1/expenses/payables'>;
export type Batch = ApiItem<'/api/v1/expenses/batches'>;
export type Ageing = ApiResponse<'/api/v1/expenses/reports/ageing'>;

export type AllowanceRate = Refine<ApiItem<'/api/v1/expenses/allowance-rates'>, { kind: 'per_diem' | 'mileage'; state: 'current' | 'scheduled' | 'superseded' }>;
export type AllowanceRates = Refine<ApiResponse<'/api/v1/expenses/allowance-rates'>, { items: AllowanceRate[] }>;
export type AllowanceQuote = ApiResponse<'/api/v1/expenses/allowance-quote'>;

export const CLAIMS_URL = '/api/v1/expenses/claims';
export const CATEGORIES_URL = '/api/v1/expenses/categories';
export const RATES_URL = '/api/v1/expenses/allowance-rates';
