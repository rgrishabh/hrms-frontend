import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { lazyRoute } from './lazyRoute';

afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('lazyRoute', () => {
  it('does not load until rendered', async () => {
    const load = vi.fn(async () => () => <p>Loaded</p>);
    const Page = lazyRoute(load);
    expect(load).not.toHaveBeenCalled();
    render(<Suspense fallback={null}><Page /></Suspense>);
    expect(await screen.findByText('Loaded')).toBeTruthy();
    expect(load).toHaveBeenCalledOnce();
  });
  it('after a failed second attempt reaches the boundary instead of reloading forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem('hrms.chunk-reload', '1');
    const Page = lazyRoute(async () => { throw new Error('Failed to fetch dynamically imported module'); });
    render(<ErrorBoundary><Suspense fallback={null}><Page /></Suspense></ErrorBoundary>);
    expect((await screen.findByRole('alert')).textContent).toContain('needs to reload');
  });
});
