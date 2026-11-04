import { fmtDate } from '../../format';

export const MODE: Record<string, string> = { air: 'Air', rail: 'Rail', bus: 'Bus', road: 'Road (taxi / company vehicle)', own_vehicle: 'Own vehicle', other: 'Other' };
export const ESTIMATE_PARTS: readonly (readonly ['travel' | 'stay' | 'local' | 'meals' | 'other', string])[] = [['travel', 'Tickets / fuel'], ['stay', 'Stay'], ['local', 'Local conveyance'], ['meals', 'Meals'], ['other', 'Other']];
export const STATUSES = ['pending', 'approved', 'completed', 'closed', 'returned', 'rejected', 'cancelled'] as const;

export interface Trip {
  id: string; employee_id: string; name: string; employee_code: string; department: string | null; start_date: string; end_date: string; origin: string; destination: string; purpose: string; project?: string | null;
  travel_mode: string; trip_type: string; estimate_total: string | number; advance_requested: string | number; advance_paid_at: string | null; advance_reference: string | null; status: string;
}

export interface Settlement {
  advancePaid: string | number; claimed: string | number; advanceAdjusted: string | number; reimbursable: string | number; recovered: string | number; outstanding: string | number;
  claims: { id: string; title: string; total: string | number; status: string }[];
}

export interface TripDetailData extends Trip {
  on_duty_note?: string | null; field_duty_id?: string | null; settlement: Settlement;
  estimate_travel?: string | number; estimate_stay?: string | number; estimate_local?: string | number; estimate_meals?: string | number; estimate_other?: string | number;
}

export const TRIPS_URL = '/api/v1/travel/requests';
export const tripWhen = (t: Pick<Trip, 'start_date' | 'end_date'>) => (t.start_date === t.end_date ? fmtDate(t.start_date) : `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}`);
export const tripRoute = (t: Pick<Trip, 'origin' | 'destination'>) => `${t.origin} → ${t.destination}`;
