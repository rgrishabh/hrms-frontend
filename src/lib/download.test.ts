import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { downloadFile } from './download';

afterEach(() => vi.restoreAllMocks());

describe('downloadFile', () => {
  it('saves under the name the server gives', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('a,b', { headers: { 'content-disposition': 'attachment; filename="bank-2026-10.csv"' } }));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { names.push(this.download); });
    await downloadFile('/api/v1/x.csv', 'x.csv');
    expect(names).toEqual(['bank-2026-10.csv']);
  });
  it('falls back to the given name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('a,b'));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { names.push(this.download); });
    await downloadFile('/api/v1/x.csv', 'fallback.csv');
    expect(names).toEqual(['fallback.csv']);
  });
  it('a failed download throws the problem and saves nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ type: 'about:blank', title: 'Run is not finalized', status: 409 }), { status: 409, headers: { 'content-type': 'application/problem+json' } }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await expect(downloadFile('/api/v1/x.csv', 'x.csv')).rejects.toBeInstanceOf(ApiError);
    expect(click).not.toHaveBeenCalled();
  });
});
