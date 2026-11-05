import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtDate } from '../../format';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../../test/page';
import { resetViewport, setViewport } from '../../test/render';
import { RosterGrid, RosterPage, RosterSetup } from './Roster';

const GEN = { id: 's1', code: 'GEN', name: 'General', start_time: '09:30:00', end_time: '18:00:00', status: 'active' };
const NGT = { id: 's2', code: 'NGT', name: 'Night', start_time: '22:00:00', end_time: '06:00:00', status: 'active' };
const cell = (date: string, over = {}) => ({ date, shiftId: 's1', off: false, holiday: null, source: 'roster', pattern: 'ROT', reason: null, ...over });
const DATES = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
const BELA = { id: 'e9', code: 'E9', name: 'Bela Roy', department: 'Ops', days: [cell('2026-11-05'), cell('2026-11-06', { shiftId: 's2', source: 'override', pattern: null, reason: 'Swap with Ali' }), cell('2026-11-07', { shiftId: null, off: true, source: null, pattern: null }), cell('2026-11-08', { shiftId: null, holiday: 'Diwali', source: null, pattern: null })] };
const ALI = { id: 'e8', code: 'E8', name: 'Ali Khan', department: null, days: [cell('2026-11-05', { shiftId: null, source: 'assignment', pattern: null })] };
const grid = (over = {}) => ({ from: '2026-11-02', to: '2026-11-15', dates: DATES, shifts: [GEN, NGT], items: [BELA, ALI], canEdit: true, ...over });
const PATTERN = { id: 'p1', code: 'ROT-2', name: 'Two by two', days: ['s1', 's2', null], status: 'active', employees: 4, used: false };

const FULL_SHIFT = { ...GEN, break_minutes: 30, grace_minutes: 10, early_exit_grace_minutes: 10, half_day_min_minutes: 240, full_day_min_minutes: 450, overtime_after_minutes: null };
const answer = (roster: () => unknown, extra: Handler = () => undefined): Handler => (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/attendance/roster-patterns')) return { items: [PATTERN] };
  if (url.includes('/attendance/shifts')) return { items: [FULL_SHIFT, { ...FULL_SHIFT, ...NGT }] };
  if (url.includes('/attendance/roster')) return roster();
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Bela', last_name: 'Roy', employee_code: 'E9' }, { id: 'e8', first_name: 'Ali', last_name: 'Khan', employee_code: 'E8' }] };
  return { items: [] };
};
const showGrid = (extra?: Handler, data: () => unknown = () => grid()) => { const f = mockPageApi(['attendance.configure'], answer(data, extra)); renderPage(<RosterGrid />); return f; };
const day = (name: string, date: string) => `${name}, ${fmtDate(date)}`;
const openDay = async (name: string, date: string) => {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${day(name, date).replaceAll('/', '.')}`) }));
  return screen.findByRole('dialog', { name: `${name}: ${fmtDate(date)}` });
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T06:30:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetViewport(); });

describe('roster grid', () => {
  it('asks for two weeks from this Monday and marks today and each kind of day', async () => {
    const f = showGrid();
    expect(await screen.findByRole('columnheader', { name: /Thu 05 \(today\)/ })).toBeTruthy();
    expect(reads(f, '/attendance/roster').map((c) => String(c[0]))).toContain('/api/v1/attendance/roster?from=2026-11-02&to=2026-11-15');
    expect(screen.getByText('GEN 09:30–18:00')).toBeTruthy();
    expect(screen.getByText(/Press a day to change it/)).toBeTruthy();
    const row = screen.getByRole('row', { name: /Bela Roy/ });
    expect(within(row).getByText('Ops', { exact: false })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `${day('Bela Roy', '2026-11-05')}: GEN. Change` })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `${day('Bela Roy', '2026-11-06')}: NGT, changed for the day. Change` })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `${day('Bela Roy', '2026-11-07')}: Off. Change` })).toBeTruthy();
    expect(within(row).getByRole('button', { name: `${day('Bela Roy', '2026-11-08')}: Holiday. Change` })).toBeTruthy();
    expect(screen.getByTitle('Night 22:00–06:00 · Changed: Swap with Ali')).toBeTruthy();
    expect(screen.getByTitle('General 09:30–18:00 · Roster ROT')).toBeTruthy();
    expect(screen.getByTitle('Day off')).toBeTruthy();
    expect(screen.getByTitle('Diwali')).toBeTruthy();
    expect(screen.getByTitle('No shift')).toBeTruthy();
  });
  it('without edit rights shows the days but offers nothing to press', async () => {
    showGrid(undefined, () => grid({ canEdit: false }));
    expect(await screen.findByText('GEN')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change$/ })).toBeNull();
    expect(screen.queryByText(/a day to change it/)).toBeNull();
  });
  it('moves a week at a time and comes back to this week', async () => {
    const f = showGrid();
    await screen.findByText('GEN 09:30–18:00');
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(reads(f, 'from=2026-11-09&to=2026-11-22')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(reads(f, 'from=2026-10-26&to=2026-11-08')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'This week' })).toBeNull());
  });
  it('search goes to the server, and no match reads as such', async () => {
    const f = showGrid(undefined, () => grid({ items: [] }));
    expect(await screen.findByText('No one to show')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search people'), ' Bela ');
    await waitFor(() => expect(reads(f, 'search=Bela')).toHaveLength(1));
  });
  it('a failed load shows why', async () => {
    showGrid((url) => (url.includes('/attendance/roster') ? problem(500, 'Roster is down') : undefined));
    expect(await screen.findByText('Roster is down')).toBeTruthy();
  });
});

describe('changing one day', () => {
  it('needs a reason, sends the new shift, and offers an undo', async () => {
    const f = showGrid();
    const dlg = await openDay('Bela Roy', '2026-11-05');
    await userEvent.selectOptions(within(dlg).getByLabelText('Works'), 's2');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'ab');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Say why, in at least 3 characters')).toBeTruthy();
    expect(writes(f, '/roster-overrides')).toHaveLength(0);
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'c');
    expect(within(dlg).queryByText('Say why, in at least 3 characters')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const put = writes(f, '/roster-overrides')[0]!;
    expect(String(put[0])).toBe('/api/v1/attendance/roster-overrides');
    expect((put[1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(put)).toEqual({ employeeId: 'e9', date: '2026-11-05', shiftId: 's2', reason: 'abc' });
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes(f, '/roster-overrides/e9/2026-11-05').map((c) => (c[1] as RequestInit).method)).toEqual(['DELETE']));
    expect(await screen.findByText('Change removed')).toBeTruthy();
  });
  it('a failed undo says how to remove the change instead', async () => {
    showGrid((url, init) => (init.method === 'DELETE' ? problem(500, 'No') : undefined));
    const dlg = await openDay('Bela Roy', '2026-11-05');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Cover');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('The change could not be undone. Open the day to remove it.')).toBeTruthy();
  });
  it('a day off opens on Day off and is sent with no shift', async () => {
    const f = showGrid();
    const dlg = await openDay('Bela Roy', '2026-11-07');
    expect((within(dlg).getByLabelText('Works') as HTMLSelectElement).value).toBe('off');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Weekly off');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/roster-overrides')).toHaveLength(1));
    expect(bodyOf(writes(f, '/roster-overrides')[0]!)).toMatchObject({ shiftId: null, reason: 'Weekly off' });
  });
  it('a server refusal keeps the form open with the reason and what was typed', async () => {
    showGrid((url, init) => (init.method === 'PUT' ? problem(409, 'The period is locked') : undefined));
    const dlg = await openDay('Bela Roy', '2026-11-05');
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Cover');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('The period is locked')).toBeTruthy();
    expect((within(dlg).getByLabelText(/Reason/) as HTMLInputElement).value).toBe('Cover');
  });
  it('a day already changed opens with its reason, has no undo, and can be removed', async () => {
    const f = showGrid();
    const dlg = await openDay('Bela Roy', '2026-11-06');
    expect((within(dlg).getByLabelText(/Reason/) as HTMLInputElement).value).toBe('Swap with Ali');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Day changed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    const again = await openDay('Bela Roy', '2026-11-06');
    await userEvent.click(within(again).getByRole('button', { name: 'Remove change' }));
    await waitFor(() => expect(writes(f, '/roster-overrides/e9/2026-11-06').map((c) => (c[1] as RequestInit).method)).toEqual(['DELETE']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Change removed')).toBeTruthy();
  });
  it('a failed removal keeps the form open with the reason', async () => {
    showGrid((url, init) => (init.method === 'DELETE' ? problem(409, 'Attendance is locked') : undefined));
    const dlg = await openDay('Bela Roy', '2026-11-06');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remove change' }));
    expect(await within(dlg).findByText('Attendance is locked')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('on a phone', () => {
  beforeEach(() => setViewport(400));
  it('one person lists their own days, with today marked', async () => {
    showGrid(undefined, () => grid({ items: [BELA], canEdit: false }));
    const list = await screen.findByRole('list', { name: 'Roster' });
    expect(within(list).getByText('(today)')).toBeTruthy();
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('E9 · Ops')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('a team lists one day at a time, opening on today, and a day can be changed', async () => {
    showGrid();
    const list = await screen.findByRole('list', { name: `Roster for ${fmtDate('2026-11-05')}` });
    expect(within(list).getByRole('button', { name: `${day('Bela Roy', '2026-11-05')}: GEN. Change` })).toBeTruthy();
    expect(screen.getByText(/Tap a day to change it/)).toBeTruthy();
    expect(within(list).getByText('E8')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Day'), '2026-11-06');
    const next = await screen.findByRole('list', { name: `Roster for ${fmtDate('2026-11-06')}` });
    expect(within(next).queryByRole('button', { name: /Ali Khan/ })).toBeNull();
    await userEvent.click(within(next).getByRole('button', { name: /Bela Roy/ }));
    expect(await screen.findByRole('dialog', { name: `Bela Roy: ${fmtDate('2026-11-06')}` })).toBeTruthy();
  });
  it('with today outside the fortnight opens on the first day shown', async () => {
    showGrid(undefined, () => grid({ dates: ['2026-11-09'], items: [BELA, ALI] }));
    expect(await screen.findByRole('list', { name: `Roster for ${fmtDate('2026-11-09')}` })).toBeTruthy();
  });
});

describe('roster setup', () => {
  const setup = (extra?: Handler) => { const f = mockPageApi(['attendance.configure'], answer(() => grid(), extra)); renderPage(<RosterSetup />); return f; };
  const newPattern = async () => { await userEvent.click(await screen.findByRole('button', { name: 'New pattern' })); return screen.findByRole('dialog', { name: 'New roster pattern' }); };
  it('lists patterns with their cycle and people', async () => {
    setup();
    const row = await screen.findByRole('row', { name: /ROT-2/ });
    expect(within(row).getByText('Two by two')).toBeTruthy();
    expect(within(row).getByText('3 days')).toBeTruthy();
    expect(within(row).getByText('4')).toBeTruthy();
    expect(within(row).getByText('GEN')).toBeTruthy();
    expect(within(row).getByText('Off')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Assign' })).toBeTruthy();
  });
  it('an inactive pattern can be edited but not assigned, and a one-day cycle reads as one day', async () => {
    setup((url) => (url.includes('/roster-patterns') ? { items: [{ ...PATTERN, status: 'inactive', days: ['gone'] }] } : undefined));
    const row = await screen.findByRole('row', { name: /ROT-2/ });
    expect(within(row).getByText('1 day')).toBeTruthy();
    expect(within(row).getByText('?')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Assign' })).toBeNull();
  });
  it('no active shift holds new patterns back and says why', async () => {
    setup((url) => (url.includes('/attendance/shifts') ? { items: [{ ...FULL_SHIFT, status: 'inactive' }] } : url.includes('/roster-patterns') ? { items: [] } : undefined));
    expect(await screen.findByText('Create an active shift first. Patterns are built from shifts.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New pattern' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('No patterns yet')).toBeTruthy();
  });
  it('a new pattern defaults to five days of the first shift, follows the cycle length and is posted', async () => {
    const f = setup();
    const dlg = await newPattern();
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'rot-3');
    expect((within(dlg).getByLabelText(/^Code/) as HTMLInputElement).value).toBe('ROT-3');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Rotation');
    expect((within(dlg).getByLabelText('Day 1') as HTMLSelectElement).value).toBe('s1');
    expect((within(dlg).getByLabelText('Day 6') as HTMLSelectElement).value).toBe('');
    const length = within(dlg).getByLabelText(/Days in the cycle/);
    await userEvent.clear(length);
    await userEvent.type(length, '8');
    await userEvent.selectOptions(within(dlg).getByLabelText('Day 8'), 's2');
    await userEvent.selectOptions(within(dlg).getByLabelText('Day 1'), '');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/roster-patterns')).toHaveLength(1));
    const post = writes(f, '/roster-patterns')[0]!;
    expect(String(post[0])).toBe('/api/v1/attendance/roster-patterns');
    expect(bodyOf(post)).toEqual({ code: 'ROT-3', name: 'Rotation', days: [null, 's1', 's1', 's1', 's1', null, null, 's2'] });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Pattern saved')).toBeTruthy();
  });
  it('shortening the cycle sends only the days in it', async () => {
    const f = setup();
    const dlg = await newPattern();
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'A');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Short');
    const length = within(dlg).getByLabelText(/Days in the cycle/);
    await userEvent.clear(length);
    await userEvent.type(length, '2');
    expect(within(dlg).queryByLabelText('Day 3')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/roster-patterns')).toHaveLength(1));
    expect(bodyOf(writes(f, '/roster-patterns')[0]!)['days']).toEqual(['s1', 's1']);
  });
  it('a cycle over 56 days is refused at the field, and fixing it clears the message', async () => {
    const f = setup();
    const dlg = await newPattern();
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'A');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Long');
    const length = within(dlg).getByLabelText(/Days in the cycle/) as HTMLInputElement;
    length.removeAttribute('max');
    await userEvent.clear(length);
    await userEvent.type(length, '57');
    dlg.querySelector('form')!.noValidate = true;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Enter a whole number from 1 to 56')).toBeTruthy();
    expect(writes(f, '/roster-patterns')).toHaveLength(0);
    await userEvent.type(length, '{backspace}');
    expect(within(dlg).queryByText('Enter a whole number from 1 to 56')).toBeNull();
  });
  it('editing an unused pattern keeps its code and sends name, status and days', async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit pattern ROT-2' });
    expect((within(dlg).getByLabelText(/^Code/) as HTMLInputElement).disabled).toBe(true);
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'inactive');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/roster-patterns/p1')).toHaveLength(1));
    const patch = writes(f, '/roster-patterns/p1')[0]!;
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    expect(bodyOf(patch)).toEqual({ name: 'Two by two', status: 'inactive', days: ['s1', 's2', null] });
  });
  it('a pattern people have followed cannot change its days', async () => {
    const f = setup((url) => (url.includes('/roster-patterns') && !url.includes('p1') ? { items: [{ ...PATTERN, used: true }] } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit pattern ROT-2' });
    expect(within(dlg).getByText(/its days cannot change/)).toBeTruthy();
    expect(within(dlg).queryByLabelText(/Days in the cycle/)).toBeNull();
    expect((within(dlg).getByLabelText('Day 1') as HTMLSelectElement).disabled).toBe(true);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/roster-patterns/p1')).toHaveLength(1));
    expect(bodyOf(writes(f, '/roster-patterns/p1')[0]!)).toEqual({ name: 'Two by two', status: 'active' });
  });
  it('a refused pattern stays open with the reason', async () => {
    setup((url, init) => (url.includes('/roster-patterns') && init.method === 'POST' ? problem(409, 'Code already used') : undefined));
    const dlg = await newPattern();
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'A');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Dup');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Code already used')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('assigning needs a person, previews from the starting day, and posts who and when', async () => {
    const f = setup((url, init) => (url.endsWith('/roster-assignments') && init.method === 'POST' ? { assigned: 2 } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Assign' }));
    const dlg = await screen.findByRole('dialog', { name: 'Put people on ROT-2' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Put on roster' }));
    expect(await within(dlg).findByText('Select at least one person')).toBeTruthy();
    expect(writes(f, '/roster-assignments')).toHaveLength(0);
    const preview = within(dlg).getByRole('group', { name: 'Preview' });
    expect(preview.textContent).toBe('Thu GENFri NGTSat OffSun GENMon NGTTue OffWed GEN');
    await userEvent.selectOptions(within(dlg).getByLabelText(/Starting on cycle day/), '2');
    expect(preview.textContent).toBe('Thu OffFri GENSat NGTSun OffMon GENTue NGTWed Off');
    const from = within(dlg).getByLabelText(/^From/);
    await userEvent.clear(from);
    await userEvent.type(from, '2026-11-09');
    expect(preview.textContent).toBe('Mon OffTue GENWed NGTThu OffFri GENSat NGTSun Off');
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    expect(within(dlg).queryByText('Select at least one person')).toBeNull();
    expect(within(dlg).getByText('1 selected: Bela Roy')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Ali Khan/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Put on roster' }));
    await waitFor(() => expect(writes(f, '/roster-assignments')).toHaveLength(1));
    expect(bodyOf(writes(f, '/roster-assignments')[0]!)).toEqual({ employeeIds: ['e9', 'e8'], patternId: 'p1', effectiveFrom: '2026-11-09', startDay: 2 });
    expect(await screen.findByText(`2 people on ROT-2 from ${fmtDate('2026-11-09')}`)).toBeTruthy();
  });
  it('clearing the From date on the way to another does not crash the page, and the preview waits for a date', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Assign' }));
    const dlg = await screen.findByRole('dialog', { name: 'Put people on ROT-2' });
    const from = within(dlg).getByLabelText(/^From/);
    await userEvent.clear(from);
    expect(within(dlg).getByRole('group', { name: 'Preview' }).textContent).toBe('');
    await userEvent.type(from, '2026-11-09');
    expect(within(dlg).getByRole('group', { name: 'Preview' }).textContent).toContain('Mon GEN');
  });
  it('one person assigned reads as one person, and a failure keeps the dialog open', async () => {
    let fail = true;
    setup((url, init) => { if (!url.endsWith('/roster-assignments') || init.method !== 'POST') return undefined; if (fail) { fail = false; return problem(409, 'Bela Roy has left'); } return { assigned: 1 }; });
    await userEvent.click(await screen.findByRole('button', { name: 'Assign' }));
    const dlg = await screen.findByRole('dialog', { name: 'Put people on ROT-2' });
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Put on roster' }));
    expect(await within(dlg).findByText('Bela Roy has left')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Put on roster' }));
    expect(await screen.findByText(`1 person on ROT-2 from ${fmtDate('2026-11-05')}`)).toBeTruthy();
  });
  it('ending a roster needs a person, then posts them with the last day', async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'End roster…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Take people off their roster' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'End roster' }));
    expect(await within(dlg).findByText('Select at least one person')).toBeTruthy();
    const last = within(dlg).getByLabelText(/Last day on the roster/);
    await userEvent.clear(last);
    await userEvent.type(last, '2026-11-20');
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'End roster' }));
    await waitFor(() => expect(writes(f, '/roster-assignments/end')).toHaveLength(1));
    expect(bodyOf(writes(f, '/roster-assignments/end')[0]!)).toEqual({ employeeIds: ['e9'], lastDay: '2026-11-20' });
    expect(await screen.findByText('Roster ended')).toBeTruthy();
  });
  it('the people picker searches on the server, keeps a selection through a search, and Enter does not submit', async () => {
    const f = setup((url) => (url.includes('/api/v1/employees') && url.includes('search=zz') ? { items: [] } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'End roster…' }));
    const dlg = await screen.findByRole('dialog', { name: 'Take people off their roster' });
    expect(within(dlg).getByText('Nobody selected yet')).toBeTruthy();
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: /Bela Roy/ }));
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Ali Khan/ }));
    expect(within(dlg).getByText('2 selected: Bela Roy, Ali Khan')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Ali Khan/ }));
    expect(within(dlg).getByText('1 selected: Bela Roy')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText('Search employees'), 'zz{Enter}');
    expect(await within(dlg).findByText('No active employees match.')).toBeTruthy();
    expect(reads(f, 'search=zz&status=active&pageSize=50')).toHaveLength(1);
    expect(within(dlg).getByText('1 selected: Bela Roy')).toBeTruthy();
    expect(writes(f, '/roster-assignments')).toHaveLength(0);
  });
});

describe('the roster page', () => {
  it('is headed for people reading their own shifts', async () => {
    mockPageApi(['attendance.self'], answer(() => grid({ items: [BELA], canEdit: false })));
    renderPage(<RosterPage />);
    expect(await screen.findByRole('heading', { name: 'Roster', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Shifts' })).toBeTruthy();
    expect(await screen.findByText('Bela Roy')).toBeTruthy();
  });
});
