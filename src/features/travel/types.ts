import type { ApiResponse, Refine } from '../../lib/api-types';
import { fmtDate } from '../../format';

export const MODE: Record<string, string> = { air: 'Air', rail: 'Rail', bus: 'Bus', road: 'Road (taxi / company vehicle)', own_vehicle: 'Own vehicle', other: 'Other' };
export const ESTIMATE_PARTS: readonly (readonly ['travel' | 'stay' | 'local' | 'meals' | 'other', string])[] = [['travel', 'Tickets / fuel'], ['stay', 'Stay'], ['local', 'Local conveyance'], ['meals', 'Meals'], ['other', 'Other']];
export const STATUSES = ['pending', 'approved', 'completed', 'closed', 'returned', 'rejected', 'cancelled'] as const;

type Detail = ApiResponse<'/api/v1/travel/requests/{id}'>;

/** The schema says `department: string`; the route left-joins departments, so it can be null. */
export type TripDetailData = Refine<Detail, { department: string | null }>;
export type Settlement = Detail['settlement'];

/** The list's rows have no schema of their own. The route selects the same columns as the detail, without the settlement. */
export type Trip = Refine<TripDetailData, { settlement?: never }>;
export type TripPage = Refine<ApiResponse<'/api/v1/travel/requests'>, { items: Trip[] }>;

export const TRIPS_URL = '/api/v1/travel/requests';
export const tripWhen = (t: Pick<Trip, 'start_date' | 'end_date'>) => (t.start_date === t.end_date ? fmtDate(t.start_date) : `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}`);
export const tripRoute = (t: Pick<Trip, 'origin' | 'destination'>) => `${t.origin} → ${t.destination}`;
