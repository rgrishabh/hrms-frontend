import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { lazyRoute } from './lazyRoute';

afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lazyRoute', () => {
  it('does not load until rendered', async () => {
    const load = vi.fn(async () => () => <p>Loaded</p>);
    const Page = lazyRoute(load);
    expect(load).not.toHaveBeenCalled();
    render(<Suspense fallback={null}><Page /></Suspense>);
    expect(await screen.findByText('Loaded')).toBeTruthy();
    expect(load).toHaveBeenCalledOnce();
  });
  it('a stale chunk reloads the page once to pick up the new build', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const Page = lazyRoute(async () => { throw new Error('Failed to fetch dynamically imported module'); });
    render(<Suspense fallback={<p>Waiting</p>}><Page /></Suspense>);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem('hrms.chunk-reload')).toBe('1');
    expect(screen.getByText('Waiting')).toBeTruthy();
  });
  it('while offline it does not reload, because a reload cannot help', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const Page = lazyRoute(async () => { throw new Error('Failed to fetch dynamically imported module'); });
    render(<ErrorBoundary><Suspense fallback={null}><Page /></Suspense></ErrorBoundary>);
    expect((await screen.findByRole('alert')).textContent).toContain('needs to reload');
    expect(reload).not.toHaveBeenCalled();
  });
  it('a successful load clears the reload marker', async () => {
    sessionStorage.setItem('hrms.chunk-reload', '1');
    const Page = lazyRoute(async () => () => <p>Loaded</p>);
    render(<Suspense fallback={null}><Page /></Suspense>);
    expect(await screen.findByText('Loaded')).toBeTruthy();
    expect(sessionStorage.getItem('hrms.chunk-reload')).toBeNull();
  });
  it('after a failed second attempt reaches the boundary instead of reloading forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem('hrms.chunk-reload', '1');
    const Page = lazyRoute(async () => { throw new Error('Failed to fetch dynamically imported module'); });
    render(<ErrorBoundary><Suspense fallback={null}><Page /></Suspense></ErrorBoundary>);
    expect((await screen.findByRole('alert')).textContent).toContain('needs to reload');
  });
});
