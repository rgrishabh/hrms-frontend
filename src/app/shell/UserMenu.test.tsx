import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../../pwa/install';
import { mockPageApi, renderPage, writes } from '../../test/page';
import { UserMenu } from './UserMenu';

const roles = { roles: [{ key: 'employee', name: 'Employee', group: 'staff' }, { key: 'lead', name: 'Team lead', group: 'staff' }] };
const show = async () => {
  const f = mockPageApi(['leave.self'], [], () => ({}), 'e1', roles);
  renderPage(<><UserMenu /><p>Elsewhere</p><button type="button">After</button></>);
  return { f, button: await screen.findByRole('button', { name: /account menu/ }) };
};
const account = () => screen.queryByRole('link', { name: 'Account' });

beforeAll(() => { captureInstallPrompt(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('account menu', () => {
  it('shows nothing but the button until opened, and its name starts with the initials it shows', async () => {
    const { button } = await show();
    expect(button.getAttribute('aria-label')?.startsWith(`${button.querySelector('.avatar')?.textContent}, account menu, `)).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(account()).toBeNull();
  });
  it('a click opens it with the person, their roles and their controls', async () => {
    const { button } = await show();
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Employee, Team lead')).toBeTruthy();
    expect(account()?.getAttribute('href')).toBe('/account');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
  it('hovering names the person without opening it, and the mouse leaving does not close a clicked one', async () => {
    const { button } = await show();
    await userEvent.hover(button);
    expect(account()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.nextElementSibling?.className).toBe('user-menu__tip');
    expect(button.nextElementSibling?.textContent).toBe(screen.getByRole('button', { name: /account menu/ }).getAttribute('aria-label')?.split('account menu, ')[1]);
    await userEvent.click(button);
    await userEvent.unhover(button);
    expect(account()).toBeTruthy();
  });
  it('a second click, a click elsewhere and Esc each close it', async () => {
    const { button } = await show();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(account()).toBeNull();
    await userEvent.click(button);
    await userEvent.click(screen.getByText('Elsewhere'));
    expect(account()).toBeNull();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(account()).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it('tabbing out closes it, and choosing Account closes it', async () => {
    const { button } = await show();
    await userEvent.click(button);
    await userEvent.click(account()!);
    expect(account()).toBeNull();
    await userEvent.click(button);
    button.focus();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await waitFor(() => expect(account()).toBeNull());
  });
  it('Sign out posts to the logout route', async () => {
    const { f, button } = await show();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(writes(f, '/api/v1/auth/logout')).toHaveLength(1));
  });
  it('offers Install app only once the browser allows it, and hides it after answering', async () => {
    const { button } = await show();
    await userEvent.click(button);
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()), userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    act(() => { window.dispatchEvent(event); });
    await userEvent.click(await screen.findByRole('button', { name: 'Install app' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull());
  });
});
