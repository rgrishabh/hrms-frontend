import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDate, fmtDateTime } from '../../format';
import { bodyOf, mockPageApi, problem, renderPage, writes, type Handler } from '../../test/page';
import { LocksAdmin } from './LocksAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const LOCK = { id: 'l1', period_start: '2026-09-01', period_end: '2026-09-30', locked_by: 'Asha HR', locked_at: '2026-10-02T04:00:00.000Z' };
const api = (extra: Handler = () => undefined, items: unknown[] = [LOCK]) => mockPageApi(['attendance.lock'], (url, init) => extra(url, init) ?? (init.method !== 'GET' ? { rowsLocked: 120 } : { items }));
const fill = async (start: string, end: string) => {
  await userEvent.type(await screen.findByLabelText(/Period start/), start);
  await userEvent.type(screen.getByLabelText(/Period end/), end);
};

afterEach(() => vi.restoreAllMocks());

describe('payroll locks', () => {
  it('lists what is locked, by whom and when', async () => {
    api();
    renderPage(<LocksAdmin canLock />);
    const row = await screen.findByRole('row', { name: /Asha HR/ });
    expect(within(row).getByText(`${fmtDate(LOCK.period_start)} – ${fmtDate(LOCK.period_end)}`)).toBeTruthy();
    expect(within(row).getByText(fmtDateTime(LOCK.locked_at))).toBeTruthy();
  });
  it('someone who cannot lock only reads, and an empty list says so', async () => {
    api(undefined, []);
    renderPage(<LocksAdmin canLock={false} />);
    expect(await screen.findByText('No locked periods')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock period…' })).toBeNull();
  });
  it('an end before the start is refused at the field, before any dialog', async () => {
    const f = api();
    renderPage(<LocksAdmin canLock />);
    await fill('2026-10-31', '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Lock period…' }));
    expect(await screen.findByText('Cannot be before the period start')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes(f, '/attendance/locks')).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText(/Period end/));
    expect(screen.queryByText('Cannot be before the period start')).toBeNull();
  });
  it('confirms what will be frozen, posts the period, reports the rows and clears the form', async () => {
    const f = api();
    renderPage(<LocksAdmin canLock />);
    await fill('2026-10-01', '2026-10-31');
    await userEvent.click(screen.getByRole('button', { name: 'Lock period…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Lock attendance period' });
    expect(within(dlg).getByText(fmtDate('2026-10-01'))).toBeTruthy();
    expect(within(dlg).getByText(fmtDate('2026-10-31'))).toBeTruthy();
    expect(writes(f, '/attendance/locks')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Lock period' }));
    await waitFor(() => expect(writes(f, '/attendance/locks')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/locks')[0]!)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(await screen.findByText('Locked 120 attendance records')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText(/Period start/) as HTMLInputElement).value).toBe(''));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a refusal keeps the dialog and the dates, with the reason', async () => {
    api((url, init) => (init.method === 'POST' ? problem(409, '3 correction requests are pending') : undefined));
    renderPage(<LocksAdmin canLock />);
    await fill('2026-10-01', '2026-10-31');
    await userEvent.click(screen.getByRole('button', { name: 'Lock period…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Lock attendance period' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Lock period' }));
    expect(await within(dlg).findByText('3 correction requests are pending')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText(/Period start/) as HTMLInputElement).value).toBe('2026-10-01');
  });
});
