import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problem } from '../test/page';
import { renderUi } from '../test/render';
import { DownloadButton } from './DownloadButton';

const fileResponse = (excluded?: number) => new Response('a,b', { headers: { 'content-disposition': 'attachment; filename="bank.csv"', ...(excluded === undefined ? {} : { 'x-excluded-subjects': String(excluded) }) } });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('DownloadButton', () => {
  it('fetches the address, saves the file under the server name and reports done', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse());
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { names.push(this.download); });
    const onDone = vi.fn();
    renderUi(<DownloadButton url="/api/v1/bank.csv" fileName="fallback.csv" onDone={onDone} aria-label="Bank file for March">Bank CSV</DownloadButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Bank file for March' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(f.mock.calls[0]![0]).toBe('/api/v1/bank.csv');
    expect(names).toEqual(['bank.csv']);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('says one person was left out for being above the reader', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse(1));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderUi(<DownloadButton url="/x" fileName="x.csv">Get</DownloadButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Get' }));
    expect(await screen.findByText('1 person is above your salary level and left out of this file.')).toBeTruthy();
  });
  it('says several were left out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse(3));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderUi(<DownloadButton url="/x" fileName="x.csv">Get</DownloadButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Get' }));
    expect(await screen.findByText('3 people are above your salary level and left out of this file.')).toBeTruthy();
  });
  it('a failure stays on the page as an error and saves nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(problem(403, 'You cannot export this'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const onDone = vi.fn();
    renderUi(<DownloadButton url="/x" fileName="x.csv" onDone={onDone}>Get</DownloadButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Get' }));
    expect((await screen.findByRole('alert')).textContent).toContain('You cannot export this');
    expect(click).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Get' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('can be disabled', () => {
    renderUi(<DownloadButton url="/x" fileName="x.csv" disabled>Get</DownloadButton>);
    expect((screen.getByRole('button', { name: 'Get' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
