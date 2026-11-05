import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '../format';
import { mockPageApi, problem, reads, renderPage, type Handler } from '../test/page';
import { MyAttendance } from './MyAttendance';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const REG = { id: 'r1', work_date: '2026-10-05', requested_in: '2026-10-05T04:00:00.000Z', requested_out: null, reason: 'Forgot to punch', status: 'pending' };
const TODAY = { linked: true, today: '2026-11-05', timezone: 'Asia/Kolkata', nextDirection: 'in', locationMode: 'off', channels: { web: true, mobile: false }, events: [], daily: null };
const api = (flags: string[], extra: Handler = () => undefined, employeeId: string | null = 'e1') => mockPageApi(['attendance.self'], flags, (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (url.includes('/regularizations')) return { items: [REG] };
  if (url.includes('/attendance/me/today')) return TODAY;
  if (url.includes('/attendance/me')) return { days: [], events: [] };
  return { items: [] };
}, employeeId);

afterEach(() => vi.restoreAllMocks());

describe('my attendance', () => {
  it('with web clocking on shows the punch card, my month, and my recent requests', async () => {
    const f = api(['FEATURE_ATTENDANCE', 'FEATURE_ATTENDANCE_WEB']);
    renderPage(<MyAttendance />);
    expect(await screen.findByRole('button', { name: 'Clock in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'My correction requests' });
    expect(reads(f, '/attendance/regularizations?scope=mine&pageSize=10')).toHaveLength(1);
    const row = within(table).getByRole('row', { name: /Forgot to punch/ });
    expect(within(row).getByText(fmtDate(REG.work_date))).toBeTruthy();
    expect(within(row).getByText('Pending')).toBeTruthy();
  });
  it('a withheld reason stays hidden', async () => {
    api([], (url) => (url.includes('/regularizations') ? { items: [{ ...REG, reason: null, masked: true, maskedFields: ['reason'] }] } : undefined));
    renderPage(<MyAttendance />);
    expect(await screen.findByText(/^Hidden\./)).toBeTruthy();
    expect(screen.queryByText('Forgot to punch')).toBeNull();
  });
  it('with clocking off, no punch card, and no requests says so', async () => {
    api(['FEATURE_ATTENDANCE'], (url) => (url.includes('/regularizations') ? { items: [] } : undefined));
    renderPage(<MyAttendance />);
    expect(await screen.findByText('No requests yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clock in' })).toBeNull();
  });
  it('a login with no employee record gets no calendar or punch card', async () => {
    const f = api(['FEATURE_ATTENDANCE_WEB'], undefined, null);
    renderPage(<MyAttendance />);
    await screen.findByRole('table', { name: 'My correction requests' });
    expect(screen.queryByRole('button', { name: 'Previous month' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clock in' })).toBeNull();
    expect(reads(f, '/attendance/me')).toHaveLength(0);
  });
  it('a failed request list shows why', async () => {
    api([], (url) => (url.includes('/regularizations') ? problem(500, 'Requests failed') : undefined));
    renderPage(<MyAttendance />);
    expect(await screen.findByText('Requests failed')).toBeTruthy();
  });
});
