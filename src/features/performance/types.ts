import type { ApiItem, ApiResponse, Refine } from '../../lib/api-types';

export const RATING: Record<number, string> = { 1: 'Unsatisfactory', 2: 'Needs improvement', 3: 'Meets expectations', 4: 'Exceeds expectations', 5: 'Outstanding' };
export const REVIEW_STATUS: Record<string, string> = { not_started: 'Not started', self_submitted: 'Self-review done', manager_submitted: 'Manager review done', finalized: 'Finalized', acknowledged: 'Acknowledged' };
export const ratingText = (n: number | null | undefined) => (n ? `${n} · ${RATING[n]}` : '—');

export type Cycle = ApiItem<'/api/v1/performance/cycles'>;
export type ReviewRow = ApiItem<'/api/v1/performance/reviews'>;
export type GoalList = ApiResponse<'/api/v1/performance/cycles/{id}/goals/{employeeId}'>;
/** The schema has `object` for goal ratings: a rating from 1 to 5 by goal id. */
export type Review = Refine<ApiResponse<'/api/v1/performance/reviews/{id}'>, { role: 'employee' | 'manager' | 'hr'; goal_ratings: Record<string, number> }>;
export type ReviewGoal = Review['goals'][number];
