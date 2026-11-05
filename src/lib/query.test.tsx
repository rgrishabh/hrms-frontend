import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { logger } from './logger';
import { invalidateApi, queryClient, useApiMutation, useApiQuery } from './query';

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const err = (status: number) => new ApiError({ type: 'about:blank', title: 'x', status });

afterEach(() => { queryClient.clear(); vi.restoreAllMocks(); });

describe('retries', () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as (count: number, error: Error) => boolean;
  it('never retries what the client got wrong', () => {
    expect(retry(0, err(400))).toBe(false);
    expect(retry(0, err(404))).toBe(false);
    expect(retry(0, err(499))).toBe(false);
  });
  it('retries server and network failures twice', () => {
    expect(retry(0, err(500))).toBe(true);
    expect(retry(1, err(0))).toBe(true);
    expect(retry(0, new Error('boom'))).toBe(true);
    expect(retry(2, err(500))).toBe(false);
  });
});

describe('useApiQuery', () => {
  const answer = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  it('GETs the address', async () => {
    const f = answer({ a: 1 });
    const { result } = renderHook(() => useApiQuery<{ a: number }>('/api/v1/a'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ a: 1 }));
    expect(f.mock.calls[0]![0]).toBe('/api/v1/a');
  });
  it('holds off with no address, and when told to', () => {
    const f = answer({});
    renderHook(() => useApiQuery(null), { wrapper });
    renderHook(() => useApiQuery('/api/v1/b', { enabled: false }), { wrapper });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('invalidateApi', () => {
  it('marks only the cached addresses under the prefix', async () => {
    queryClient.setQueryData(['api', '/api/v1/leave?x=1'], 1);
    queryClient.setQueryData(['api', '/api/v1/payroll'], 2);
    queryClient.setQueryData(['api', null], 3);
    queryClient.setQueryData(['other', '/api/v1/leave'], 4);
    await invalidateApi('/api/v1/leave');
    const state = (key: unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(state(['api', '/api/v1/leave?x=1'])).toBe(true);
    expect(state(['api', '/api/v1/payroll'])).toBe(false);
    expect(state(['api', null])).toBe(false);
    expect(state(['other', '/api/v1/leave'])).toBe(false);
  });
});

describe('useApiMutation', () => {
  it('runs the given action', async () => {
    const mutationFn = vi.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useApiMutation<number, number>({ mutationFn }), { wrapper });
    await act(() => result.current.mutateAsync(21).then((v) => { expect(v).toBe(42); }));
  });
});

describe('logger', () => {
  it('prefixes messages and passes fields on', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logger.error('broke', { id: 1 });
    logger.error('broke again');
    logger.warn('careful', { id: 2 });
    logger.warn('careful again');
    expect(error.mock.calls).toEqual([['[hrms] broke', { id: 1 }], ['[hrms] broke again', '']]);
    expect(warn.mock.calls).toEqual([['[hrms] careful', { id: 2 }], ['[hrms] careful again', '']]);
  });
});
