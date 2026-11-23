import { act, renderHook } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '../lib/query';
import { RECHECK_MS, useOnline } from './online';

let line: MockInstance<() => boolean>;
let server: MockInstance<typeof fetch>;
let hook: ReturnType<typeof renderHook<boolean, unknown>> | undefined;

const up = () => server.mockImplementation(async () => new Response(null, { status: 200 }));
const down = () => server.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const browser = async (online: boolean) => {
  line.mockReturnValue(online);
  act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
  await tick();
};
const show = () => { hook = renderHook(() => useOnline()); return hook.result; };

beforeEach(() => {
  vi.useFakeTimers();
  line = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  server = vi.spyOn(globalThis, 'fetch');
  up();
});
afterEach(async () => {
  await browser(true);
  hook?.unmount();
  hook = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useOnline', () => {
  it('asks the server nothing while the browser is online', async () => {
    const result = show();
    await tick(RECHECK_MS * 3);
    expect(result.current).toBe(true);
    expect(server).not.toHaveBeenCalled();
  });
  it('is offline when neither the browser nor the server is reachable, and back with the browser', async () => {
    down();
    const result = show();
    await browser(false);
    expect(result.current).toBe(false);
    await browser(true);
    expect(result.current).toBe(true);
  });
  it('a wrong browser flag is overruled by a server that answers, even with an error', async () => {
    server.mockImplementation(async () => new Response(null, { status: 503 }));
    const result = show();
    await browser(false);
    expect(result.current).toBe(true);
    expect(server).toHaveBeenCalledWith('/healthz', expect.objectContaining({ cache: 'no-store' }));
  });
  it('a page opened with the wrong flag is online', async () => {
    line.mockReturnValue(false);
    const result = show();
    await tick();
    expect(result.current).toBe(true);
  });
  it('recovers by itself when the browser never says it is back', async () => {
    down();
    const result = show();
    await browser(false);
    expect(result.current).toBe(false);
    up();
    await tick(RECHECK_MS);
    expect(result.current).toBe(true);
    down();
    await tick(RECHECK_MS);
    expect(result.current).toBe(false);
  });
  it('a missed online event is noticed when the tab is shown again', async () => {
    down();
    const result = show();
    await browser(false);
    line.mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe(true);
  });
  it('a server that never answers counts as offline', async () => {
    server.mockImplementation((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')); }); }));
    const result = show();
    await browser(false);
    expect(result.current).toBe(true);
    await tick(5000);
    expect(result.current).toBe(false);
  });
  it('a late answer does not undo a newer state', async () => {
    let fail: (e: Error) => void = () => undefined;
    server.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const result = show();
    await browser(false);
    await browser(true);
    fail(new Error('late'));
    await tick();
    expect(result.current).toBe(true);
  });
});

describe('loads and saves', () => {
  it('pause only when the server is really out of reach', async () => {
    const stop = onlineManager.subscribe(() => undefined);
    await browser(false);
    expect(onlineManager.isOnline()).toBe(true);
    down();
    await tick(RECHECK_MS);
    expect(onlineManager.isOnline()).toBe(false);
    await browser(true);
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });
});
