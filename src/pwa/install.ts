import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The browser fires this at most once and early, so it is captured at startup. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export function useInstallPrompt() {
  const available = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => deferred !== null);
  return {
    available,
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      notify();
    },
  };
}
