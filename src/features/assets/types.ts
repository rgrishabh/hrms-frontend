import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export type AssetCategory = 'lab_instrument' | 'it' | 'ppe' | 'vehicle' | 'furniture' | 'tool' | 'other';

/** The schema says `string` for category; forms and labels rely on the closed set. */
export type Asset = Refine<ApiItem<'/api/v1/assets'>, { category: AssetCategory }>;
export type AssetPage = Refine<ApiResponse<'/api/v1/assets'>, { items: Asset[] }>;

export type MyAsset = Refine<ApiItem<'/api/v1/assets/mine'>, { category: AssetCategory }>;
export type MyAssetList = Refine<ApiResponse<'/api/v1/assets/mine'>, { items: MyAsset[] }>;

export type AssetHistoryItem = ApiItem<'/api/v1/assets/{id}/history'>;

export const ASSETS_URL = '/api/v1/assets';
export const STATUS: Record<string, string> = { available: 'Available', assigned: 'Issued', in_repair: 'In repair', retired: 'Retired', lost: 'Lost' };
export const OUTCOME: Record<string, string> = { returned: 'Returned', lost: 'Lost', damaged: 'Damaged' };
