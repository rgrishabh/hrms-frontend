import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAIN_TEST_ID } from '../../contract';
import { mockPageApi, renderPage } from '../../test/page';
import { resetViewport, setViewport } from '../../test/render';
import { Shell } from './Shell';

const SELF = ['leave.self', 'attendance.self', 'payslips.self', 'profile.self'];
const FLAGS = ['FEATURE_LEAVE', 'FEATURE_ATTENDANCE', 'FEATURE_PAYROLL', 'FEATURE_PAYSLIPS'];
const api = (unread = 0) => (url: string) => {
  if (url.includes('/notifications/unread-count')) return { unread };
  if (url.includes('/notifications')) return { items: [], page: 1, pageSize: 15, total: 0 };
  return {};
};
const show = (route = '/leave', unread = 0) => {
  const f = mockPageApi(SELF, FLAGS, api(unread));
  renderPage(<Shell><p>Page body</p></Shell>, route);
  return f;
};

afterEach(() => { resetViewport(); vi.restoreAllMocks(); });

describe('on a desktop', () => {
  it('shows the rail, the crumbs and the page, and titles the tab after the page', async () => {
    show();
    expect(await screen.findByText('Page body')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Leave').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(document.title).toBe('Leave · Acme HR'));
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).toBeNull();
  });
  it('an unknown address titles the tab with the product only', async () => {
    show('/nowhere');
    await screen.findByText('Page body');
    await waitFor(() => expect(document.title).toBe('Acme HR'));
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
  it('says how many notifications are unread, and caps the number on the badge', async () => {
    show('/leave', 3);
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
  it('more than 99 unread reads 99+', async () => {
    show('/leave', 120);
    expect(await screen.findByRole('button', { name: 'Notifications, 120 unread' })).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });
  it('the bell opens the panel and closing it returns to the page', async () => {
    const f = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(panel).findByText('Nothing new')).toBeTruthy();
    expect(f.mock.calls.some((c) => String(c[0]) === '/api/v1/notifications?page=1&pageSize=15')).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull());
  });
  it('the search box opens the command palette', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Search/ }));
    expect(await screen.findByRole('combobox', { name: 'Search pages and actions' })).toBeTruthy();
  });
  it('the skip link moves focus to the main area', async () => {
    show();
    await userEvent.click(await screen.findByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(screen.getByTestId(MAIN_TEST_ID));
  });
  it('moving to another page moves focus to its start and scrolls up', async () => {
    const scroll = vi.fn();
    vi.stubGlobal('scrollTo', scroll);
    show();
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(scroll).not.toHaveBeenCalled();
    await userEvent.click(within(nav).getByRole('link', { name: 'Payslips' }));
    await waitFor(() => expect(document.title).toBe('Payslips · Acme HR'));
    expect(document.activeElement).toBe(screen.getByTestId(MAIN_TEST_ID));
    expect(scroll).toHaveBeenCalledWith(0, 0);
    vi.unstubAllGlobals();
  });
  it('going offline says what still works, and coming back removes the notice', async () => {
    show();
    await screen.findByText('Page body');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect((await screen.findByText(/You are offline/)).textContent).toContain('changes cannot be saved');
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByText(/You are offline/)).toBeNull());
  });
  it('a page that crashes is contained, and the shell stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Crash = (): never => { throw new Error('boom'); };
    mockPageApi(SELF, FLAGS, api());
    renderPage(<Shell><Crash /></Shell>, '/leave');
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong on this page');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });
});

describe('on a phone', () => {
  it('has a menu instead of the rail and a bottom bar of quick links', async () => {
    setViewport(400);
    show();
    await screen.findByText('Page body');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    const quick = screen.getByRole('navigation', { name: 'Quick navigation' });
    expect(within(quick).getByRole('link', { name: 'Leave' }).getAttribute('href')).toBe('/leave');
    expect(within(quick).getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
  });
  it('the menu opens a drawer, and following a link closes it', async () => {
    setViewport(400);
    vi.stubGlobal('scrollTo', vi.fn());
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Acme HR' });
    await userEvent.click(within(drawer).getByRole('link', { name: 'Payslips' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Acme HR' })).toBeNull());
    expect(document.title).toBe('Payslips · Acme HR');
    vi.unstubAllGlobals();
  });
  it('the menu can be closed without going anywhere', async () => {
    setViewport(400);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Acme HR' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Acme HR' })).toBeNull());
    expect(document.title).toBe('Leave · Acme HR');
  });
  it('the search icon opens the palette', async () => {
    setViewport(400);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('combobox', { name: 'Search pages and actions' })).toBeTruthy();
  });
  it('someone with almost nothing to reach gets no bottom bar', async () => {
    setViewport(400);
    mockPageApi([], [], api(), null);
    renderPage(<Shell><p>Page body</p></Shell>, '/');
    await screen.findByText('Page body');
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).toBeNull();
  });
});
