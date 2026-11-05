import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, renderPage, writes } from '../../test/page';
import { CommandPalette } from './CommandPalette';

const Harness = ({ start = true }: { start?: boolean }) => {
  const [open, setOpen] = useState(start);
  const { pathname } = useLocation();
  return <><CommandPalette open={open} onOpenChange={setOpen} /><p data-testid="where">{pathname}</p></>;
};
const show = (start = true, perms: string[] = ['leave.self', 'payslips.self']) => {
  const f = mockPageApi(perms, ['FEATURE_LEAVE', 'FEATURE_PAYROLL', 'FEATURE_PAYSLIPS'], () => ({}));
  renderPage(<Harness start={start} />);
  return f;
};
const input = () => screen.findByRole('combobox', { name: 'Search pages and actions' });
const labels = () => within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option').map((o) => o.textContent ?? '');

afterEach(() => { vi.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); });

describe('opening', () => {
  it('Ctrl+K opens and closes it, and Cmd+K works too', async () => {
    show(false);
    await screen.findByTestId('where');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await input()).toBeTruthy();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });
  it('a plain k does nothing', async () => {
    show(false);
    await screen.findByTestId('where');
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('searching', () => {
  it('lists only the pages this person can reach, and the actions', async () => {
    show();
    await input();
    expect(labels().some((l) => l.startsWith('Leave'))).toBe(true);
    expect(labels().some((l) => l.startsWith('Payroll'))).toBe(false);
    expect(labels().some((l) => l.startsWith('Sign out'))).toBe(true);
  });
  it('filters by name and by address, and says when nothing matches', async () => {
    show();
    await userEvent.type(await input(), 'payslip');
    expect(labels().map((l) => l.replace('Go to', ''))).toEqual(['Payslips']);
    await userEvent.clear(await input());
    await userEvent.type(await input(), 'logout');
    expect(labels()[0]).toContain('Sign out');
    await userEvent.clear(await input());
    await userEvent.type(await input(), 'zzzz');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
    expect((await input()).getAttribute('aria-activedescendant')).toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(await input()).toBeTruthy();
  });
});

describe('moving and choosing', () => {
  it('the arrows move the highlight and wrap round; Enter goes there and closes', async () => {
    show();
    await userEvent.type(await input(), 'ay');  // "Payslips", and "Switch to..." does not match
    const box = await input();
    const firstActive = box.getAttribute('aria-activedescendant');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowDown}');
    expect(box.getAttribute('aria-activedescendant')).toBe(firstActive);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByTestId('where').textContent).toBe('/payslips');
  });
  it('ArrowDown highlights the next option', async () => {
    show();
    const box = await input();
    const options = within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowDown}');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(options.at(-1)!.getAttribute('aria-selected')).toBe('true');
  });
  it('hovering highlights and clicking runs a command', async () => {
    show();
    await input();
    const dark = screen.getByRole('option', { name: /Switch to dark theme/ });
    await userEvent.hover(dark);
    expect(dark.getAttribute('aria-selected')).toBe('true');
    await userEvent.click(dark);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('hrms.theme')).toBe('dark');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });
  it('the light theme command applies', async () => {
    show();
    await userEvent.type(await input(), 'light');
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
  it('Sign out posts to the logout route', async () => {
    const f = show();
    await userEvent.type(await input(), 'sign out');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(writes(f, '/api/v1/auth/logout')).toHaveLength(1));
  });
  it('Escape closes without doing anything', async () => {
    show();
    await input();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
