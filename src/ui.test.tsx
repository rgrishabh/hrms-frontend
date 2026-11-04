import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLoad } from './ui';

describe('useLoad', () => {
  it('clears data when dependencies change', async () => {
    const pending = new Map<string, (v: string) => void>();
    const load = (k: string) => new Promise<string>((res) => { pending.set(k, res); });
    const { result, rerender } = renderHook(({ k }) => useLoad(() => load(k), [k]), { initialProps: { k: 'a' } });
    pending.get('a')!('A');
    await waitFor(() => expect(result.current.data).toBe('A'));
    rerender({ k: 'b' });
    await waitFor(() => expect(result.current.data).toBeNull());
  });
  it('keeps data on a plain reload', async () => {
    let n = 0;
    const seen: unknown[] = [];
    const { result } = renderHook(() => { const r = useLoad(() => Promise.resolve(++n), []); seen.push(r.data); return r; });
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
    const afterFirst = seen.slice(seen.indexOf(1));
    expect(afterFirst).not.toContain(null);
  });
});
