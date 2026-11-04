import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Performance } from '../../pages/Performance';
import { mockApi, problem, showPage, writes } from '../recruitment/harness.test-util';

const CYCLE = { id: 'cy1', name: 'FY 2026', status: 'active', self_review: true, period_start: '2026-04-01', period_end: '2027-03-31', reviews: 3, finalized: 1 };
const REVIEW = { id: 'rv1', cycle_id: 'cy1', employee_id: 'e2', reviewer_id: 'e1', employee_name: 'Bo', cycle_name: 'FY 2026', period_start: '2026-04-01', period_end: '2027-03-31', version: 2, status: 'manager_submitted', role: 'manager', self_rating: 4, self_comments: 'Fine', manager_rating: 3, manager_comments: 'Good', final_rating: null, final_comments: null, goal_ratings: {}, goals: [{ id: 'g1', title: 'Goal one', weight: 100, status: 'agreed', progress: 50, measure: null }] };
const ROW = { id: 'rv1', employee_id: 'e2', employee_code: 'E2', employee_name: 'Bo', designation: null, status: 'manager_submitted', reviewer_name: 'A', self_rating: 4, manager_rating: 3, final_rating: null };
const api = (review: Record<string, unknown>, extra?: (url: string, method: string) => unknown) => (url: string, method: string) => {
  const hit = extra?.(url, method);
  if (hit !== undefined) return hit;
  if (url.endsWith('/performance/cycles')) return { items: [CYCLE] };
  if (url.includes('/goals/')) return { items: [], totalWeight: 100 };
  if (url.includes('/reviews/rv1')) return review;
  if (url.includes('/reviews')) return { items: [ROW] };
  return { items: [] };
};

describe('review steps', () => {
  it('the reviewing manager with HR rights is not offered Finalize, which the server refuses', async () => {
    mockApi(['performance.self', 'performance.manage'], api(REVIEW));
    showPage(<Performance />, '/performance?tab=team');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await screen.findByRole('heading', { name: 'Manager review' });
    expect(screen.queryByLabelText('Final rating')).toBeNull();
  });
  it('someone else in HR is offered Finalize', async () => {
    mockApi(['performance.self', 'performance.manage'], api({ ...REVIEW, role: 'hr' }));
    showPage(<Performance />, '/performance?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    expect(await screen.findByLabelText(/Final rating/)).toBeTruthy();
  });
  it('putting a goal rating back to none does not send a rating of 0, which the server rejects', async () => {
    const f = mockApi(['performance.self'], api({ ...REVIEW, status: 'self_submitted' }));
    showPage(<Performance />, '/performance?tab=team');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    const select = await screen.findByLabelText(/Goal one/);
    await userEvent.selectOptions(select, '4');
    await userEvent.selectOptions(select, '');
    await userEvent.selectOptions(screen.getByLabelText(/Overall rating/), '3');
    await userEvent.type(screen.getByLabelText(/Comments/), 'Reliable on delivery and quality across the year.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/reviews/rv1/manager')).toHaveLength(1));
    expect(JSON.parse(String((writes(f, '/reviews/rv1/manager')[0]![1] as RequestInit).body)).goalRatings).toEqual({});
  });
  it('short comments are refused at the field, not silently by a disabled button', async () => {
    const f = mockApi(['performance.self'], api({ ...REVIEW, status: 'self_submitted' }));
    showPage(<Performance />, '/performance?tab=team');
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }));
    await screen.findByLabelText(/Overall rating/);
    await userEvent.selectOptions(screen.getByLabelText(/Overall rating/), '3');
    await userEvent.type(screen.getByLabelText(/Comments/), 'Too short');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/Write at least 20 characters/)).toBeTruthy();
    expect(writes(f, '/reviews/rv1/manager')).toHaveLength(0);
  });
});

describe('team tab', () => {
  it('a failed team load leaves the tab and shows the error, rather than hiding the tab', async () => {
    mockApi(['performance.self'], api(REVIEW, (url) => (url.includes('scope=team') ? problem(500, 'Team query failed') : undefined)));
    showPage(<Performance />, '/performance?tab=team');
    const tab = await screen.findByRole('tab', { name: /My team/ }, { timeout: 5000 });
    await userEvent.click(tab);
    expect((await screen.findByRole('alert')).textContent).toContain('Team query failed');
  });
  it('someone with no team has no team tab', async () => {
    mockApi(['performance.self'], api(REVIEW, (url) => (url.includes('scope=team') ? { items: [] } : undefined)));
    showPage(<Performance />, '/performance');
    await screen.findByRole('heading', { level: 1, name: 'Performance' });
    await waitFor(() => expect(screen.queryByRole('tab', { name: /My team/ })).toBeNull());
  });
});

describe('cycles', () => {
  it('a failed activate stays open with the reason', async () => {
    mockApi(['performance.manage'], api(REVIEW, (url, method) => {
      if (url.endsWith('/performance/cycles') && method === 'GET') return { items: [{ ...CYCLE, status: 'draft' }] };
      if (url.endsWith('/activate')) return problem(409, 'Dates overlap');
      return undefined;
    }));
    showPage(<Performance />, '/performance?tab=cycles');
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const dlg = await screen.findByRole('dialog', { name: /Activate FY 2026/ });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Activate' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Dates overlap');
  });
});
