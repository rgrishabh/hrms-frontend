import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../../pwa/install';
import { normalizeConfig } from '../../lib/config';
import { renderUi } from '../../test/render';
import { mockPageApi, renderPage, writes } from '../../test/page';
import { BrandMark } from './BrandMark';
import { Breadcrumbs, matchRoute } from './Breadcrumbs';
import { SidebarContent } from './SidebarContent';
import { SupportLine } from './SupportLine';

const SELF = ['leave.self', 'attendance.self', 'payslips.self'];
const HR = [...SELF, 'employees.manage', 'employees.read', 'settings.read', 'leave.manage'];
const FLAGS = ['FEATURE_LEAVE', 'FEATURE_ATTENDANCE', 'FEATURE_PAYROLL'];
const nav = () => screen.findByRole('navigation', { name: 'Main navigation' });

beforeAll(() => { captureInstallPrompt(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('sidebar', () => {
  it('names the person with their roles and hides the switcher for one view', async () => {
    mockPageApi(SELF, FLAGS, () => ({}), 'e1', { roles: [{ key: 'employee', name: 'Employee', group: 'staff' }, { key: 'lead', name: 'Team lead', group: 'staff' }] });
    renderPage(<SidebarContent />);
    await nav();
    expect(screen.getByText('Employee, Team lead')).toBeTruthy();
    expect(screen.queryByLabelText('Switch view')).toBeNull();
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account');
  });
  it('switching view remembers the choice and changes the navigation', async () => {
    mockPageApi(HR, FLAGS, () => ({}));
    renderPage(<SidebarContent />);
    const view = await screen.findByLabelText('Switch view') as HTMLSelectElement;
    expect(view.value).toBe('hr');
    expect(within(await nav()).getByRole('link', { name: 'Employees' })).toBeTruthy();
    await userEvent.selectOptions(view, 'employee');
    expect(localStorage.getItem('hrms.view')).toBe('employee');
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).queryByRole('link', { name: 'Employees' })).toBeNull());
  });
  it('a remembered view this person no longer has falls back to one they do', async () => {
    localStorage.setItem('hrms.view', 'payroll');
    mockPageApi(HR, FLAGS, () => ({}));
    renderPage(<SidebarContent />);
    expect((await screen.findByLabelText('Switch view') as HTMLSelectElement).value).toBe('hr');
  });
  it('a link tells the caller, so the phone drawer can close', async () => {
    const onNavigate = vi.fn();
    mockPageApi(SELF, FLAGS, () => ({}));
    renderPage(<SidebarContent onNavigate={onNavigate} />);
    await userEvent.click(within(await nav()).getByRole('link', { name: 'Leave' }));
    await userEvent.click(screen.getByRole('link', { name: 'Account' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
  it('Sign out posts to the logout route', async () => {
    const f = mockPageApi(SELF, FLAGS, () => ({}));
    renderPage(<SidebarContent />);
    await nav();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(writes(f, '/api/v1/auth/logout')).toHaveLength(1));
  });
  it('offers Install app only once the browser allows it, and hides it after answering', async () => {
    mockPageApi(SELF, FLAGS, () => ({}));
    renderPage(<SidebarContent />);
    await nav();
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()), userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Install app' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull());
  });
});

describe('breadcrumbs', () => {
  const PERMS = ['employees.read', 'employees.manage', 'employees.directory', 'leave.self'];
  it('a detail page links back to its parent and reads Details', async () => {
    mockPageApi(PERMS, FLAGS, () => ({}));
    renderPage(<Breadcrumbs />, '/employees/e9');
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Employees' }).getAttribute('href')).toBe('/employees');
    expect(within(crumbs).getByText('Details').getAttribute('aria-current')).toBe('page');
  });
  it('the dashboard and an unknown address have none', async () => {
    mockPageApi(PERMS, FLAGS, () => ({}));
    const { unmount } = renderPage(<><Breadcrumbs /><p>ready</p></>, '/');
    await screen.findByText('ready');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    unmount();
    renderPage(<><Breadcrumbs /><p>ready</p></>, '/nope');
    await screen.findByText('ready');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
  it('matchRoute finds the settings pages under their prefix and treats / as the dashboard', () => {
    expect(matchRoute('/settings/users')?.id).toBe('settings');
    expect(matchRoute('/')?.id).toBe('dashboard');
    expect(matchRoute('/no/such/page')).toBeUndefined();
  });
});

describe('brand mark', () => {
  const cfg = (brand = {}) => normalizeConfig({ brand: { name: 'Acme', productName: 'acme people portal', ...brand } });
  it('without a logo shows two initials of the product', () => {
    const { container } = renderUi(<BrandMark cfg={cfg()} />);
    expect(container.textContent).toBe('AP');
    expect(container.querySelector('.brand-initials--md')).toBeTruthy();
  });
  it('shows the logo at the asked size, and the dark variant when there is one', () => {
    renderUi(<BrandMark cfg={cfg({ logoUrl: '/brand/l.png', logoDarkUrl: '/brand/d.png' })} size="lg" />);
    const imgs = screen.getAllByAltText('Acme logo') as HTMLImageElement[];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/brand/l.png', '/brand/d.png']);
    expect(imgs[0]!.className).toBe('brand-logo__light');
  });
  it('falls back to initials when the logo cannot load', async () => {
    const { container } = renderUi(<BrandMark cfg={cfg({ logoUrl: '/brand/l.png' })} />);
    const img = screen.getByAltText('Acme logo');
    expect(img.className).toBe('');
    act(() => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.textContent).toBe('AP'));
  });
  it('a dark logo that fails falls back too', async () => {
    const { container } = renderUi(<BrandMark cfg={cfg({ logoUrl: '/l.png', logoDarkUrl: '/d.png' })} />);
    act(() => { screen.getAllByAltText('Acme logo')[1]!.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(container.textContent).toBe('AP'));
  });
});

describe('support line', () => {
  it('is absent with nothing to offer', () => {
    const { container } = renderUi(<SupportLine cfg={normalizeConfig({})} />);
    expect(container.querySelector('.support-line')).toBeNull();
  });
  it('links email, a dialable phone number, and help in a new tab', () => {
    renderUi(<SupportLine cfg={normalizeConfig({ brand: { supportEmail: 'help@x.test', supportPhone: '+91 (22) 555-0100', helpUrl: 'https://help.x.test' } })} />);
    expect(screen.getByRole('link', { name: 'help@x.test' }).getAttribute('href')).toBe('mailto:help@x.test');
    expect(screen.getByRole('link', { name: '+91 (22) 555-0100' }).getAttribute('href')).toBe('tel:+91225550100');
    const help = screen.getByRole('link', { name: 'Help centre' });
    expect(help.getAttribute('href')).toBe('https://help.x.test');
    expect(help.getAttribute('rel')).toContain('noopener');
  });
  it('shows only what is configured', () => {
    renderUi(<SupportLine cfg={normalizeConfig({ brand: { supportPhone: '5550100' } })} />);
    expect(screen.getByRole('link', { name: '5550100' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Help centre' })).toBeNull();
  });
});
