import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayLocal } from '../../format';
import { Cases } from '../../pages/Cases';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';

configure({ asyncUtilTimeout: 10000 });
afterEach(() => vi.restoreAllMocks());

const FULL = { members: [{ user_id: 'u2', display_name: 'Priya Shah', role: 'presiding_officer' }, { user_id: 'u3', display_name: 'Ravi Nair', role: 'member' }], external: [{ id: 'x1', name: 'Dr Mehta', organization: 'Sakhi NGO', since: '2026-01-10' }], warnings: ['At least half the members must be women'] };
const EMPTY = { members: [], external: [], warnings: [] };
const REPORT = { year: 2026, received: 5, disposed: 3, pending: 2, pending_over_90: 1 };
const PEOPLE = { items: [{ id: 'u2', display_name: 'Priya Shah' }, { id: 'u3', display_name: 'Ravi Nair' }, { id: 'u4', display_name: 'Nina Das' }] };

type Extra = (url: string, init: RequestInit) => unknown;
const api = (committee: object, perms: readonly string[] = ['cases.self', 'posh.admin'], extra: Extra = () => undefined) => mockPageApi(perms, ['FEATURE_POSH'], (url, init) => {
  const out = extra(url, init);
  if (out !== undefined) return out;
  if (init.method !== 'GET') return { ok: true };
  if (url.includes('/cases/annual') || url.includes('/annual-report')) return REPORT;
  if (url.includes('/cases/committee')) return committee;
  if (url.includes('/cases/people')) return PEOPLE;
  return { items: [] };
});
const openForm = async (name: string) => {
  renderPage(<Cases />, '/cases?tab=committee');
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Internal Committee membership' });
};

describe('the committee', () => {
  it('lists members, external members and what is missing', async () => {
    api(FULL);
    renderPage(<Cases />, '/cases?tab=committee');
    const list = await screen.findByRole('list', { name: 'Committee members' });
    expect(within(list).getByText('Priya Shah, presiding officer')).toBeTruthy();
    expect(within(list).getByText('Ravi Nair, member')).toBeTruthy();
    expect(within(list).getByText('Dr Mehta, external member (Sakhi NGO)')).toBeTruthy();
    expect(screen.getByText('At least half the members must be women')).toBeTruthy();
  });
  it('someone outside it who administers nothing is told to contact HR, with no report and no edit', async () => {
    const f = api(EMPTY, ['cases.self']);
    renderPage(<Cases />, '/cases?tab=committee');
    expect(await screen.findByText('Contact HR.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up the committee' })).toBeNull();
    expect(screen.queryByText('Annual report')).toBeNull();
    expect(reads(f, '/annual-report')).toHaveLength(0);
  });
  it('a committee member without admin sees the report and the complaints tab, but cannot edit', async () => {
    const onIt = { ...FULL, members: [{ user_id: 'u1', display_name: 'A', role: 'member' }] };
    const f = api(onIt, ['cases.self']);
    renderPage(<Cases />, '/cases?tab=committee');
    expect(await screen.findByRole('tab', { name: 'POSH complaints (IC)' })).toBeTruthy();
    expect(await screen.findByText('Annual report')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit membership' })).toBeNull();
    await waitFor(() => expect(reads(f, '/annual-report').length).toBeGreaterThan(0));
  });
});

describe('the annual report', () => {
  it('shows the counts, marks anything past 90 days, and asks again for another year', async () => {
    const f = api(FULL);
    renderPage(<Cases />, '/cases?tab=committee');
    const thisYear = Number(todayLocal().slice(0, 4));
    const stats = await screen.findByRole('group', { name: 'Complaints in 2026' });
    for (const [label, value] of [['Received', '5'], ['Disposed', '3'], ['Pending', '2']] as const) expect(within(within(stats).getByText(label).parentElement!).getByText(value)).toBeTruthy();
    const over = within(stats).getByText('Pending beyond 90 days').parentElement!;
    expect(over.className).toContain('tile--bad');
    expect(reads(f, `/annual-report?year=${thisYear}`).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Year'), String(thisYear - 2));
    await waitFor(() => expect(reads(f, `/annual-report?year=${thisYear - 2}`).length).toBeGreaterThan(0));
    expect(screen.getByRole('option', { name: String(thisYear - 5) })).toBeTruthy();
    expect(screen.queryByRole('option', { name: String(thisYear - 6) })).toBeNull();
  });
  it('nothing past 90 days is not marked', async () => {
    api(FULL, undefined, (url) => (url.includes('/annual-report') ? { ...REPORT, pending_over_90: 0 } : undefined));
    renderPage(<Cases />, '/cases?tab=committee');
    const label = await screen.findByText('Pending beyond 90 days');
    expect(label.parentElement!.className).toContain('tile--neutral');
  });
});

describe('membership', () => {
  it('setting up needs exactly one presiding officer before anything is sent', async () => {
    const f = api(EMPTY);
    const form = await openForm('Set up the committee');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toBeTruthy();
    expect(within(form).getByText('Choose exactly one presiding officer')).toBeTruthy();
    expect(writes(f, '/cases/committee')).toHaveLength(0);
  });
  it('changes roles, adds and removes people, and sends ids with roles only', async () => {
    const f = api(FULL);
    const form = await openForm('Edit membership');
    await userEvent.selectOptions(within(form).getByLabelText('Role of Priya Shah'), 'member');
    await userEvent.selectOptions(within(form).getByLabelText('Role of Ravi Nair'), 'presiding_officer');
    await userEvent.click(within(form).getByRole('combobox', { name: 'Add a member' }));
    const option = await within(form).findByRole('option', { name: 'Nina Das' });
    // People already on the committee are not offered again.
    expect(within(form).queryByRole('option', { name: 'Ravi Nair' })).toBeNull();
    await userEvent.click(option);
    expect(await within(form).findByLabelText('Role of Nina Das')).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: 'Remove Priya Shah' }));
    expect(within(form).queryByLabelText('Role of Priya Shah')).toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/committee')).toHaveLength(1));
    expect((writes(f, '/cases/committee')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/cases/committee')[0]!)).toEqual({
      members: [{ userId: 'u3', role: 'presiding_officer' }, { userId: 'u4', role: 'member' }],
      external: [{ name: 'Dr Mehta', organization: 'Sakhi NGO', since: '2026-01-10' }],
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Internal Committee membership' })).toBeNull());
  });
  it('someone just added is not offered again, so nobody appears twice', async () => {
    const f = api(FULL);
    const form = await openForm('Edit membership');
    const search = within(form).getByRole('combobox', { name: 'Add a member' });
    await userEvent.click(search);
    await userEvent.click(await within(form).findByRole('option', { name: 'Nina Das' }));
    await within(form).findByLabelText('Role of Nina Das');
    await userEvent.tab();
    await userEvent.click(within(form).getByRole('combobox', { name: 'Add a member' }));
    await waitFor(() => expect(within(form).queryByRole('option', { name: 'Nina Das' })).toBeNull());
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/committee')).toHaveLength(1));
    const ids = (bodyOf(writes(f, '/cases/committee')[0]!).members as { userId: string }[]).map((m) => m.userId);
    expect(ids).toEqual(['u2', 'u3', 'u4']);
  });
  it('someone removed can be added back at once', async () => {
    api(FULL);
    const form = await openForm('Edit membership');
    await userEvent.click(within(form).getByRole('combobox', { name: 'Add a member' }));
    await within(form).findByRole('option', { name: 'Nina Das' });
    await userEvent.tab();
    await userEvent.click(within(form).getByRole('button', { name: 'Remove Ravi Nair' }));
    await userEvent.click(within(form).getByRole('combobox', { name: 'Add a member' }));
    expect(await within(form).findByRole('option', { name: 'Ravi Nair' })).toBeTruthy();
  });
  it('edits external members, adds up to five, and drops a removed one', async () => {
    const f = api(FULL);
    const form = await openForm('Edit membership');
    fireEvent.change(within(form).getByLabelText(/External member 1: name/), { target: { value: 'Dr Anita Mehta' } });
    fireEvent.change(within(form).getByLabelText(/NGO or association/), { target: { value: 'Sakhi Trust' } });
    fireEvent.change(within(form).getByLabelText(/Since/), { target: { value: '2026-02-01' } });
    const add = within(form).getByRole('button', { name: 'Add external member' });
    await userEvent.click(add);
    fireEvent.change(within(form).getByLabelText(/External member 2: name/), { target: { value: 'To be removed' } });
    expect((within(form).getAllByLabelText(/Since/)[1] as HTMLInputElement).value).toBe(todayLocal());
    await userEvent.click(within(form).getByRole('button', { name: 'Remove external member 2' }));
    expect(within(form).queryByLabelText(/External member 2: name/)).toBeNull();
    for (let i = 0; i < 4; i += 1) await userEvent.click(within(form).getByRole('button', { name: 'Add external member' }));
    expect(within(form).queryByRole('button', { name: 'Add external member' })).toBeNull();
    for (let n = 5; n > 1; n -= 1) await userEvent.click(within(form).getByRole('button', { name: `Remove external member ${n}` }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/cases/committee')).toHaveLength(1));
    expect(bodyOf(writes(f, '/cases/committee')[0]!).external).toEqual([{ name: 'Dr Anita Mehta', organization: 'Sakhi Trust', since: '2026-02-01' }]);
  });
  it('a refused save stays open with the reason and the changes', async () => {
    api(FULL, undefined, (url, init) => (url.endsWith('/cases/committee') && init.method === 'PUT' ? problem(422, 'The presiding officer must be a senior woman employee') : undefined));
    const form = await openForm('Edit membership');
    await userEvent.selectOptions(within(form).getByLabelText('Role of Ravi Nair'), 'member');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByText('The presiding officer must be a senior woman employee')).toBeTruthy();
    expect((within(form).getByLabelText('Role of Ravi Nair') as HTMLSelectElement).value).toBe('member');
  });
});
