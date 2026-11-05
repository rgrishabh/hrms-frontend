import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../test/page';
import { TeamAttendance } from './TeamAttendance';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const row = (over = {}) => ({ employee_id: 'e9', employee_code: 'E9', name: 'Bela Roy', branch_name: 'HQ', status: 'present', first_in: '2026-11-05T04:00:00.000Z', last_out: '2026-11-05T12:30:00.000Z', worked_minutes: 480, late_minutes: 12, exceptions: ['late_arrival', 'new_code'], locked: true, shift_code: 'GEN', selfie_id: 'sf1', ...over });
const page = (items: unknown[], over = {}) => ({ items, page: 1, pageSize: 50, total: items.length, summary: [{ status: 'present', count: 3 }, { status: 'absent', count: 1 }], ...over });
const ORG = { legalEntities: [], departments: [], branches: [{ id: 'b1', name: 'HQ' }] };
const api = (perms: string[], extra: Handler = () => undefined) => mockPageApi(perms, (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (url.endsWith('/org')) return ORG;
  return page([row(), row({ employee_id: 'e8', employee_code: 'E8', name: 'Ali Khan', first_in: null, last_out: null, worked_minutes: null, late_minutes: null, exceptions: null, locked: null, shift_code: null, selfie_id: null })]);
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T06:30:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('daily results', () => {
  it('HR sees everyone for today, with a summary, and the detail of each row', async () => {
    const f = api(['attendance.read']);
    renderPage(<TeamAttendance />);
    const bela = await screen.findByRole('row', { name: /Bela Roy/ });
    expect(screen.getByRole('heading', { name: 'Attendance' })).toBeTruthy();
    expect(reads(f, '/attendance/daily?date=2026-11-05&page=1&pageSize=50')).toHaveLength(1);
    expect(within(screen.getByRole('group', { name: 'Summary for this day' })).getByText('Present: 3')).toBeTruthy();
    expect(within(bela).getByText('Locked')).toBeTruthy();
    expect(within(bela).getByText('GEN')).toBeTruthy();
    expect(within(bela).getByText('8h 00m')).toBeTruthy();
    expect(within(bela).getByText('12m')).toBeTruthy();
    expect(within(bela).getByText('Late arrival')).toBeTruthy();
    expect(within(bela).getByText('new_code')).toBeTruthy();
    expect(within(bela).getByRole('button', { name: 'Clock-in selfie of Bela Roy' })).toBeTruthy();
    const ali = screen.getByRole('row', { name: /Ali Khan/ });
    expect(within(ali).queryByText('Locked')).toBeNull();
    expect(within(ali).queryByRole('button', { name: /selfie/ })).toBeNull();
  });
  it('a manager sees their team, without the branch filter', async () => {
    api(['attendance.team.read']);
    renderPage(<TeamAttendance />);
    await screen.findByRole('row', { name: /Bela Roy/ });
    expect(screen.getByRole('heading', { name: 'Team attendance' })).toBeTruthy();
    expect(screen.getByText('Employees in your reporting line: daily results.')).toBeTruthy();
    expect(screen.queryByLabelText('Branch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recalculate this day' })).toBeNull();
  });
  it('filters go to the server; a cleared date keeps the last one; no match reads as such', async () => {
    const f = api(['attendance.read'], (url) => (url.includes('exceptionsOnly') ? page([], { summary: [] }) : undefined));
    renderPage(<TeamAttendance />);
    await screen.findByRole('row', { name: /Bela Roy/ });
    await screen.findByRole('option', { name: 'HQ' });
    await userEvent.selectOptions(screen.getByLabelText('Branch'), 'b1');
    await waitFor(() => expect(reads(f, 'branchId=b1')).toHaveLength(1));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'absent');
    await waitFor(() => expect(reads(f, 'status=absent')).toHaveLength(1));
    const date = screen.getByLabelText('Date') as HTMLInputElement;
    await userEvent.clear(date);
    expect(date.value).toBe('2026-11-05');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exceptions only' }));
    await waitFor(() => expect(reads(f, 'exceptionsOnly=true')).toHaveLength(1));
    expect(await screen.findByText('No employees match these filters.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Summary for this day' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exceptions only' }));
    await screen.findByRole('row', { name: /Bela Roy/ });
  });
  it('a failed load shows why', async () => {
    api(['attendance.read'], (url) => (url.includes('/attendance/daily') ? problem(500, 'Daily results failed') : undefined));
    renderPage(<TeamAttendance />);
    expect(await screen.findByText('Daily results failed')).toBeTruthy();
  });
});

describe('recalculating', () => {
  const PERMS = ['attendance.read', 'attendance.recalculate'];
  const recalculated = (r: unknown): Handler => (url, init) => (url.includes('/recalculate') && init.method === 'POST' ? r : undefined);
  it('posts the day and branch, and says how many were done and skipped', async () => {
    const f = api(PERMS, recalculated({ daysCalculated: 8, lockedDaysSkipped: 2 }));
    renderPage(<TeamAttendance />);
    await screen.findByRole('option', { name: 'HQ' });
    await userEvent.selectOptions(screen.getByLabelText('Branch'), 'b1');
    await userEvent.click(screen.getByRole('button', { name: 'Recalculate this day' }));
    await waitFor(() => expect(writes(f, '/attendance/recalculate')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/recalculate')[0]!)).toEqual({ from: '2026-11-05', to: '2026-11-05', branchId: 'b1' });
    expect(await screen.findByText('Recalculated 8 day(s), 2 locked day(s) skipped')).toBeTruthy();
  });
  it('with nothing skipped says only what was done, and sends no branch when none is chosen', async () => {
    const f = api(PERMS, recalculated({ daysCalculated: 8, lockedDaysSkipped: 0 }));
    renderPage(<TeamAttendance />);
    await userEvent.click(await screen.findByRole('button', { name: 'Recalculate this day' }));
    expect(await screen.findByText('Recalculated 8 day(s)')).toBeTruthy();
    expect(bodyOf(writes(f, '/attendance/recalculate')[0]!)).toEqual({ from: '2026-11-05', to: '2026-11-05' });
  });
  it('a refusal shows the reason', async () => {
    api(PERMS, recalculated(problem(409, 'A recalculation is running')));
    renderPage(<TeamAttendance />);
    await userEvent.click(await screen.findByRole('button', { name: 'Recalculate this day' }));
    expect(await screen.findByText('A recalculation is running')).toBeTruthy();
  });
});
