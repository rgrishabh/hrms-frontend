import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtDate, fmtDateTime } from '../../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../../test/page';
import { AttendanceCalendar } from './AttendanceCalendar';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const FLAGS = ['FEATURE_ATTENDANCE', 'FEATURE_ATTENDANCE_REGULARIZATION'];
const result = (over = {}) => ({ work_date: '2026-11-03', status: 'present', shift_code: 'GEN', first_in: '2026-11-03T04:00:00.000Z', last_out: '2026-11-03T12:30:00.000Z', worked_minutes: 480, late_minutes: 12, early_exit_minutes: 7, overtime_minutes: 45, leave_fraction: 0, leave_type_code: null, duty_fraction: 0, exceptions: [], locked: false, ...over });
const DAYS = [
  result(),
  result({ work_date: '2026-11-02T00:00:00.000Z', status: 'half_day', shift_code: null, first_in: null, last_out: null, worked_minutes: 0, late_minutes: 0, early_exit_minutes: 0, overtime_minutes: 0, leave_fraction: '0.5', leave_type_code: 'EL', duty_fraction: '0.5', exceptions: ['late_arrival', 'made_up_code'] }),
  result({ work_date: '2026-11-04', status: 'on_duty', leave_fraction: '1', leave_type_code: 'SL', duty_fraction: '1', locked: true }),
];
const EVENTS = [
  { id: 'v1', direction: 'in', event_time: '2026-11-03T04:00:00.000Z', source: 'web', status: 'accepted' },
  { id: 'v2', direction: 'out', event_time: '2026-11-03T12:30:00.000Z', source: 'device', status: 'rejected' },
  { id: 'v3', direction: 'in', event_time: '2026-11-01T04:00:00.000Z', source: 'web', status: 'accepted' },
];
const api = (extra: Handler = () => undefined, flags = FLAGS) => mockPageApi(['attendance.self'], flags, (url, init) => extra(url, init) ?? (init.method !== 'GET' ? { ok: true } : { days: DAYS, events: EVENTS }));
const openDay = async (d: string) => { await userEvent.click(await screen.findByRole('button', { name: new RegExp(fmtDate(d).replaceAll('/', '.')) })); };

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T06:30:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the month', () => {
  it('reads my own attendance for the whole month, with counts by status and worked time on the day', async () => {
    const f = api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    const third = await screen.findByRole('button', { name: new RegExp(fmtDate('2026-11-03').replaceAll('/', '.')) });
    expect(reads(f, '/attendance/').map((c) => String(c[0]))).toContain('/api/v1/attendance/me?from=2026-11-01&to=2026-11-30');
    expect(third.textContent).toContain('Present');
    expect(third.textContent).toContain('8h 00m');
    expect(screen.getByText('Present: 1')).toBeTruthy();
    expect(screen.getByText('Half day: 1')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: new RegExp(fmtDate('2026-11-20').replaceAll('/', '.')) })).getByText('No record')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /11\/2026|Nov/ }).length).toBeGreaterThanOrEqual(30);
  });
  it('someone else is read from their own URL, with no correction on offer', async () => {
    const f = api();
    renderPage(<AttendanceCalendar employeeId="e9" self={false} />);
    await openDay('2026-11-03');
    expect(reads(f, '/attendance/employees/e9?from=2026-11-01&to=2026-11-30')).toHaveLength(1);
    await screen.findByText('Raw punches');
    expect(screen.queryByRole('button', { name: 'Request correction' })).toBeNull();
  });
  it('moves between months, closes the open day, and stops at the current month', async () => {
    const f = api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-03');
    await screen.findByText('Raw punches');
    const next = screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(reads(f, 'from=2026-10-01&to=2026-10-31')).toHaveLength(1));
    expect(screen.queryByText('Raw punches')).toBeNull();
    await waitFor(() => expect(next.disabled).toBe(false));
    await userEvent.click(next);
    await waitFor(() => expect(next.disabled).toBe(true));
  });
  it('a failed load shows the server reason', async () => {
    api((url) => (url.includes('/attendance/me') ? problem(500, 'Calendar is down') : undefined));
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    expect(await screen.findByText('Calendar is down')).toBeTruthy();
  });
});

describe('a day', () => {
  const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? screen.getByText(label).parentElement?.textContent;
  it('shows the results and only that day\'s punches, with anything not accepted marked', async () => {
    api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-03');
    expect(await screen.findByText('Raw punches')).toBeTruthy();
    expect(screen.getByRole('button', { pressed: true }).textContent).toContain('3');
    expect(value('Shift')).toContain('GEN');
    expect(value('Late')).toContain('12 min');
    expect(value('Early exit')).toContain('7 min');
    expect(value('Overtime')).toContain('0h 45m');
    expect(screen.getByText(`${fmtDateTime(EVENTS[0]!.event_time)} · in · web`)).toBeTruthy();
    expect(screen.getByText(`${fmtDateTime(EVENTS[1]!.event_time)} · out · device (rejected)`)).toBeTruthy();
    expect(screen.queryByText(new RegExp(fmtDateTime(EVENTS[2]!.event_time).replaceAll('/', '.')))).toBeNull();
    expect(screen.queryByText('Leave')).toBeNull();
    expect(screen.queryByText('Field duty')).toBeNull();
  });
  it('shows half-day leave and duty, known and unknown exceptions, and the next morning for an overnight shift', async () => {
    api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-02');
    expect(await screen.findByText('EL · half day')).toBeTruthy();
    expect(value('Field duty')).toContain('half day');
    expect(value('Shift')).toContain('None');
    expect(value('Late')).toContain('—');
    expect(screen.getByText('Late arrival')).toBeTruthy();
    expect(screen.getByText('made_up_code')).toBeTruthy();
    expect(screen.getByText(`${fmtDateTime(EVENTS[0]!.event_time)} · in · web`)).toBeTruthy();
    expect(screen.queryByText(new RegExp(`${fmtDateTime(EVENTS[1]!.event_time).replaceAll('/', '.')}`))).toBeNull();
  });
  it('a day locked for payroll says so, shows full-day leave and duty, and cannot be corrected', async () => {
    api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-04');
    expect(await screen.findByText('Locked for payroll')).toBeTruthy();
    expect(screen.getByText('SL · full day')).toBeTruthy();
    expect(value('Field duty')).toContain('full day');
    expect(screen.getByText('No punches recorded.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request correction' })).toBeNull();
  });
  it('a day with no result says so; a future day and a switched-off feature offer no correction', async () => {
    api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-01');
    expect(await screen.findByText('No calculated result for this day yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request correction' })).toBeTruthy();
    await openDay('2026-11-06');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Request correction' })).toBeNull());
  });
  it('without the regularization feature there is no correction', async () => {
    api(undefined, ['FEATURE_ATTENDANCE']);
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    await openDay('2026-11-03');
    await screen.findByText('Raw punches');
    expect(screen.queryByRole('button', { name: 'Request correction' })).toBeNull();
  });
});

describe('asking for a correction', () => {
  const open = async () => {
    await openDay('2026-11-03');
    await userEvent.click(await screen.findByRole('button', { name: 'Request correction' }));
    return screen.findByRole('dialog', { name: `Attendance correction · ${fmtDate('2026-11-03')}` });
  };
  it('starts with no suggested times, and cannot be sent until one is entered', async () => {
    api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    const dlg = await open();
    expect((within(dlg).getByLabelText('In time') as HTMLInputElement).value).toBe('');
    expect((within(dlg).getByLabelText('Out time') as HTMLInputElement).value).toBe('');
    expect((within(dlg).getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('posts the day, the time given as an instant, and the reason; closes and thanks', async () => {
    const f = api();
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('In time'), '2026-11-03T09:30');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Forgot to punch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(writes(f, '/attendance/regularizations')).toHaveLength(1));
    const body = bodyOf(writes(f, '/attendance/regularizations')[0]!);
    expect(body).toMatchObject({ workDate: '2026-11-03', reason: 'Forgot to punch' });
    expect(Date.parse(String(body['requestedIn']))).toBe(Date.parse('2026-11-03T04:00:00.000Z'));
    expect(body['requestedOut']).toBeUndefined();
    expect(await screen.findByText('Correction request submitted for approval')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a refusal keeps the form open with the reason and what was typed', async () => {
    api((url, init) => (init.method === 'POST' ? problem(409, 'A request is already pending') : undefined));
    renderPage(<AttendanceCalendar employeeId="e1" self />);
    const dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Out time'), '2026-11-03T18:00');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Left late');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit request' }));
    expect(await within(dlg).findByText('A request is already pending')).toBeTruthy();
    expect((within(dlg).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Left late');
  });
});
