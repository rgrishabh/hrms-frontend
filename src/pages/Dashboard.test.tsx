import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, problem, reads, renderPage } from '../test/page';
import { Dashboard } from './Dashboard';

type Over = (url: string) => unknown;
const SUMMARY = { today: '2026-11-05', sections: [], lists: [] };
const api = (over: Over = () => undefined) => (url: string) => {
  const x = over(url);
  if (x !== undefined) return x;
  if (url.endsWith('/api/v1/dashboard')) return SUMMARY;
  if (url.includes('/approvals/')) return { items: [] };
  return {};
};
const tile = (label: string) => screen.findByRole('link', { name: new RegExp(label) });

afterEach(() => { vi.restoreAllMocks(); });

describe('requests', () => {
  it('counts the inbox, and only my pending requests', async () => {
    mockPageApi([], [], api((url) => {
      if (url.endsWith('/approvals/inbox')) return { items: [{}, {}] };
      if (url.endsWith('/approvals/mine')) return { items: [{ status: 'pending' }, { status: 'approved' }] };
      return undefined;
    }));
    renderPage(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'Welcome, A' })).toBeTruthy();
    const awaiting = await tile('Awaiting your approval');
    await waitFor(() => expect(awaiting.textContent).toContain('2'));
    expect(awaiting.getAttribute('href')).toBe('/approvals');
    const mine = await tile('Your pending requests');
    await waitFor(() => expect(mine.textContent).toContain('1'));
    expect(mine.getAttribute('href')).toBe('/approvals?tab=mine');
  });
  it('a failed count shows a dash, not zero, and retry asks again', async () => {
    let up = false;
    const f = mockPageApi([], [], api((url) => (url.includes('/approvals/') && !up ? problem(500, 'Approvals are down') : undefined)));
    renderPage(<Dashboard />);
    expect((await screen.findByText('Approvals are down'))).toBeTruthy();
    expect((await tile('Awaiting your approval')).textContent).toContain('—');
    up = true;
    const before = reads(f, '/approvals/inbox').length;
    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    await waitFor(() => expect(reads(f, '/approvals/inbox').length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText('Approvals are down')).toBeNull());
  });
  it('offers shortcuts only for what is switched on, and only to someone with an employee record', async () => {
    mockPageApi(['expenses.self'], ['FEATURE_LEAVE', 'FEATURE_ATTENDANCE_REGULARIZATION', 'FEATURE_EXPENSE_CLAIMS'], api());
    const { unmount } = renderPage(<Dashboard />);
    expect((await screen.findByRole('link', { name: 'Apply for leave' })).getAttribute('href')).toBe('/leave');
    expect(screen.getByRole('link', { name: 'Request attendance correction' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New expense claim' })).toBeTruthy();
    unmount();
    mockPageApi(['expenses.self'], ['FEATURE_LEAVE'], api(), null);
    renderPage(<Dashboard />);
    await screen.findByRole('heading', { name: 'Welcome, A' });
    expect(screen.queryByRole('link', { name: 'Apply for leave' })).toBeNull();
  });
  it('no expense shortcut without the permission', async () => {
    mockPageApi([], ['FEATURE_EXPENSE_CLAIMS'], api());
    renderPage(<Dashboard />);
    await screen.findByRole('heading', { name: 'Welcome, A' });
    expect(screen.queryByRole('link', { name: 'New expense claim' })).toBeNull();
  });
});

describe('prompts', () => {
  it('suggests two-factor to someone who can read pay, unless it is on', async () => {
    mockPageApi([], [], api(), 'e1', { mfa: { suggested: true } });
    const { unmount } = renderPage(<Dashboard />);
    expect((await screen.findByRole('link', { name: /Consider turning on two-factor/ })).getAttribute('href')).toBe('/account');
    unmount();
    mockPageApi([], [], api(), 'e1', { mfa: { suggested: true, enabled: true } });
    renderPage(<Dashboard />);
    await screen.findByRole('heading', { name: 'Welcome, A' });
    expect(screen.queryByRole('link', { name: /Consider turning on two-factor/ })).toBeNull();
  });
  const policies = (body: object) => {
    mockPageApi(['policies.self'], ['FEATURE_POLICIES'], api((url) => (url.endsWith('/policies/mine') ? body : undefined)));
    renderPage(<Dashboard />);
  };
  it('one policy to acknowledge reads in the singular', async () => {
    policies({ pending: 1, overdue: 0 });
    expect(await screen.findByRole('link', { name: '1 policy needs your acknowledgement.' })).toBeTruthy();
  });
  it('several, with overdue ones, say so', async () => {
    policies({ pending: 3, overdue: 2 });
    expect((await screen.findByRole('link', { name: '3 policies need your acknowledgement, 2 overdue.' })).getAttribute('href')).toBe('/policies');
  });
  it('none pending says nothing', async () => {
    policies({ pending: 0, overdue: 0 });
    await screen.findByRole('heading', { name: 'Welcome, A' });
    expect(screen.queryByRole('link', { name: /acknowledgement/ })).toBeNull();
  });
  it('policies are not asked for without an employee record', async () => {
    const f = mockPageApi(['policies.self'], ['FEATURE_POLICIES'], api(), null);
    renderPage(<Dashboard />);
    await screen.findByRole('heading', { name: 'Welcome, A' });
    expect(reads(f, '/policies/mine')).toHaveLength(0);
  });
});

describe('role summary', () => {
  it('shows sections with linked tiles, formatting numbers but not text', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/api/v1/dashboard') ? {
      ...SUMMARY,
      sections: [{ key: 'people', title: 'People', tiles: [{ key: 'headcount', label: 'Headcount', value: 123456, detail: 'Active staff', href: '/employees' }, { key: 'cycle', label: 'Cycle', value: 'Open', tone: 'warn' }] }],
    } : undefined)));
    renderPage(<Dashboard />);
    const people = await screen.findByRole('region', { name: 'People' });
    const headcount = within(people).getByRole('link', { name: /Headcount/ });
    expect(headcount.getAttribute('href')).toBe('/employees');
    expect(headcount.textContent).toContain('1,23,456');
    expect(headcount.textContent).toContain('Active staff');
    expect(within(people).getByText('Open')).toBeTruthy();
  });
  it('shows lists with their details, how many more, and a link', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/api/v1/dashboard') ? {
      ...SUMMARY,
      lists: [
        { key: 'on_leave_today', title: 'On leave today', href: '/leave', more: 2, items: [{ primary: 'Asha Rao', secondary: 'Sales', date: '2026-11-07' }] },
        { key: 'birthdays', title: 'Birthdays', items: [{ primary: 'Ben Roy', date: '2026-11-09' }] },
      ],
    } : undefined)));
    renderPage(<Dashboard />);
    const leave = await screen.findByRole('region', { name: 'On leave today' });
    expect(within(leave).getByText(/Asha Rao/).textContent).toBe('Asha Rao · Sales');
    expect(within(leave).getByText('until 07/11/2026')).toBeTruthy();
    expect(within(leave).getByText('and 2 more')).toBeTruthy();
    expect(within(leave).getByRole('link', { name: 'View all' }).getAttribute('href')).toBe('/leave');
    const birthdays = screen.getByRole('region', { name: 'Birthdays' });
    expect(within(birthdays).getByText('09/11/2026')).toBeTruthy();
    expect(within(birthdays).queryByText(/more/)).toBeNull();
    expect(within(birthdays).queryByRole('link')).toBeNull();
  });
  it('empty lists say what is empty and offer no link', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/api/v1/dashboard') ? {
      ...SUMMARY,
      lists: [{ key: 'on_leave_today', title: 'On leave today', href: '/leave', items: [] }, { key: 'other', title: 'Other', items: [] }],
    } : undefined)));
    renderPage(<Dashboard />);
    expect(await screen.findByText('Nobody is on leave today.')).toBeTruthy();
    expect(screen.getByText('Nothing to show.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'View all' })).toBeNull();
  });
  it('a failed summary is shown as a failure', async () => {
    mockPageApi([], [], api((url) => (url.endsWith('/api/v1/dashboard') ? problem(500, 'Summary is down') : undefined)));
    renderPage(<Dashboard />);
    expect(await screen.findByText('Summary is down')).toBeTruthy();
  });
});
