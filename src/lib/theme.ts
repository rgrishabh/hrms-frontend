import { syncThemeColor } from './brand';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'hrms.theme';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function getThemePreference(): ThemePreference {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function applyTheme(pref: ThemePreference) {
  document.documentElement.dataset['theme'] = pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref;
  syncThemeColor();
}

export function setThemePreference(pref: ThemePreference) {
  if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/** boot.js set data-theme before first paint; this keeps it following the system setting. */
export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
