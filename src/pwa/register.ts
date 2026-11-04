import { logger } from '../lib/logger';

/** Registers the app-shell service worker in production builds. A failure only costs offline support. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => logger.warn('Service worker registration failed', { message: e instanceof Error ? e.message : String(e) }));
  });
}
