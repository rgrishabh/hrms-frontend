import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { problem, mockPageApi, renderPage } from '../../test/page';
import { PunchCard } from './PunchCard';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const TODAY = { linked: true, today: '2026-11-05', timezone: 'Asia/Kolkata', nextDirection: 'in', locationMode: 'off', channels: { web: true, mobile: false }, events: [], daily: null };
const PERMS = ['attendance.self'];
const FLAGS = { FEATURE_ATTENDANCE: true, FEATURE_ATTENDANCE_WEB: true, FEATURE_ATTENDANCE_MOBILE: true, FEATURE_ATTENDANCE_SELFIE: true, FEATURE_ATTENDANCE_GEOFENCE: true };
const NOW = '2026-11-05T04:00:00.000Z';

type Calls = { url: string; init: RequestInit }[];
function api(today: object, punch: () => unknown, flags: Record<string, boolean> = FLAGS) {
  const calls: Calls = [];
  mockPageApi(PERMS, (url, init) => {
    if (url.endsWith('/attendance/me/today')) return { ...TODAY, ...today };
    calls.push({ url, init });
    if (url.endsWith('/attendance/selfies')) return { id: 'selfie-1' };
    if (url.endsWith('/attendance/punch')) return punch();
    return {};
  }, flags);
  return calls;
}
const punches = (calls: Calls) => calls.filter((c) => c.url.endsWith('/attendance/punch')).map((c) => JSON.parse(String(c.init.body)) as { selfieId?: string; latitude?: number });
const coarse = () => vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: q.includes('coarse'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
const geo = (impl: Geolocation['getCurrentPosition']) => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: impl } });
const at = (ok: PositionCallback) => ok({ coords: { latitude: 19.1, longitude: 72.9 } } as GeolocationPosition);

afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'geolocation'); });

describe('selfie at clock-in', () => {
  it('with the flag on and required, a clock-in goes through the photo and carries its id', async () => {
    const calls = api({ selfieRequired: true }, () => ({ duplicate: false, direction: 'in', eventTime: NOW }));
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    const dialog = await screen.findByRole('dialog', { name: 'Take a selfie to clock in' });
    expect(dialog).toBeTruthy();
    expect(punches(calls)).toEqual([]);
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await userEvent.upload(await screen.findByLabelText('Choose a photo'), file);
    await userEvent.click(await screen.findByRole('button', { name: 'Use photo and clock in' }));
    await waitFor(() => expect(punches(calls)).toHaveLength(1));
    expect(punches(calls)[0]!.selfieId).toBe('selfie-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a failed clock-in keeps the dialog open with the reason, and a retry does not upload again', async () => {
    let fail = true;
    const calls = api({ selfieRequired: true }, () => { if (fail) { fail = false; return problem(409, 'Clock-in is locked'); } return { duplicate: false, direction: 'in', eventTime: NOW }; });
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    await userEvent.upload(await screen.findByLabelText('Choose a photo'), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use photo and clock in' }));
    expect(await screen.findByText('Clock-in is locked')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Use photo and clock in' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.filter((c) => c.url.endsWith('/attendance/selfies'))).toHaveLength(1);
  });
  it('with the flag off, no camera is involved even if the server says required', async () => {
    const calls = api({ selfieRequired: true }, () => ({ duplicate: false, direction: 'in', eventTime: NOW }), { ...FLAGS, FEATURE_ATTENDANCE_SELFIE: false });
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    await waitFor(() => expect(punches(calls)).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('clocking out asks for no photo', async () => {
    const calls = api({ selfieRequired: true, nextDirection: 'out' }, () => ({ duplicate: false, direction: 'out', eventTime: NOW }));
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock out' }));
    await waitFor(() => expect(punches(calls)).toHaveLength(1));
  });
});

describe('geofence at clock-in', () => {
  const mobile = { channels: { web: false, mobile: true }, locationMode: 'required' };
  it('outside the area when not enforced: recorded, and the person is told', async () => {
    coarse();
    geo((ok) => at(ok));
    const calls = api(mobile, () => ({ duplicate: false, direction: 'in', eventTime: NOW, outsideGeofence: true }));
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText(/outside your branch's area/)).toBeTruthy();
    expect(punches(calls)[0]!.latitude).toBe(19.1);
  });
  it('outside the area when enforced: stays on the card with what to do, and can be retried', async () => {
    coarse();
    geo((ok) => at(ok));
    api(mobile, () => problem(403, 'You are outside the area', { code: 'outside_geofence' }));
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText(/Move closer and try again/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
  it('required location that is blocked explains how to allow it, and sends nothing', async () => {
    coarse();
    geo((_ok, err) => err?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError));
    const calls = api(mobile, () => ({}));
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText(/Location is blocked for this site/)).toBeTruthy();
    expect(punches(calls)).toEqual([]);
  });
  it('with the flag off, location is never requested', async () => {
    coarse();
    const ask = vi.fn();
    geo(ask);
    const calls = api(mobile, () => ({ duplicate: false, direction: 'in', eventTime: NOW }), { ...FLAGS, FEATURE_ATTENDANCE_GEOFENCE: false });
    renderPage(<PunchCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clock in' }));
    await waitFor(() => expect(punches(calls)).toHaveLength(1));
    expect(ask).not.toHaveBeenCalled();
  });
});
