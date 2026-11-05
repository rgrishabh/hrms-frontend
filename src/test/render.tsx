import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';

export function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

export function Providers({ children, route = '/' }: { children: ReactNode; route?: string }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[route]}><ToastProvider>{children}</ToastProvider></MemoryRouter>
    </QueryClientProvider>
  );
}

export const renderUi = (ui: ReactElement, route?: string) => render(<Providers route={route}>{ui}</Providers>);

/** Sets the viewport used by the matchMedia stub, for the duration of a test. */
export function setViewport(width: number) { window.__testViewportWidth = width; }
export function resetViewport() { delete window.__testViewportWidth; }
