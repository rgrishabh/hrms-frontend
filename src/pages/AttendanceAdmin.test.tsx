import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, renderPage } from '../test/page';
import { AttendanceAdmin } from './AttendanceAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const ALL = ['FEATURE_SHIFTS', 'FEATURE_HOLIDAYS', 'FEATURE_ATTENDANCE_BIOMETRIC', 'FEATURE_ATTENDANCE_GEOFENCE'];
const api = (perms: string[], flags: string[]) => mockPageApi(perms, flags, () => ({ items: [], branches: [], departments: [], legalEntities: [], from: '2026-11-02', to: '2026-11-15', dates: [], shifts: [], canEdit: false }));
const tabs = () => screen.findAllByRole('tab').then((t) => t.map((x) => x.textContent));

afterEach(() => vi.restoreAllMocks());

describe('attendance setup', () => {
  it('someone who may do nothing here is told so', async () => {
    api([], ALL);
    renderPage(<AttendanceAdmin />);
    expect(await screen.findByText('Nothing to set up')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('a configurer sees every tab whose feature is on, and each opens its own screen', async () => {
    api(['attendance.configure', 'attendance.devices.manage', 'attendance.lock'], ALL);
    renderPage(<AttendanceAdmin />);
    expect(await tabs()).toEqual(['Shifts', 'Rosters', 'Holidays', 'Biometric devices', 'Geofences', 'Payroll locks']);
    expect(await screen.findByText('No shifts yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Rosters' }));
    expect(await screen.findByText('No patterns yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Holidays' }));
    expect(await screen.findByRole('button', { name: 'Add holiday' })).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Biometric devices' }));
    expect(await screen.findByText('No devices registered')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Geofences' }));
    expect(await screen.findByText('No geofences yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Payroll locks' }));
    expect(await screen.findByRole('button', { name: 'Lock period…' })).toBeTruthy();
  });
  it('features that are off take their tabs away', async () => {
    api(['attendance.configure', 'attendance.devices.manage', 'attendance.lock'], []);
    renderPage(<AttendanceAdmin />);
    expect(await tabs()).toEqual(['Payroll locks']);
  });
  it('a reader gets read-only geofences and locks', async () => {
    api(['attendance.read'], ALL);
    renderPage(<AttendanceAdmin />, '/attendance/admin?tab=locks');
    expect(await tabs()).toEqual(['Geofences', 'Payroll locks']);
    expect(await screen.findByText('No locked periods')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock period…' })).toBeNull();
  });
});
