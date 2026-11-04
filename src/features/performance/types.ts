export const RATING: Record<number, string> = { 1: 'Unsatisfactory', 2: 'Needs improvement', 3: 'Meets expectations', 4: 'Exceeds expectations', 5: 'Outstanding' };
export const REVIEW_STATUS: Record<string, string> = { not_started: 'Not started', self_submitted: 'Self-review done', manager_submitted: 'Manager review done', finalized: 'Finalized', acknowledged: 'Acknowledged' };
export const ratingText = (n: number | null | undefined) => (n ? `${n} · ${RATING[n]}` : '—');

export interface Cycle { id: string; name: string; status: string; self_review: boolean; period_start: string; period_end: string; reviews: number; finalized: number }
export interface ReviewRow { id: string; employee_id: string; employee_code: string; employee_name: string; designation: string | null; status: string; reviewer_name: string | null; self_rating: number | null; manager_rating: number | null; final_rating: number | null }
export interface ReviewGoal { id: string; title: string; measure: string | null; weight: number; status: string; progress: number }
export interface Review {
  id: string; cycle_id: string; employee_id: string; reviewer_id: string | null; employee_name: string; cycle_name: string; period_start: string; period_end: string; version: number; status: string; role: 'employee' | 'manager' | 'hr';
  self_rating: number | null; self_comments: string | null; manager_rating: number | null; manager_comments: string | null; final_rating: number | null; final_comments: string | null; goal_ratings: Record<string, number> | null; goals: ReviewGoal[]; employee_ack_note?: string | null;
}
export interface GoalList { items: ReviewGoal[]; totalWeight: number }
