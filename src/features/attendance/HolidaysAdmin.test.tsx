import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '../../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../../test/page';
import { HolidaysAdmin } from './HolidaysAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const DIWALI = { id: 'h1', holiday_date: '2026-11-08T00:00:00.000Z', name: 'Diwali', branch_id: 'b1', branch_name: 'HQ', optional: true };
const NEW_YEAR = { id: 'h2', holiday_date: '2026-01-01', name: 'New Year', branch_name: null, optional: false };
const api = (extra: Handler = () => undefined) => mockPageApi(['attendance.configure'], (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true };
  if (url.endsWith('/org')) return { legalEntities: [], departments: [], branches: [{ id: 'b1', name: 'HQ' }] };
  return { items: url.includes('year=2026') ? [DIWALI, NEW_YEAR] : [] };
});
const method = (c: unknown[]) => (c[1] as RequestInit).method;
const remove = async (name: RegExp) => {
  await userEvent.click(within(await screen.findByRole('row', { name })).getByRole('button', { name: 'Remove' }));
  return screen.findByRole('dialog', { name: 'Remove holiday' });
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T06:30:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('holidays', () => {
  it('lists this year, with where each applies and its type', async () => {
    const f = api();
    renderPage(<HolidaysAdmin />);
    const row = await screen.findByRole('row', { name: /Diwali/ });
    expect(reads(f, '/attendance/holidays?year=2026')).toHaveLength(1);
    expect(within(row).getByText(fmtDate(DIWALI.holiday_date))).toBeTruthy();
    expect(within(row).getByText('HQ')).toBeTruthy();
    expect(within(row).getByText('Optional')).toBeTruthy();
    const other = screen.getByRole('row', { name: /New Year/ });
    expect(within(other).getByText('All branches')).toBeTruthy();
    expect(within(other).getByText('Mandatory')).toBeTruthy();
  });
  it('moves between years, and an empty year says so', async () => {
    const f = api();
    renderPage(<HolidaysAdmin />);
    await screen.findByRole('row', { name: /Diwali/ });
    await userEvent.click(screen.getByRole('button', { name: 'Show 2027' }));
    expect(await screen.findByText('No holidays for 2027')).toBeTruthy();
    expect(reads(f, 'year=2027')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show 2026' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Show 2025' }));
    await waitFor(() => expect(reads(f, 'year=2025')).toHaveLength(1));
  });
  it('adding posts the form, clears it, and null means every branch', async () => {
    const f = api();
    renderPage(<HolidaysAdmin />);
    await userEvent.type(await screen.findByLabelText(/^Date/), '2026-12-25');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Christmas');
    await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    await waitFor(() => expect(writes(f, '/attendance/holidays')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/holidays')[0]!)).toEqual({ holidayDate: '2026-12-25', name: 'Christmas', branchId: null, optional: false });
    expect(await screen.findByText('Holiday added')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe(''));
  });
  it('a branch and optional holiday are sent as chosen', async () => {
    const f = api();
    renderPage(<HolidaysAdmin />);
    await screen.findByRole('option', { name: 'HQ' });
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-12-26');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Local');
    await userEvent.selectOptions(screen.getByLabelText('Applies to'), 'b1');
    await userEvent.click(screen.getByRole('checkbox', { name: /Optional/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    await waitFor(() => expect(writes(f, '/attendance/holidays')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/holidays')[0]!)).toEqual({ holidayDate: '2026-12-26', name: 'Local', branchId: 'b1', optional: true });
  });
  it('a refused holiday keeps what was typed and shows the reason', async () => {
    api((url, init) => (init.method === 'POST' ? problem(409, 'Already a holiday') : undefined));
    renderPage(<HolidaysAdmin />);
    await userEvent.type(await screen.findByLabelText(/^Date/), '2026-11-08');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Diwali');
    await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(await screen.findByText('Already a holiday')).toBeTruthy();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Diwali');
  });
});

describe('removing a holiday', () => {
  it('asks first, deletes, and Undo adds the same holiday back', async () => {
    const f = api();
    renderPage(<HolidaysAdmin />);
    const dlg = await remove(/Diwali/);
    expect(within(dlg).getByText(/Recalculate attendance for that date afterwards/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(writes(f, '/attendance/holidays/h1').map(method)).toEqual(['DELETE']));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/attendance/holidays').filter((c) => method(c) === 'POST')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/holidays').find((c) => method(c) === 'POST')!)).toEqual({ holidayDate: '2026-11-08', name: 'Diwali', branchId: 'b1', optional: true });
    expect(await screen.findByText('Holiday restored')).toBeTruthy();
  });
  it('a holiday for every branch comes back for every branch, and a failed Undo shows why', async () => {
    const f = api((url, init) => (init.method === 'POST' ? problem(409, 'Year is closed') : undefined));
    renderPage(<HolidaysAdmin />);
    const dlg = await remove(/New Year/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Year is closed')).toBeTruthy();
    expect(bodyOf(writes(f, '/attendance/holidays').find((c) => method(c) === 'POST')!)['branchId']).toBeNull();
  });
  it('a failed removal keeps the dialog open', async () => {
    api((url, init) => (init.method === 'DELETE' ? problem(409, 'Period is locked') : undefined));
    renderPage(<HolidaysAdmin />);
    const dlg = await remove(/Diwali/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove' }));
    expect(await within(dlg).findByText('Period is locked')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
