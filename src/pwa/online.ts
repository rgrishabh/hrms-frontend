import { useSyncExternalStore } from 'react';

export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => { window.addEventListener('online', notify); window.addEventListener('offline', notify); return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); }; },
    () => navigator.onLine,
  );
}
