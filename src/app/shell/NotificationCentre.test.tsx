import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notifications } from '../../pages/Notifications';
import { mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { NotificationCentre } from './NotificationCentre';

const n = (over = {}) => ({ id: 'n1', title: 'Leave approved', body: 'Your leave for 3 May', link: '/leave', read_at: null, created_at: '2026-10-01T10:00:00Z', ...over });
const page = (items: unknown[], total = items.length, p = 1, pageSize = 20) => ({ items, page: p, pageSize, total });
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

afterEach(() => { vi.restoreAllMocks(); });

describe('the bell panel', () => {
  const show = (items: unknown[], over: (url: string, init: RequestInit) => unknown = () => undefined) => {
    const onClose = vi.fn();
    const f = mockPageApi([], [], (url, init) => over(url, init) ?? (url.includes('/api/v1/notifications?') ? page(items, items.length, 1, 15) : {}));
    renderPage(<><NotificationCentre onClose={onClose} /><Where /></>);
    return { f, onClose };
  };
  it('asks for the latest and marks unread for screen readers', async () => {
    const { f } = show([n(), n({ id: 'n2', title: 'Payslip ready', body: null, read_at: '2026-10-02T00:00:00Z', link: null })]);
    const row = await screen.findByRole('button', { name: /Unread:\s*Leave approved/ });
    expect(row.className).toContain('notice-row--unread');
    expect(row.textContent).toContain('Your leave for 3 May');
    const read = screen.getByRole('button', { name: /Payslip ready/ });
    expect(read.className).not.toContain('notice-row--unread');
    expect(reads(f, '/api/v1/notifications?page=1&pageSize=15')).toHaveLength(1);
  });
  it('opening an unread item marks it read, closes the panel and goes to its page', async () => {
    const { f, onClose } = show([n()]);
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/leave'));
    expect(writes(f, '/api/v1/notifications/n1/read')).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });
  it('still goes to the page when marking read fails', async () => {
    show([n()], (url) => (url.endsWith('/read') ? problem(500, 'nope') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/leave'));
  });
  it('a read item with no link does nothing and stays open', async () => {
    const { f, onClose } = show([n({ read_at: '2026-10-02T00:00:00Z', link: null })]);
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    expect(writes(f, '/read')).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
  it('Mark all read posts once', async () => {
    const { f } = show([n()]);
    await screen.findByRole('button', { name: /Leave approved/ });
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(writes(f, '/api/v1/notifications/read-all')).toHaveLength(1));
  });
  it('a failed Mark all read tells the person', async () => {
    show([n()], (url) => (url.endsWith('/read-all') ? problem(500, 'Could not mark them read') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByText('Could not mark them read')).toBeTruthy();
  });
  it('empty says so, links preferences, and View all closes the panel', async () => {
    const { onClose } = show([]);
    expect(await screen.findByText('Nothing new')).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'Email preferences' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('link', { name: 'View all' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('where').textContent).toBe('/notifications');
  });
});

describe('the notifications page', () => {
  const show = (handler: (url: string, init: RequestInit) => unknown) => {
    const f = mockPageApi([], [], handler);
    renderPage(<><Notifications /><Where /></>);
    return f;
  };
  it('lists a page and opens an item', async () => {
    const f = show(() => page([n()]));
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/leave'));
    expect(writes(f, '/notifications/n1/read')).toHaveLength(1);
    expect(reads(f, '/api/v1/notifications?page=1&pageSize=20')).toHaveLength(1);
  });
  it('an item already read with no link stays put, with no request', async () => {
    const f = show(() => page([n({ read_at: '2026-10-02T00:00:00Z', link: null })]));
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    expect(writes(f, '/read')).toHaveLength(0);
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
  it('a failed mark-read still opens the link', async () => {
    show((url) => (url.endsWith('/read') ? problem(500, 'nope') : page([n()])));
    await userEvent.click(await screen.findByRole('button', { name: /Leave approved/ }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/leave'));
  });
  it('Unread only asks the server for unread from page 1, with its own empty message', async () => {
    const f = show((url) => (url.includes('unread=true') ? page([]) : page([n()], 45)));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(reads(f, 'page=2&pageSize=20')).toHaveLength(1));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Unread only' }));
    expect(await screen.findByText('No unread notifications')).toBeTruthy();
    expect(reads(f, '/api/v1/notifications?unread=true&page=1&pageSize=20')).toHaveLength(1);
  });
  it('none at all says so', async () => {
    show(() => page([]));
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });
  it('Mark all read posts, and a failure shows the reason', async () => {
    const f = show((url) => (url.endsWith('/read-all') ? problem(503, 'Try later') : page([n()])));
    await screen.findByRole('button', { name: /Leave approved/ });
    await userEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByText('Try later')).toBeTruthy();
    expect(writes(f, '/read-all')).toHaveLength(1);
  });
});
