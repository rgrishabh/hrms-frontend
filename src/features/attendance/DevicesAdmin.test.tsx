import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fmtDateTime } from '../../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../../test/page';
import { DevicesAdmin } from './DevicesAdmin';

// A first render under CPU load can take seconds; failures should be about behaviour, not machine speed.
configure({ asyncUtilTimeout: 15000 });

const GATE = { id: 'd1', name: 'Gate', serial_number: 'SN-1', api_key_prefix: 'k_ab', branch_name: 'HQ', status: 'active', last_sync_at: '2026-11-01T04:00:00.000Z', last_clock_drift_seconds: 12, last_error: 'Clock skew', unmapped_events: 3 };
const SIDE = { ...GATE, id: 'd2', name: 'Side door', status: 'disabled', last_sync_at: null, last_clock_drift_seconds: null, last_error: null, unmapped_events: 0 };
const EVENT = { id: 'u1', device_user_id: '77 A', event_time: '2026-11-02T04:00:00.000Z', device_name: 'Gate' };
const MAPPING = { device_user_id: '55', name: 'Bela Roy', employee_code: 'E9' };
const api = (extra: Handler = () => undefined) => mockPageApi(['attendance.devices.manage'], (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method !== 'GET') return { ok: true };
  if (url.endsWith('/attendance/devices')) return { items: [GATE, SIDE] };
  if (url.includes('/device-events/unmapped')) return { items: [EVENT] };
  if (url.includes('/device-mappings')) return { items: [MAPPING] };
  if (url.endsWith('/org')) return { legalEntities: [], departments: [], branches: [{ id: 'b1', name: 'HQ' }] };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Bela', last_name: 'Roy', employee_code: 'E9' }] };
  return { items: [] };
});
const method = (c: unknown[]) => (c[1] as RequestInit).method;

afterEach(() => vi.restoreAllMocks());

describe('device lists', () => {
  it('shows each device with its sync state, the queue and the mappings', async () => {
    api();
    renderPage(<DevicesAdmin />);
    const gate = await screen.findByRole('row', { name: /^Gate/ });
    expect(within(gate).getByText(/SN-1 · k_ab/)).toBeTruthy();
    expect(within(gate).getByText(fmtDateTime(GATE.last_sync_at))).toBeTruthy();
    expect(within(gate).getByText(/12s/)).toBeTruthy();
    expect(within(gate).getByText('Clock skew')).toBeTruthy();
    expect(within(gate).getByText('3')).toBeTruthy();
    expect(within(gate).getByRole('button', { name: 'Disable' })).toBeTruthy();
    const side = screen.getByRole('row', { name: /Side door/ });
    expect(within(side).getByText('Never')).toBeTruthy();
    expect(within(side).getByRole('button', { name: 'Activate' })).toBeTruthy();
    expect(await screen.findByText('77 A')).toBeTruthy();
    const mapping = await screen.findByRole('row', { name: /Bela Roy/ });
    expect(within(mapping).getByText('55')).toBeTruthy();
    expect(within(mapping).getByText('E9')).toBeTruthy();
  });
  it('says so when nothing is registered, queued or mapped', async () => {
    api((url, init) => (init.method !== 'GET' ? undefined : url.includes('/attendance/device') ? { items: [] } : undefined));
    renderPage(<DevicesAdmin />);
    expect(await screen.findByText('No devices registered')).toBeTruthy();
    expect(await screen.findByText('Queue is empty.')).toBeTruthy();
    expect(await screen.findByText('No mappings yet.')).toBeTruthy();
  });
});

describe('registering a device', () => {
  it('posts the form, shows the key once, and copies it', async () => {
    const f = api((url, init) => (url.endsWith('/attendance/devices') && init.method === 'POST' ? { apiKey: 'secret-key' } : undefined));
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Register device' }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const dlg = await screen.findByRole('dialog', { name: 'Register biometric device' });
    await within(dlg).findByRole('option', { name: 'HQ' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/Branch/), 'b1');
    await userEvent.type(within(dlg).getByLabelText(/Serial number/), 'SN-9');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Back gate');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Integration adapter/), 'generic_push_v1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Register' }));
    const key = await screen.findByRole('dialog', { name: 'Device API key' });
    expect(bodyOf(writes(f, '/attendance/devices')[0]!)).toEqual({ branchId: 'b1', serialNumber: 'SN-9', name: 'Back gate', adapterKey: 'generic_push_v1' });
    expect(within(key).getByText('secret-key')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Register biometric device' })).toBeNull();
    await userEvent.click(within(key).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('secret-key'));
    expect(await screen.findByText('Copied')).toBeTruthy();
    await userEvent.click(within(key).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    Reflect.deleteProperty(navigator, 'clipboard');
  });
  it('a refused copy says why, and the key stays on screen', async () => {
    api((url, init) => (url.includes('rotate-key') && init.method === 'POST' ? { apiKey: 'rotated-key' } : undefined));
    renderPage(<DevicesAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Rotate key' }))[0]!);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard is blocked')) } });
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Rotate device key' })).getByRole('button', { name: 'Rotate key' }));
    const key = await screen.findByRole('dialog', { name: 'Device API key' });
    expect(within(key).getByText('rotated-key')).toBeTruthy();
    await userEvent.click(within(key).getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Clipboard is blocked')).toBeTruthy();
    expect(within(key).getByText('rotated-key')).toBeTruthy();
    Reflect.deleteProperty(navigator, 'clipboard');
  });
  it('a refusal keeps the form open with the reason and the field message', async () => {
    api((url, init) => (url.endsWith('/attendance/devices') && init.method === 'POST' ? problem(422, 'Serial already registered') : undefined));
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Register device' }));
    const dlg = await screen.findByRole('dialog', { name: 'Register biometric device' });
    await within(dlg).findByRole('option', { name: 'HQ' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/Branch/), 'b1');
    await userEvent.type(within(dlg).getByLabelText(/Serial number/), 'SN-1');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Dup');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Register' }));
    expect(await within(dlg).findByText('Serial already registered')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('disabling and enabling', () => {
  it('disabling warns, patches and confirms', async () => {
    const f = api();
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    const dlg = await screen.findByRole('dialog', { name: 'Disable device' });
    expect(within(dlg).getByText('Gate will stop sending attendance until it is enabled again.')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(writes(f, '/attendance/devices/d1')).toHaveLength(1));
    expect(method(writes(f, '/attendance/devices/d1')[0]!)).toBe('PATCH');
    expect(bodyOf(writes(f, '/attendance/devices/d1')[0]!)).toEqual({ status: 'disabled' });
    expect(await screen.findByText('Device disabled')).toBeTruthy();
  });
  it('enabling patches back to active', async () => {
    const f = api();
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const dlg = await screen.findByRole('dialog', { name: 'Enable device' });
    expect(within(dlg).getByText('Side door can send attendance again.')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(writes(f, '/attendance/devices/d2')).toHaveLength(1));
    expect(bodyOf(writes(f, '/attendance/devices/d2')[0]!)).toEqual({ status: 'active' });
    expect(await screen.findByText('Device enabled')).toBeTruthy();
  });
  it('cancelling a rotation changes nothing', async () => {
    const f = api();
    renderPage(<DevicesAdmin />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Rotate key' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Rotate device key' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, 'rotate-key')).toHaveLength(0);
  });
});

describe('mapping an enrolment id', () => {
  const pick = async (dlg: HTMLElement) => {
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Bela Roy/ }));
  };
  it('from the queue, starts on that id, needs an employee, and encodes the id in the URL', async () => {
    const f = api((url, init) => (url.includes('/device-mappings/') && init.method === 'PUT' ? { reprocessedEvents: 4 } : undefined));
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Map to employee' }));
    const dlg = await screen.findByRole('dialog', { name: 'Map device enrolment ID' });
    expect((within(dlg).getByLabelText(/Device user ID/) as HTMLInputElement).value).toBe('77 A');
    await userEvent.type(within(dlg).getByRole('combobox', { name: /Employee/ }), 'Bel');
    await waitFor(() => expect(reads(f, 'search=Bel')).toHaveLength(1)); // the search has settled, so the options will not change under the click
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save mapping' }));
    expect(await within(dlg).findByText('Choose an employee')).toBeTruthy();
    expect(writes(f, '/device-mappings')).toHaveLength(0);
    await pick(dlg);
    expect(within(dlg).queryByText('Choose an employee')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(writes(f, '/device-mappings')).toHaveLength(1));
    const put = writes(f, '/device-mappings')[0]!;
    expect(String(put[0])).toBe('/api/v1/attendance/device-mappings/77%20A');
    expect(method(put)).toBe('PUT');
    expect(bodyOf(put)).toEqual({ employeeId: 'e9' });
    expect(await screen.findByText('Mapped. 4 queued event(s) processed.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('from Add mapping, starts blank; a refusal keeps it open with the reason', async () => {
    api((url, init) => (url.includes('/device-mappings/') && init.method === 'PUT' ? problem(409, 'That ID is mapped') : undefined));
    renderPage(<DevicesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add mapping' }));
    const dlg = await screen.findByRole('dialog', { name: 'Map device enrolment ID' });
    const id = within(dlg).getByLabelText(/Device user ID/) as HTMLInputElement;
    expect(id.value).toBe('');
    await userEvent.type(id, '99');
    await pick(dlg);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save mapping' }));
    expect(await within(dlg).findByText('That ID is mapped')).toBeTruthy();
    expect(id.value).toBe('99');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
