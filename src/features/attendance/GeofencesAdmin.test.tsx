import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, renderPage, writes, type Handler } from '../../test/page';
import { GeofencesAdmin, validateGeofence } from './GeofencesAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.

const FENCE = { branch_id: 'b1', branch_name: 'HQ', latitude: '19.076000', longitude: 72.8777, radius_m: 1500, updated_at: '2026-10-01T04:00:00.000Z' };
const ORG = { legalEntities: [], departments: [], branches: [{ id: 'b1', name: 'HQ' }, { id: 'b2', name: 'Pune' }] };
const api = (extra: Handler = () => undefined, fences: unknown[] = [FENCE], org: unknown = ORG) => mockPageApi(['attendance.configure'], (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true };
  if (url.endsWith('/org')) return org;
  return { items: fences };
});
const method = (c: unknown[]) => (c[1] as RequestInit).method;

afterEach(() => vi.restoreAllMocks());

describe('validateGeofence', () => {
  it('accepts the edges of each range', () => {
    expect(validateGeofence('-90', '180', '10')).toEqual({});
    expect(validateGeofence('90', '-180', '100000')).toEqual({});
  });
  it('names each bad field', () => {
    expect(Object.keys(validateGeofence('', ' ', ''))).toEqual(['latitude', 'longitude', 'radiusMeters']);
    expect(Object.keys(validateGeofence('91', '181', '9'))).toEqual(['latitude', 'longitude', 'radiusMeters']);
    expect(Object.keys(validateGeofence('abc', 'x', '10.5'))).toEqual(['latitude', 'longitude', 'radiusMeters']);
  });
});

describe('geofence list', () => {
  it('lists every branch, set or not, and an editor can set or change each', async () => {
    api();
    renderPage(<GeofencesAdmin canEdit />);
    const hq = await screen.findByRole('row', { name: /HQ/ });
    expect(within(hq).getByText('Set')).toBeTruthy();
    expect(within(hq).getByText('19.076')).toBeTruthy();
    expect(within(hq).getByText('72.8777')).toBeTruthy();
    expect(within(hq).getByText(/1,500 m/)).toBeTruthy();
    expect(within(hq).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(hq).getByRole('button', { name: 'Remove' })).toBeTruthy();
    const pune = screen.getByRole('row', { name: /Pune/ });
    expect(within(pune).getByText('Not set')).toBeTruthy();
    expect(within(pune).getByRole('button', { name: 'Set area' })).toBeTruthy();
    expect(within(pune).queryByRole('button', { name: 'Remove' })).toBeNull();
  });
  it('a reader sees the list and no actions', async () => {
    api();
    renderPage(<GeofencesAdmin canEdit={false} />);
    await screen.findByRole('row', { name: /HQ/ });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });
  it('without org access lists what exists, by the name on the fence', async () => {
    api((url) => (url.endsWith('/org') ? problem(403, 'No') : undefined));
    renderPage(<GeofencesAdmin canEdit={false} />);
    expect(await screen.findByRole('row', { name: /HQ/ })).toBeTruthy();
    expect(screen.queryByText('Pune')).toBeNull();
  });
  it('with no branch and no fence, says to add a branch first', async () => {
    api(undefined, [], { legalEntities: [], departments: [], branches: [] });
    renderPage(<GeofencesAdmin canEdit />);
    expect(await screen.findByText('No geofences yet')).toBeTruthy();
    expect(screen.getByText('Add a branch first, then set its area here.')).toBeTruthy();
  });
});

describe('setting an area', () => {
  it('starts at 200 metres, shows range mistakes at the fields, then puts numbers', async () => {
    const f = api();
    renderPage(<GeofencesAdmin canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Set area' }));
    const dlg = await screen.findByRole('dialog', { name: 'Geofence for Pune' });
    expect((within(dlg).getByLabelText(/Radius/) as HTMLInputElement).value).toBe('200');
    await userEvent.type(within(dlg).getByLabelText(/Latitude/), '95');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Enter a latitude from -90 to 90')).toBeTruthy();
    expect(within(dlg).getByText('Enter a longitude from -180 to 180')).toBeTruthy();
    expect(writes(f, '/geofences')).toHaveLength(0);
    await userEvent.clear(within(dlg).getByLabelText(/Latitude/));
    expect(within(dlg).queryByText('Enter a latitude from -90 to 90')).toBeNull();
    await userEvent.type(within(dlg).getByLabelText(/Latitude/), '18.52');
    await userEvent.type(within(dlg).getByLabelText(/Longitude/), '73.85');
    expect(within(dlg).queryByText('Enter a longitude from -180 to 180')).toBeNull();
    await userEvent.clear(within(dlg).getByLabelText(/Radius/));
    await userEvent.type(within(dlg).getByLabelText(/Radius/), '5');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Enter whole metres from 10 to 100000')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/Radius/), '00');
    expect(within(dlg).queryByText('Enter whole metres from 10 to 100000')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/geofences/b2')).toHaveLength(1));
    const put = writes(f, '/geofences/b2')[0]!;
    expect(method(put)).toBe('PUT');
    expect(bodyOf(put)).toEqual({ latitude: 18.52, longitude: 73.85, radiusMeters: 500 });
    expect(await screen.findByText('Geofence saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('editing opens on the saved values, and a refusal keeps the form open with the reason', async () => {
    api((url, init) => (init.method === 'PUT' ? problem(422, 'Radius too wide for this plan') : undefined));
    renderPage(<GeofencesAdmin canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Geofence for HQ' });
    expect((within(dlg).getByLabelText(/Latitude/) as HTMLInputElement).value).toBe('19.076000');
    expect((within(dlg).getByLabelText(/Longitude/) as HTMLInputElement).value).toBe('72.8777');
    expect((within(dlg).getByLabelText(/Radius/) as HTMLInputElement).value).toBe('1500');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Radius too wide for this plan')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('removing an area', () => {
  const remove = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const dlg = await screen.findByRole('dialog', { name: 'Remove geofence' });
    expect(within(dlg).getByText(/Remove the area for HQ\?/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove' }));
  };
  it('deletes it after asking, and Undo puts the same area back', async () => {
    const f = api();
    renderPage(<GeofencesAdmin canEdit />);
    await remove();
    await waitFor(() => expect(writes(f, '/geofences/b1').map(method)).toEqual(['DELETE']));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/geofences/b1').map(method)).toEqual(['DELETE', 'PUT']));
    expect(bodyOf(writes(f, '/geofences/b1')[1]!)).toEqual({ latitude: 19.076, longitude: 72.8777, radiusMeters: 1500 });
    expect(await screen.findByText('Geofence restored')).toBeTruthy();
  });
  it('a failed Undo shows the reason', async () => {
    api((url, init) => (init.method === 'PUT' ? problem(409, 'Branch closed') : undefined));
    renderPage(<GeofencesAdmin canEdit />);
    await remove();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Branch closed')).toBeTruthy();
  });
  it('a failed removal keeps the dialog open', async () => {
    api((url, init) => (init.method === 'DELETE' ? problem(409, 'Clock-ins running') : undefined));
    renderPage(<GeofencesAdmin canEdit />);
    await remove();
    const dlg = screen.getByRole('dialog', { name: 'Remove geofence' });
    expect(await within(dlg).findByText('Clock-ins running')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
