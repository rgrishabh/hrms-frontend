import { useState } from 'react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit } from '../../components/useSubmit';
import { fmtDate } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { RATING, ratingText, type Cycle, type GoalList, type Review, type ReviewGoal } from './types';

const reload = () => invalidateApi('/api/v1/performance', '/api/v1/dashboard');
const RATING_OPTIONS = [5, 4, 3, 2, 1].map((x) => ({ value: String(x), label: `${x} · ${RATING[x]}` }));

export function MyReview({ cycle }: { cycle: Cycle }) {
  const query = useApiQuery<ApiResponse<'/api/v1/performance/reviews'>>(`/api/v1/performance/reviews${qs({ cycleId: cycle.id, scope: 'mine' })}`);
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState title={`You are not part of ${cycle.name}`} description="Reviews are created for staff who joined before the period ended." />}>
      {(d) => <ReviewDetail id={d.items[0]!.id} selfReview={cycle.self_review} />}
    </QueryState>
  );
}

export function ReviewDetail({ id, selfReview }: { id: string; selfReview: boolean }) {
  const query = useApiQuery<Review>(`/api/v1/performance/reviews/${id}`, { staleTime: 0 });
  return (
    <QueryState query={query} loading={<SkeletonRows />}>
      {(r) => {
        const final = ['finalized', 'acknowledged'].includes(r.status);
        return (
          <div className="stack-4">
            <div className="cluster-between">
              <div><h2>{r.employee_name}</h2><p className="text-sm text-2">{r.cycle_name} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}</p></div>
              <StatusBadge status={r.status} />
            </div>
            <Goals cycleId={r.cycle_id} employeeId={r.employee_id} role={r.role} editable={!final} goalRatings={r.goal_ratings ?? {}} />
            <div className="review-sections">
              <Section title="Self-review" rating={r.self_rating} comments={r.self_comments} empty={selfReview ? 'Not submitted yet' : 'No self-review in this cycle'} />
              <Section title="Manager review" rating={r.manager_rating} comments={r.manager_comments} empty={r.role === 'employee' && !final ? 'Shown once the review is finalized' : 'Not submitted yet'} />
              <Section title="Final rating" rating={r.final_rating} comments={r.final_comments} empty={r.role === 'employee' && !final ? 'Shown once finalized' : 'Not finalized'} />
            </div>
            {r.status === 'acknowledged' && <Alert>Acknowledged by the employee{r.employee_ack_note ? `: “${r.employee_ack_note}”` : ''}.</Alert>}
            <StepForm key={`${r.status}-${r.version}`} r={r} selfReview={selfReview} />
          </div>
        );
      }}
    </QueryState>
  );
}

function Section({ title, rating, comments, empty }: { title: string; rating: number | null; comments: string | null; empty: string }) {
  return (
    <Card headingLevel={3} title={title}>
      {rating ? <div className="stack-1"><strong>{ratingText(rating)}</strong>{comments && <p className="review-text text-sm">{comments}</p>}</div> : <p className="text-sm text-2">{empty}</p>}
    </Card>
  );
}

type Step = 'self' | 'manager' | 'finalize' | 'acknowledge';
const STEP_TITLE: Record<Step, string> = { self: 'Your self-review', manager: 'Manager review', finalize: 'Finalize the rating (HR)', acknowledge: 'Acknowledge your review' };

function currentStep(r: Review, selfReview: boolean, canManage: boolean): Step | null {
  if (r.role === 'employee') return r.status === 'not_started' && selfReview ? 'self' : r.status === 'finalized' ? 'acknowledge' : null;
  const awaitingManager = r.status === 'self_submitted' || (!selfReview && r.status === 'not_started');
  if ((r.role === 'manager' || (r.role === 'hr' && !r.reviewer_id)) && awaitingManager) return 'manager';
  // Whoever wrote the manager review may not finalize it, even with HR rights.
  if (r.role === 'hr' && canManage && r.status === 'manager_submitted') return 'finalize';
  return null;
}

function StepForm({ r, selfReview }: { r: Review; selfReview: boolean }) {
  const toast = useToast();
  const { can } = useAuth();
  const [rating, setRating] = useState('');
  const [comments, setComments] = useState('');
  const [goalRatings, setGoalRatings] = useState<Record<string, number>>({});
  const step = currentStep(r, selfReview, can('performance.manage'));
  const needsRating = step !== 'acknowledge';
  const minComments = step === 'self' || step === 'manager' ? 20 : 0;
  const form = useSubmit(async () => {
    await api.post(`/api/v1/performance/reviews/${r.id}/${step}`, { ...(needsRating ? { rating: Number(rating) } : {}), comments: comments.trim() || undefined, ...(step === 'manager' ? { goalRatings } : {}), expectedVersion: r.version });
    toast(step === 'acknowledge' ? 'Acknowledged' : 'Submitted');
    await reload();
  }, { validate: (): Record<string, string> => ({ ...(comments.trim().length < minComments ? { comments: `Write at least ${minComments} characters.` } : {}) }) });
  if (!step) return r.role !== 'employee' && r.status === 'not_started' ? <Alert>Waiting for {r.employee_name}'s self-review.</Alert> : null;
  return (
    <Card headingLevel={3} title={STEP_TITLE[step]}>
      <form className="stack-3" onSubmit={form.submit}>
        {step === 'finalize' && <p className="text-sm text-2">Manager's rating: {ratingText(r.manager_rating)}. Change it only after calibration, and say why.</p>}
        {step === 'manager' && r.goals.length > 0 && (
          <fieldset className="table-toolbar__group">
            <legend>Rate each agreed goal (optional)</legend>
            {r.goals.map((g) => (
              <Select
                key={g.id}
                label={`${g.title} (${g.weight}%)`}
                placeholder="No rating"
                value={goalRatings[g.id] ? String(goalRatings[g.id]) : ''}
                options={RATING_OPTIONS}
                onChange={(e) => setGoalRatings((c) => { const { [g.id]: _gone, ...rest } = c; return e.target.value ? { ...rest, [g.id]: Number(e.target.value) } : rest; })}
              />
            ))}
          </fieldset>
        )}
        {needsRating && <Select label={step === 'finalize' ? 'Final rating' : 'Overall rating'} required placeholder="Select…" error={form.errors['rating']} value={rating} options={RATING_OPTIONS} onChange={(e) => setRating(e.target.value)} />}
        <Textarea
          label={step === 'acknowledge' ? 'Your comments (optional)' : step === 'finalize' ? 'Calibration note (optional)' : 'Comments'}
          hint={minComments ? `At least ${minComments} characters: what went well and what to improve, with examples.` : undefined}
          rows={4}
          maxLength={5000}
          required={minComments > 0}
          error={form.errors['comments']}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <FormActions error={form.error} busy={form.busy} busyLabel="Submitting…" submitLabel={step === 'acknowledge' ? 'Acknowledge' : 'Submit'} />
      </form>
    </Card>
  );
}

function Goals({ cycleId, employeeId, role, editable, goalRatings }: { cycleId: string; employeeId: string; role: Review['role']; editable: boolean; goalRatings: Record<string, number> }) {
  const toast = useToast();
  const { run, isBusy } = useAction();
  const query = useApiQuery<GoalList>(`/api/v1/performance/cycles/${cycleId}/goals/${employeeId}`);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<ReviewGoal | null>(null);
  const [drop, setDrop] = useState<ReviewGoal | null>(null);
  const rated = Object.keys(goalRatings).length > 0;
  const columns: Column<ReviewGoal>[] = [
    { key: 'goal', header: 'Goal', card: 'title', cell: (g) => <>{g.title}{g.measure && <div className="table__cell-sub">Measured by: {g.measure}</div>}</> },
    { key: 'status', header: 'Status', card: 'status', cell: (g) => <Badge tone={g.status === 'agreed' ? 'ok' : 'warn'}>{g.status === 'agreed' ? 'Agreed' : 'Proposed'}</Badge> },
    { key: 'weight', header: 'Weight', align: 'right', cell: (g) => `${g.weight}%` },
    { key: 'progress', header: 'Progress', cell: (g) => <span className="goal-progress"><progress max={100} value={g.progress} aria-label={`Progress on ${g.title}`} /> {g.progress}%</span> },
    ...(rated ? [{ key: 'rating', header: 'Rating', align: 'right' as const, cell: (g: ReviewGoal) => goalRatings[g.id] ?? '—' }] : []),
    ...(editable ? [{
      key: 'actions', header: 'Actions', card: 'actions' as const, cell: (g: ReviewGoal) => (
        <div className="table__actions">
          {g.status === 'agreed' && <Button size="sm" onClick={() => setProgress(g)}>Update progress</Button>}
          {g.status === 'proposed' && role !== 'employee' && <Button size="sm" variant="primary" loading={isBusy(g.id)} onClick={() => void run(g.id, async () => { await api.post(`/api/v1/performance/goals/${g.id}/agree`); await reload(); }, 'Goal agreed')}>Agree</Button>}
          {(g.status === 'proposed' || role !== 'employee') && <Button size="sm" onClick={() => setDrop(g)}>Drop</Button>}
        </div>
      ),
    }] : []),
  ];
  const data = query.data;
  const left = data ? 100 - data.totalWeight : 0;
  return (
    <Card
      headingLevel={3}
      title={<span className="cluster">Goals{data && <Badge tone={data.totalWeight === 100 ? 'ok' : 'warn'}>Weight {data.totalWeight}% of 100%</Badge>}</span>}
      actions={editable && data && left > 0 && <Button size="sm" onClick={() => setAdding(true)}>{role === 'employee' ? 'Propose a goal' : 'Add goal'}</Button>}
    >
      <QueryState query={query} compact loading={<SkeletonRows rows={3} />} isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No goals yet." description={role === 'employee' ? 'Propose goals and your manager agrees them.' : undefined} />}>
        {(d) => <Table label="Goals" columns={columns} rows={d.items} rowKey={(g) => g.id} />}
      </QueryState>
      {adding && <GoalForm cycleId={cycleId} employeeId={employeeId} maxWeight={left} onClose={() => setAdding(false)} />}
      {progress && <ProgressForm goal={progress} onClose={() => setProgress(null)} />}
      {drop && (
        <ConfirmDialog
          title="Drop goal"
          danger
          confirmLabel="Drop goal"
          message={`Drop "${drop.title}"? Its weight becomes available again.`}
          onClose={() => setDrop(null)}
          onConfirm={async () => { await api.post(`/api/v1/performance/goals/${drop.id}/drop`); toast('Goal dropped'); await reload(); }}
        />
      )}
    </Card>
  );
}

function ProgressForm({ goal, onClose }: { goal: ReviewGoal; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(goal.progress);
  const form = useSubmit(async () => {
    await api.post(`/api/v1/performance/goals/${goal.id}/progress`, { progress: v });
    toast('Progress saved');
    await reload();
    onClose();
  });
  return (
    <Modal title={`Progress — ${goal.title}`} onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Input label={`Progress: ${v}%`} className="review-range" type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function GoalForm({ cycleId, employeeId, maxWeight, onClose }: { cycleId: string; employeeId: string; maxWeight: number; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', measure: '', description: '', weight: Math.min(maxWeight, 25) as number | string });
  const form = useSubmit(async () => {
    await api.post(`/api/v1/performance/cycles/${cycleId}/goals/${employeeId}`, { title: f.title, measure: f.measure || null, description: f.description || null, weight: Number(f.weight) });
    toast('Goal saved');
    await reload();
    onClose();
  });
  return (
    <Modal title="Goal" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Input label="Goal" hint="Specific and measurable, for example “Close 95% of customer requests within 3 working days”" required minLength={3} maxLength={200} error={form.errors['title']} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label="How it is measured" maxLength={500} placeholder="A report, an audit result or a tracker" error={form.errors['measure']} value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} />
        <Textarea label="Details (optional)" maxLength={2000} error={form.errors['description']} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input label={`Weight (%), up to ${maxWeight}% left`} type="number" inputMode="numeric" required min={1} max={maxWeight} error={form.errors['weight']} value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} busyLabel="Saving…" submitLabel="Save goal" onCancel={onClose} />
      </form>
    </Modal>
  );
}
