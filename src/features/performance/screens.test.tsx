import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Performance } from '../../pages/Performance';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';

configure({ asyncUtilTimeout: 20000 });

const SELF = ['performance.self'];
const MANAGE = ['performance.self', 'performance.manage'];
const CYCLE = { id: 'cy1', name: 'FY 2026', status: 'active', self_review: true, period_start: '2026-04-01', period_end: '2027-03-31', reviews: 3, finalized: 1 };
const GOAL = { id: 'g1', title: 'Close audits', measure: 'Audit tracker', weight: 40, status: 'agreed', progress: 30 };
const PROPOSED = { id: 'g2', title: 'Train two people', measure: null, weight: 20, status: 'proposed', progress: 0 };
const REVIEW = { id: 'rv1', cycle_id: 'cy1', employee_id: 'e2', reviewer_id: 'e1', employee_name: 'Bo Das', cycle_name: 'FY 2026', period_start: '2026-04-01', period_end: '2027-03-31', version: 2, status: 'not_started', role: 'employee', self_rating: null, self_comments: null, manager_rating: null, manager_comments: null, final_rating: null, final_comments: null, goal_ratings: null, goals: [GOAL] };
const ROW = { id: 'rv1', employee_id: 'e2', employee_code: 'E2', employee_name: 'Bo Das', designation: null, status: 'self_submitted', reviewer_name: null, self_rating: 4, manager_rating: null, final_rating: null };
const LONG = 'Closed every audit a week early, and trained the new analyst.';

interface Over { review?: object; goals?: object[]; totalWeight?: number; cycles?: object[]; team?: object[]; mine?: object[] }
const api = (o: Over = {}): Handler => (url, init) => {
  if (init.method && init.method !== 'GET') return { ok: true, reviews: 12 };
  if (url.endsWith('/performance/cycles')) return { items: o.cycles ?? [CYCLE] };
  if (url.includes('/goals/')) return { items: o.goals ?? [GOAL, PROPOSED], totalWeight: o.totalWeight ?? 60 };
  if (url.includes('/reviews/rv1')) return { ...REVIEW, ...o.review };
  if (url.includes('scope=team')) return { items: o.team ?? [] };
  if (url.includes('scope=mine')) return { items: o.mine ?? [ROW] };
  if (url.includes('scope=all')) return { items: [ROW, { ...ROW, id: 'rv2', employee_id: 'e3', employee_code: 'E3', employee_name: 'Cy Rao', designation: 'Chemist', status: 'finalized', reviewer_name: 'Meera', self_rating: 3, manager_rating: 4, final_rating: 5 }] };
  return { items: [] };
};
const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name });
const lastBody = (f: Mock, part: string) => bodyOf(writes(f, part).at(-1)!);
const fill = (el: HTMLElement, value: string) => { fireEvent.change(el, { target: { value } }); };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('page', () => {
  it('with no access says so', async () => {
    mockPageApi([], [], api());
    showPage(<Performance />);
    expect(await screen.findByText('You do not have access to performance reviews')).toBeTruthy();
  });
  it('with no open cycle says so, and points a manager at Review cycles', async () => {
    mockPageApi(MANAGE, [], api({ cycles: [{ ...CYCLE, status: 'draft' }] }));
    showPage(<Performance />, '/performance?tab=mine');
    expect(await screen.findByText('No review cycle is open yet')).toBeTruthy();
    expect(screen.getByText('Create one under Review cycles.')).toBeTruthy();
    expect(screen.queryByLabelText('Review cycle')).toBeNull();
  });
  it('picks the active cycle first, and switching reloads for the chosen one', async () => {
    const f = mockPageApi(SELF, [], api({ cycles: [{ ...CYCLE, id: 'cy0', name: 'FY 2025', status: 'closed' }, CYCLE, { ...CYCLE, id: 'cyd', name: 'Hidden', status: 'draft' }] }));
    showPage(<Performance />);
    const pick = await screen.findByLabelText<HTMLSelectElement>('Review cycle');
    expect(pick.value).toBe('cy1');
    expect(within(pick).queryByRole('option', { name: /Hidden/ })).toBeNull();
    await userEvent.selectOptions(pick, 'cy0');
    await waitFor(() => expect(reads(f, 'cycleId=cy0&scope=mine')).not.toHaveLength(0));
  });
  it('someone outside the cycle is told why', async () => {
    mockPageApi(SELF, [], api({ mine: [] }));
    showPage(<Performance />);
    expect(await screen.findByText('You are not part of FY 2026')).toBeTruthy();
  });
  it('a manager with a team gets the tab with its count, and the list', async () => {
    mockPageApi(SELF, [], api({ team: [ROW] }));
    showPage(<Performance />, '/performance?tab=team');
    const tab = await screen.findByRole('tab', { name: /My team/ });
    expect(tab.textContent).toContain('1');
    expect(await screen.findByRole('table', { name: 'My team reviews' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Reviewer' })).toBeNull();
  });
  it('a failed team load keeps the tab, so the failure is seen', async () => {
    mockPageApi(SELF, [], (url, init) => (url.includes('scope=team') ? problem(500, 'Team query failed') : api()(url, init)));
    showPage(<Performance />, '/performance?tab=team');
    expect(await screen.findByRole('tab', { name: 'My team' })).toBeTruthy();
    expect(await screen.findByText('Team query failed')).toBeTruthy();
  });
});

describe('all reviews', () => {
  const ROUTE = '/performance?tab=all';
  it('counts by status, searches and filters on what was loaded', async () => {
    mockPageApi(MANAGE, [], api());
    showPage(<Performance />, ROUTE);
    expect(await screen.findByRole('table', { name: 'All reviews' })).toBeTruthy();
    const counts = screen.getByRole('group', { name: 'Reviews by status' });
    expect(within(counts).getByText('Self-review done: 1')).toBeTruthy();
    expect(within(counts).getByText('Finalized: 1')).toBeTruthy();
    expect(within(counts).getByText('Not started: 0')).toBeTruthy();
    expect(screen.getByText('No manager')).toBeTruthy();
    expect(screen.getByText('Meera')).toBeTruthy();
    expect(screen.getByText('Chemist')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search'), 'e3');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bo Das' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Cy Rao' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'not_started');
    expect(await screen.findByText('No reviews match')).toBeTruthy();
  });
  it('opens a review in a dialog', async () => {
    mockPageApi(MANAGE, [], api({ review: { role: 'hr', status: 'self_submitted', reviewer_id: 'e9' } }));
    showPage(<Performance />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Bo Das' }));
    const dlg = await dialog('Performance review');
    expect(await within(dlg).findByRole('heading', { name: 'Bo Das' })).toBeTruthy();
    await userEvent.click(within(dlg).getAllByRole('button', { name: /Close/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Performance review' })).toBeNull());
  });
  it('an empty cycle says so', async () => {
    mockPageApi(MANAGE, [], (url, init) => (url.includes('scope=all') ? { items: [] } : api()(url, init)));
    showPage(<Performance />, ROUTE);
    expect(await screen.findByText('No reviews in this cycle')).toBeTruthy();
  });
});

describe('cycles', () => {
  const ROUTE = '/performance?tab=cycles';
  it('activates a draft after asking and announces how many reviews', async () => {
    const f = mockPageApi(MANAGE, [], api({ cycles: [{ ...CYCLE, status: 'draft' }] }));
    showPage(<Performance />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const dlg = await dialog('Activate FY 2026?');
    expect(writes(f, '/activate')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(writes(f, '/cycles/cy1/activate')).toHaveLength(1));
    expect(await screen.findByText('Activated: 12 reviews created')).toBeTruthy();
  });
  it('an active cycle needs every review finalized before Close appears', async () => {
    mockPageApi(MANAGE, [], api());
    showPage(<Performance />, ROUTE);
    expect(await screen.findByText('Finalize every review to close')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
  it('closes a finished cycle after asking', async () => {
    const f = mockPageApi(MANAGE, [], api({ cycles: [{ ...CYCLE, finalized: 3, self_review: false }] }));
    showPage(<Performance />, ROUTE);
    expect(await screen.findByText('No')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await userEvent.click(within(await dialog('Close FY 2026?')).getByRole('button', { name: 'Close cycle' }));
    await waitFor(() => expect(writes(f, '/cycles/cy1/close')).toHaveLength(1));
    expect(await screen.findByText('Cycle closed')).toBeTruthy();
  });
  it('a failed activation stays open with the reason', async () => {
    mockPageApi(MANAGE, [], (url, init) => (url.endsWith('/activate') ? problem(409, 'Another cycle overlaps') : api({ cycles: [{ ...CYCLE, status: 'draft' }] })(url, init)));
    showPage(<Performance />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const dlg = await dialog('Activate FY 2026?');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Activate' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Another cycle overlaps');
  });
  it('no cycles says so', async () => {
    mockPageApi(MANAGE, [], api({ cycles: [] }));
    showPage(<Performance />, ROUTE);
    expect(await screen.findByText('No review cycles yet')).toBeTruthy();
  });
  it('a new cycle defaults to the current financial year, refuses end before start, and posts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-02-10T06:00:00Z'));
    const f = mockPageApi(MANAGE, [], api());
    showPage(<Performance />, ROUTE);
    await userEvent.click(await screen.findByRole('button', { name: 'New cycle' }));
    const dlg = await dialog('New review cycle');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Name/).value).toBe('FY 2026-27');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Period start/).value).toBe('2026-04-01');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Period end/).value).toBe('2027-03-31');
    fill(within(dlg).getByLabelText(/Period end/), '2026-01-01');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create draft' }));
    expect(await within(dlg).findByText('The end must be after the start.')).toBeTruthy();
    expect(writes(f, '/performance/cycles')).toHaveLength(0);
    fill(within(dlg).getByLabelText(/Period start/), '2025-04-01');
    await userEvent.clear(within(dlg).getByLabelText(/Name/));
    await userEvent.type(within(dlg).getByLabelText(/Name/), 'Pilot');
    await userEvent.click(within(dlg).getByRole('checkbox'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(writes(f, '/performance/cycles')).toHaveLength(1));
    expect(lastBody(f, '/performance/cycles')).toEqual({ name: 'Pilot', periodStart: '2025-04-01', periodEnd: '2026-01-01', selfReview: false });
    expect(await screen.findByText('Draft cycle created')).toBeTruthy();
  });
});

describe('my review', () => {
  it('self-review: needs twenty characters, then posts rating, comments and the version', async () => {
    const f = mockPageApi(SELF, [], api());
    showPage(<Performance />);
    expect(await screen.findByRole('heading', { name: 'Your self-review' })).toBeTruthy();
    expect(screen.getByText('Not submitted yet')).toBeTruthy();
    expect(screen.getByText('Shown once the review is finalized')).toBeTruthy();
    expect(screen.getByText('Shown once finalized')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText(/Overall rating/), '4');
    await userEvent.type(screen.getByLabelText(/^Comments/), 'Too short');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Write at least 20 characters.')).toBeTruthy();
    expect(writes(f, '/reviews/rv1/self')).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText(/^Comments/));
    await userEvent.type(screen.getByLabelText(/^Comments/), LONG);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/reviews/rv1/self')).toHaveLength(1));
    expect(lastBody(f, '/reviews/rv1/self')).toEqual({ rating: 4, comments: LONG, expectedVersion: 2 });
    expect(await screen.findByText('Submitted')).toBeTruthy();
  });
  it('a conflict stays on the form with the reason and the text', async () => {
    mockPageApi(SELF, [], (url, init) => (url.endsWith('/self') ? problem(409, 'Review changed, reload') : api()(url, init)));
    showPage(<Performance />);
    await userEvent.selectOptions(await screen.findByLabelText(/Overall rating/), '4');
    await userEvent.type(screen.getByLabelText(/^Comments/), LONG);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Review changed, reload')).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Comments/).value).toBe(LONG);
  });
  it('a finalized review can be acknowledged with an optional comment and no rating', async () => {
    const f = mockPageApi(SELF, [], api({ review: { status: 'finalized', self_rating: 4, self_comments: 'Did well', manager_rating: 3, manager_comments: 'Agreed', final_rating: 3, final_comments: 'Calibrated' } }));
    showPage(<Performance />);
    expect(await screen.findByRole('heading', { name: 'Acknowledge your review' })).toBeTruthy();
    expect(screen.getByText('4 · Exceeds expectations')).toBeTruthy();
    expect(screen.getAllByText('3 · Meets expectations')).toHaveLength(2);
    expect(screen.getByText('Calibrated')).toBeTruthy();
    expect(screen.queryByLabelText(/Overall rating/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Propose a goal' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(writes(f, '/reviews/rv1/acknowledge')).toHaveLength(1));
    expect(lastBody(f, '/reviews/rv1/acknowledge')).toEqual({ expectedVersion: 2 });
    expect(await screen.findByText('Acknowledged')).toBeTruthy();
  });
  it('an acknowledged review shows the employee\'s note and has no form', async () => {
    mockPageApi(SELF, [], api({ review: { status: 'acknowledged', employee_ack_note: 'Thanks', final_rating: 5 } }));
    showPage(<Performance />);
    expect(await screen.findByText(/Acknowledged by the employee: “Thanks”/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.getByText('5 · Outstanding')).toBeTruthy();
  });
  it('a cycle with no self-review has no form for the employee and says so', async () => {
    mockPageApi(SELF, [], api({ cycles: [{ ...CYCLE, self_review: false }] }));
    showPage(<Performance />);
    expect(await screen.findByText('No self-review in this cycle')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });
});

describe('manager and HR steps', () => {
  const ROUTE = '/performance?tab=all';
  const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Bo Das' })); return dialog('Performance review'); };
  it('a manager rates goals and overall; clearing a goal rating removes it', async () => {
    const f = mockPageApi(MANAGE, [], api({ review: { role: 'manager', status: 'self_submitted', goals: [GOAL, PROPOSED] } }));
    showPage(<Performance />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByLabelText(/Overall rating/)).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText('Close audits (40%)'), '5');
    await userEvent.selectOptions(within(dlg).getByLabelText('Train two people (20%)'), '2');
    await userEvent.selectOptions(within(dlg).getByLabelText('Train two people (20%)'), '');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Overall rating/), '3');
    await userEvent.type(within(dlg).getByLabelText(/^Comments/), LONG);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/reviews/rv1/manager')).toHaveLength(1));
    expect(lastBody(f, '/reviews/rv1/manager')).toEqual({ rating: 3, comments: LONG, goalRatings: { g1: 5 }, expectedVersion: 2 });
  });
  it('without a self-review cycle the manager starts straight away, and HR stands in when there is no manager', async () => {
    mockPageApi(MANAGE, [], api({ cycles: [{ ...CYCLE, self_review: false }], review: { role: 'hr', status: 'not_started', reviewer_id: null, goals: [] } }));
    showPage(<Performance />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByLabelText(/Overall rating/)).toBeTruthy();
    expect(within(dlg).queryByRole('group', { name: /Rate each agreed goal/ })).toBeNull();
  });
  it('HR finalizes without a note, seeing the manager\'s rating', async () => {
    const f = mockPageApi(MANAGE, [], api({ review: { role: 'hr', status: 'manager_submitted', manager_rating: 3, goal_ratings: { g1: 4 } } }));
    showPage(<Performance />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByText(/Manager's rating: 3 · Meets expectations/)).toBeTruthy();
    expect(await within(dlg).findByRole('columnheader', { name: 'Rating' })).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText(/Final rating/), '4');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/reviews/rv1/finalize')).toHaveLength(1));
    expect(lastBody(f, '/reviews/rv1/finalize')).toEqual({ rating: 4, expectedVersion: 2 });
  });
  it('the manager who wrote the review cannot finalize it', async () => {
    mockPageApi(MANAGE, [], api({ review: { role: 'manager', status: 'manager_submitted', manager_rating: 3 } }));
    showPage(<Performance />, ROUTE);
    const dlg = await open();
    await within(dlg).findByRole('heading', { name: 'Bo Das' });
    expect(within(dlg).queryByLabelText(/Final rating/)).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Submit' })).toBeNull();
  });
  it('before the self-review a manager waits, and is told', async () => {
    mockPageApi(MANAGE, [], api({ review: { role: 'manager', status: 'not_started' } }));
    showPage(<Performance />, ROUTE);
    const dlg = await open();
    expect(await within(dlg).findByText("Waiting for Bo Das's self-review.")).toBeTruthy();
  });
});

describe('goals', () => {
  it('an employee proposes a goal within what is left, and only drops proposed ones', async () => {
    const f = mockPageApi(SELF, [], api());
    showPage(<Performance />);
    expect(await screen.findByText('Weight 60% of 100%')).toBeTruthy();
    expect(screen.getByText('Measured by: Audit tracker')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Progress on Close audits' }).getAttribute('value')).toBe('30');
    expect(screen.getAllByRole('button', { name: 'Drop' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Agree' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Propose a goal' }));
    const dlg = await dialog('Goal');
    expect(within(dlg).getByLabelText<HTMLInputElement>(/Weight \(%\), up to 40% left/).value).toBe('25');
    await userEvent.type(within(dlg).getByLabelText(/^Goal/), 'Reduce rework');
    await userEvent.type(within(dlg).getByLabelText(/How it is measured/), 'Rework log');
    await userEvent.type(within(dlg).getByLabelText(/Details/), 'Below 2%');
    fill(within(dlg).getByLabelText(/Weight/), '30');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(writes(f, '/cycles/cy1/goals/e2')).toHaveLength(1));
    expect(lastBody(f, '/cycles/cy1/goals/e2')).toEqual({ title: 'Reduce rework', measure: 'Rework log', description: 'Below 2%', weight: 30 });
    expect(await screen.findByText('Goal saved')).toBeTruthy();
  });
  it('blanks are sent as null, and a refused goal stays open', async () => {
    let refuse = true;
    const f = mockPageApi(SELF, [], (url, init) => {
      if (init.method === 'POST' && url.includes('/goals/e2')) { if (refuse) { refuse = false; return problem(409, 'Weight exceeds 100%'); } return { ok: true }; }
      return api()(url, init);
    });
    showPage(<Performance />);
    await userEvent.click(await screen.findByRole('button', { name: 'Propose a goal' }));
    const dlg = await dialog('Goal');
    await userEvent.type(within(dlg).getByLabelText(/^Goal/), 'Reduce rework');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save goal' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Weight exceeds 100%');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(writes(f, '/goals/e2')).toHaveLength(2));
    expect(lastBody(f, '/goals/e2')).toEqual({ title: 'Reduce rework', measure: null, description: null, weight: 25 });
  });
  it('at full weight no goal can be added', async () => {
    mockPageApi(SELF, [], api({ totalWeight: 100 }));
    showPage(<Performance />);
    expect(await screen.findByText('Weight 100% of 100%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Propose a goal' })).toBeNull();
  });
  it('no goals yet invites the employee to propose', async () => {
    mockPageApi(SELF, [], api({ goals: [], totalWeight: 0 }));
    showPage(<Performance />);
    expect(await screen.findByText('Propose goals and your manager agrees them.')).toBeTruthy();
  });
  it('progress posts the slider value and closes', async () => {
    const f = mockPageApi(SELF, [], api());
    showPage(<Performance />);
    await userEvent.click(await screen.findByRole('button', { name: 'Update progress' }));
    const dlg = await dialog('Progress — Close audits');
    fill(within(dlg).getByRole('slider'), '55');
    expect(within(dlg).getByText(/Progress: 55%/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/goals/g1/progress')).toHaveLength(1));
    expect(lastBody(f, '/goals/g1/progress')).toEqual({ progress: 55 });
    expect(await screen.findByText('Progress saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Progress/ })).toBeNull());
  });
  it('a manager agrees a proposed goal and may add and drop', async () => {
    const f = mockPageApi(MANAGE, [], api({ review: { role: 'manager', status: 'self_submitted' } }));
    showPage(<Performance />, '/performance?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo Das' }));
    const dlg = await dialog('Performance review');
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Agree' }));
    await waitFor(() => expect(writes(f, '/goals/g2/agree')).toHaveLength(1));
    expect(await screen.findByText('Goal agreed')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Add goal' })).toBeTruthy();
    expect(within(dlg).getAllByRole('button', { name: 'Drop' })).toHaveLength(2);
  });
  it('dropping asks first and says the weight comes back', async () => {
    const f = mockPageApi(SELF, [], api());
    showPage(<Performance />);
    await userEvent.click(await screen.findByRole('button', { name: 'Drop' }));
    const dlg = await dialog('Drop goal');
    expect(within(dlg).getByText(/Drop "Train two people"\? Its weight becomes available again/)).toBeTruthy();
    expect(writes(f, '/drop')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Drop goal' }));
    await waitFor(() => expect(writes(f, '/goals/g2/drop')).toHaveLength(1));
    expect(await screen.findByText('Goal dropped')).toBeTruthy();
  });
});
