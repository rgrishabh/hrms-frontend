import { useSyncExternalStore } from 'react';

/**
 * Whether the server can be reached. The browser's own flag is only a hint: it says offline with a VPN or a
 * virtual network adapter, on a LAN or localhost server without internet, and sometimes after sleep. So
 * "offline" is believed only once the server does not answer either, and is checked again until it clears.
 */
const PROBE_URL = '/healthz';
const PROBE_TIMEOUT_MS = 5000;
export const RECHECK_MS = 5000;

let online = true;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Raised by every new check and by stopping, so the answer of an older probe is ignored. */
let run = 0;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach((l) => { l(); });
}

/** Any answer at all, even an error page, means there is a connection. */
async function serverAnswers(): Promise<boolean> {
  const abort = new AbortController();
  const timeout = setTimeout(() => { abort.abort(); }, PROBE_TIMEOUT_MS);
  try {
    await fetch(PROBE_URL, { method: 'HEAD', cache: 'no-store', credentials: 'omit', signal: abort.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function check() {
  clearTimeout(timer);
  const mine = ++run;
  if (navigator.onLine) { set(true); return; }
  void serverAnswers().then((answers) => {
    if (mine !== run) return;
    set(answers || navigator.onLine);
    // The browser sends no further event while its flag stays wrong, so keep looking until it recovers.
    if (!navigator.onLine) timer = setTimeout(check, RECHECK_MS);
  });
}

const onVisible = () => { if (document.visibilityState === 'visible') check(); };

export function subscribeOnline(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', onVisible);
    check();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    window.removeEventListener('online', check);
    window.removeEventListener('offline', check);
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(timer);
    run++;
    online = true;
  };
}

export const isOnline = () => online;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline);
}
