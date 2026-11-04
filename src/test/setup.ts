import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  if (typeof document === 'undefined') return;
  cleanup();
  localStorage.clear();
  document.body.innerHTML = '';
});

/** jsdom has no matchMedia. Tests that need the phone layout set window.__testViewportWidth. */
declare global { interface Window { __testViewportWidth?: number } }
if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)?.[1];
    const width = window.__testViewportWidth ?? 1440;
    const matches = max ? width <= Number(max) : false;
    return { matches, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => false };
  }) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => undefined;
}
