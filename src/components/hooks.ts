import { useEffect, useState, useSyncExternalStore } from 'react';

/** Phone layout: bottom navigation, card lists, full-screen sheets. */
export const MOBILE_QUERY = '(max-width: 860px)';
export const CARD_LIST_QUERY = '(max-width: 720px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(query); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); },
    () => window.matchMedia(query).matches,
  );
}

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
