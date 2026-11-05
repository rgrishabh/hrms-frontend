import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, renderPage, writes, type Handler } from '../../test/page';
import { ShiftsAdmin } from './ShiftsAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const GEN = { id: 's1', code: 'GEN', name: 'General', start_time: '09:30:00', end_time: '18:00:00', break_minutes: 30, grace_minutes: 10, early_exit_grace_minutes: 5, half_day_min_minutes: 240, full_day_min_minutes: 450, overtime_after_minutes: 540, overnight: false, status: 'active' };
const NGT = { ...GEN, id: 's2', code: 'NGT', name: 'Night', start_time: '22:00:00', end_time: '06:00:00', overtime_after_minutes: null, overnight: true, status: 'inactive' };
const api = (extra: Handler = () => undefined) => mockPageApi(['attendance.configure'], (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true, assigned: 1 };
  if (url.includes('/attendance/shifts')) return { items: [GEN, NGT] };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Bela', last_name: 'Roy', employee_code: 'E9' }] };
  return { items: [] };
});
const method = (c: unknown[]) => (c[1] as RequestInit).method;
const setNumber = async (dlg: HTMLElement, label: RegExp, value: string) => { const el = within(dlg).getByLabelText(label); await userEvent.clear(el); if (value) await userEvent.type(el, value); };

afterEach(() => vi.restoreAllMocks());

describe('shift list', () => {
  it('shows times, allowances and overtime, and only an active shift can be assigned', async () => {
    api();
    renderPage(<ShiftsAdmin />);
    const gen = await screen.findByRole('row', { name: /GEN/ });
    expect(within(gen).getByText('09:30–18:00')).toBeTruthy();
    expect(within(gen).getByText('30m')).toBeTruthy();
    expect(within(gen).getByText('10m / 5m')).toBeTruthy();
    expect(within(gen).getByText('7h 30m / 4h 00m')).toBeTruthy();
    expect(within(gen).getByText('9h 00m')).toBeTruthy();
    expect(within(gen).getByRole('button', { name: 'Assign' })).toBeTruthy();
    const night = screen.getByRole('row', { name: /NGT/ });
    expect(within(night).getByText('Overnight')).toBeTruthy();
    expect(within(night).queryByRole('button', { name: 'Assign' })).toBeNull();
  });
  it('says what to do when there are none', async () => {
    api((url, init) => (init.method === 'GET' && url.includes('/attendance/shifts') ? { items: [] } : undefined));
    renderPage(<ShiftsAdmin />);
    expect(await screen.findByText('Create a shift so attendance can be calculated.')).toBeTruthy();
  });
});

describe('shift form', () => {
  it('posts a new shift with numbers, no overtime when blank, and flags an overnight end', async () => {
    const f = api();
    renderPage(<ShiftsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'New shift' }));
    const dlg = await screen.findByRole('dialog', { name: 'New shift' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'eve');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Evening');
    const start = within(dlg).getByLabelText(/Start time/);
    await userEvent.clear(start);
    await userEvent.type(start, '14:00');
    const end = within(dlg).getByLabelText(/End time/);
    await userEvent.clear(end);
    await userEvent.type(end, '13:00');
    expect(within(dlg).getByText('Ends next day (overnight shift)')).toBeTruthy();
    await userEvent.clear(end);
    await userEvent.type(end, '22:00');
    expect(within(dlg).queryByText('Ends next day (overnight shift)')).toBeNull();
    await setNumber(dlg, /Break/, '45');
    await setNumber(dlg, /Late grace/, '15');
    await setNumber(dlg, /Early-exit grace/, '20');
    await setNumber(dlg, /Full-day minimum/, '400');
    await setNumber(dlg, /Half-day minimum/, '200');
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'inactive');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/attendance/shifts')).toHaveLength(1));
    const post = writes(f, '/attendance/shifts')[0]!;
    expect(method(post)).toBe('POST');
    expect(String(post[0])).toBe('/api/v1/attendance/shifts');
    expect(bodyOf(post)).toEqual({ code: 'EVE', name: 'Evening', startTime: '14:00', endTime: '22:00', breakMinutes: 45, graceMinutes: 15, earlyExitGraceMinutes: 20, halfDayMinMinutes: 200, fullDayMinMinutes: 400, overtimeAfterMinutes: null, status: 'inactive' });
    expect(await screen.findByText(/^Shift saved/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('editing fills the form from the shift, without seconds, and puts to its URL', async () => {
    const f = api();
    renderPage(<ShiftsAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Edit shift' });
    expect((within(dlg).getByLabelText(/Start time/) as HTMLInputElement).value).toBe('09:30');
    await setNumber(dlg, /Overtime after/, '600');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/attendance/shifts/s1')).toHaveLength(1));
    const put = writes(f, '/attendance/shifts/s1')[0]!;
    expect(method(put)).toBe('PUT');
    expect(bodyOf(put)).toMatchObject({ code: 'GEN', overtimeAfterMinutes: 600 });
    expect(bodyOf(put)['id']).toBeUndefined();
  });
  it('a shift with no overtime opens blank', async () => {
    api();
    renderPage(<ShiftsAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]!);
    const dlg = await screen.findByRole('dialog', { name: 'Edit shift' });
    expect((within(dlg).getByLabelText(/Overtime after/) as HTMLInputElement).value).toBe('');
    expect(within(dlg).getByText('Ends next day (overnight shift)')).toBeTruthy();
  });
  it('a half day longer than a full day is refused at the field', async () => {
    const f = api();
    renderPage(<ShiftsAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Edit shift' });
    await setNumber(dlg, /Half-day minimum/, '500');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Cannot be more than the full-day minimum')).toBeTruthy();
    expect(writes(f, '/attendance/shifts')).toHaveLength(0);
  });
  it('a refusal keeps the form open with the reason', async () => {
    api((url, init) => (init.method === 'PUT' ? problem(409, 'Shift is in use') : undefined));
    renderPage(<ShiftsAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Edit shift' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Shift is in use')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('assigning a shift', () => {
  const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Assign' })); return screen.findByRole('dialog', { name: 'Assign GEN shift' }); };
  it('needs someone, then posts them with the date', async () => {
    const f = api((url, init) => (url.endsWith('/shift-assignments') && init.method === 'POST' ? { assigned: 1 } : undefined));
    renderPage(<ShiftsAdmin />);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Assign' }));
    expect(await within(dlg).findByText('Select at least one person')).toBeTruthy();
    expect(writes(f, '/shift-assignments')).toHaveLength(0);
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    expect(within(dlg).queryByText('Select at least one person')).toBeNull();
    const from = within(dlg).getByLabelText(/Effective from/);
    await userEvent.clear(from);
    await userEvent.type(from, '2026-12-01');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(writes(f, '/shift-assignments')).toHaveLength(1));
    expect(bodyOf(writes(f, '/shift-assignments')[0]!)).toEqual({ employeeIds: ['e9'], shiftId: 's1', effectiveFrom: '2026-12-01' });
    expect(await screen.findByText('Assigned 1 employee(s)')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a refusal stays open with the reason', async () => {
    api((url, init) => (url.endsWith('/shift-assignments') && init.method === 'POST' ? problem(409, 'Attendance locked for that date') : undefined));
    renderPage(<ShiftsAdmin />);
    const dlg = await open();
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Assign' }));
    expect(await within(dlg).findByText('Attendance locked for that date')).toBeTruthy();
  });
});
