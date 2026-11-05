import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt, useInstallPrompt } from './install';

const offer = () => Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()), userChoice: Promise.resolve({ outcome: 'accepted' as const }) });

beforeAll(() => { captureInstallPrompt(); });

describe('install prompt', () => {
  it('nothing is available, and prompting does nothing, until the browser offers', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.available).toBe(false);
    await act(() => result.current.prompt());
    expect(result.current.available).toBe(false);
  });
  it('captures the offer, stops the browser banner, and uses it once', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const e = offer();
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() => result.current.prompt());
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.available).toBe(false);
  });
  it('installing by other means removes the offer', async () => {
    const { result, unmount } = renderHook(() => useInstallPrompt());
    act(() => { window.dispatchEvent(offer()); });
    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    await waitFor(() => expect(result.current.available).toBe(false));
    unmount();
  });
});
