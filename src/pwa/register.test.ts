import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger';
import { useOnline } from './online';
import { registerServiceWorker } from './register';

const setServiceWorker = (register: () => Promise<unknown>) => Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>)['serviceWorker'];
});

describe('registerServiceWorker', () => {
  it('does nothing outside a production build', () => {
    const register = vi.fn(() => Promise.resolve());
    setServiceWorker(register);
    vi.stubEnv('PROD', false);
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    expect(register).not.toHaveBeenCalled();
  });
  it('registers /sw.js once the page has loaded', () => {
    const register = vi.fn(() => Promise.resolve());
    setServiceWorker(register);
    vi.stubEnv('PROD', true);
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
  it('a failure is logged, and only costs offline support', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setServiceWorker(() => Promise.reject(new Error('blocked')));
    vi.stubEnv('PROD', true);
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Service worker registration failed', { message: 'blocked' }));
  });
  it('a browser without service workers is left alone', () => {
    vi.stubEnv('PROD', true);
    expect(() => registerServiceWorker()).not.toThrow();
  });
});

describe('useOnline', () => {
  it('follows the browser', () => {
    const line = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result, unmount } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    line.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    line.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
    unmount();
  });
});
