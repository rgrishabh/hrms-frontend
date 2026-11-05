import { afterEach, describe, expect, it, vi } from 'vitest';
import { getThemePreference, setThemePreference, watchSystemTheme } from './theme';

const prefer = (dark: boolean) => {
  const listeners: (() => void)[] = [];
  const mql = { matches: dark, addEventListener: (_: string, l: () => void) => listeners.push(l) };
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);
  return { fire: (nowDark: boolean) => { mql.matches = nowDark; listeners.forEach((l) => l()); } };
};
const theme = () => document.documentElement.dataset['theme'];

afterEach(() => { vi.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); });

describe('theme', () => {
  it('defaults to following the device, and ignores anything unknown in storage', () => {
    expect(getThemePreference()).toBe('system');
    localStorage.setItem('hrms.theme', 'purple');
    expect(getThemePreference()).toBe('system');
  });
  it('a chosen theme is stored and applied', () => {
    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
    expect(theme()).toBe('dark');
    setThemePreference('light');
    expect(getThemePreference()).toBe('light');
    expect(theme()).toBe('light');
  });
  it('going back to the device clears the choice and applies what the device prefers', () => {
    setThemePreference('light');
    prefer(true);
    setThemePreference('system');
    expect(localStorage.getItem('hrms.theme')).toBeNull();
    expect(theme()).toBe('dark');
    prefer(false);
    setThemePreference('system');
    expect(theme()).toBe('light');
  });
  it('follows the device while on system, and not after a choice', () => {
    const system = prefer(false);
    watchSystemTheme();
    system.fire(true);
    expect(theme()).toBe('dark');
    setThemePreference('light');
    system.fire(true);
    expect(theme()).toBe('light');
  });
});
