import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Assets } from '../../pages/Assets';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';


const FLAG = ['FEATURE_ASSET_MANAGEMENT'];
const LAB = [...FLAG, 'FEATURE_LAB_COMPETENCY'];
const MANAGE = ['assets.manage'];
const ASSET = { id: 'a1', tag: 'IT-05', name: 'Laptop', category: 'it', serial_number: 'S1', status: 'available', calibration_due: null, branch_id: null, branch_name: null, holder_id: null, holder_name: null, issued_at: null, due_back: null, acknowledged_at: null, purchase_date: null, notes: null };
const ISSUED = { ...ASSET, id: 'a2', tag: 'IT-06', name: 'Phone', status: 'assigned', holder_id: 'e9', holder_name: 'Rohan Iyer', issued_at: '2026-01-10', branch_name: 'Pune' };
const MINE = { id: 'as1', tag: 'IT-05', name: 'Laptop', category: 'it', serial_number: 'S1', issued_at: '2026-01-10', due_back: '2026-06-01', condition_out: 'Good', acknowledged_at: null };

const api = (assets: object[] = [ASSET, ISSUED], extra?: Handler): Handler => (url, init) => {
  const x = extra?.(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.endsWith('/org')) return { branches: [{ id: 'b1', name: 'Pune' }], legalEntities: [], departments: [] };
  if (url.includes('/api/v1/employees')) return { items: [{ id: 'e9', first_name: 'Rohan', last_name: 'Iyer', employee_code: 'E9' }] };
  if (url.includes('/assets/mine')) return { items: [MINE] };
  if (url.includes('/history')) return { items: [] };
  return { items: assets, page: 1, pageSize: 25, total: assets.length, today: '2026-03-01' };
};
const register = async (assets?: object[], extra?: Handler, flags = FLAG) => {
  const f = mockPageApi(MANAGE, flags, api(assets, extra));
  showPage(<Assets />, '/assets');
  await screen.findByRole('button', { name: 'Add asset' });
  return f;
};

describe('assets page', () => {
  it('no permission says so', async () => {
    mockPageApi([], FLAG, api());
    showPage(<Assets />, '/assets');
    expect(await screen.findByText('You do not have access to assets')).toBeTruthy();
  });
  it('someone with both roles chooses between tabs', async () => {
    mockPageApi(['assets.manage', 'assets.self'], FLAG, api());
    showPage(<Assets />, '/assets');
    await userEvent.click(await screen.findByRole('tab', { name: 'Asset register' }));
    expect(await screen.findByText('IT-06')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'My assets' }));
    expect(await screen.findByRole('table', { name: 'My assets' })).toBeTruthy();
  });
});

describe('my assets', () => {
  const mine = (extra?: Handler) => {
    const f = mockPageApi(['assets.self'], FLAG, api(undefined, extra));
    showPage(<Assets />, '/assets');
    return f;
  };
  it('asks a person to confirm what they hold, and confirming replaces the button', async () => {
    const f = mine();
    expect(await screen.findByText(/Confirm that you received the item below/)).toBeTruthy();
    expect(screen.getByText('IT equipment')).toBeTruthy();
    expect(screen.getByText('Good')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'I received it' }));
    await waitFor(() => expect(writes(f, '/assets/assignments/as1/acknowledge')).toHaveLength(1));
    expect(await screen.findByText('Receipt confirmed')).toBeTruthy();
  });
  it('a refused confirmation puts the button back with the reason', async () => {
    mine((url) => (url.endsWith('/acknowledge') ? problem(409, 'This asset was taken back') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'I received it' }));
    expect(await screen.findByText('This asset was taken back')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'I received it' })).toBeTruthy();
  });
  it('counts several pending items, and shows received and blank values', async () => {
    mine((url) => (url.includes('/assets/mine') ? { items: [MINE, { ...MINE, id: 'as2', tag: 'IT-07' }, { ...MINE, id: 'as3', tag: 'IT-08', serial_number: null, condition_out: null, acknowledged_at: '2026-01-11T05:00:00Z' }] } : undefined));
    expect(await screen.findByText(/Confirm that you received 2 items below/)).toBeTruthy();
    expect(screen.getByText(/^Received /)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'I received it' })).toHaveLength(2);
  });
  it('holding nothing says so', async () => {
    mine((url) => (url.includes('/assets/mine') ? { items: [] } : undefined));
    expect(await screen.findByText('No assets are issued to you')).toBeTruthy();
  });
});

describe('register', () => {
  it('shows holder, unconfirmed receipt, serial and location; actions follow the status', async () => {
    await register();
    expect((await screen.findAllByText('S/N S1')).length).toBe(2);
    expect(screen.getByText('Rohan Iyer')).toBeTruthy();
    expect(screen.getByText(/receipt not confirmed/)).toBeTruthy();
    expect(screen.getByText('Pune')).toBeTruthy();
    const rows = within(screen.getByRole('table', { name: 'Asset register' })).getAllByRole('row');
    expect(within(rows[1]!).getByRole('button', { name: 'Issue' })).toBeTruthy();
    expect(within(rows[1]!).queryByRole('button', { name: 'Receive' })).toBeNull();
    expect(within(rows[2]!).getByRole('button', { name: 'Receive' })).toBeTruthy();
    expect(within(rows[2]!).queryByRole('button', { name: 'Issue' })).toBeNull();
  });
  it('warns of due dates: overdue, within thirty days, and further off', async () => {
    await register([{ ...ASSET, id: '1', tag: 'A', calibration_due: '2026-02-01' }, { ...ASSET, id: '2', tag: 'B', calibration_due: '2026-03-11' }, { ...ASSET, id: '3', tag: 'C', calibration_due: '2026-12-01' }]);
    expect(await screen.findByText(/· overdue/)).toBeTruthy();
    expect(screen.getByText(/· 10 d/)).toBeTruthy();
    expect(screen.getByText(/Service due/, { selector: 'th, th *' })).toBeTruthy();
  });
  it('with the lab flag overdue reads expired', async () => {
    await register([{ ...ASSET, category: 'lab_instrument', calibration_due: '2026-02-01' }], undefined, LAB);
    expect(await screen.findByText(/· expired/)).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Asset register' })).getByText('Lab instrument')).toBeTruthy();
  });
  it('a legacy instrument without the lab flag reads plainly', async () => {
    await register([{ ...ASSET, category: 'lab_instrument' }]);
    expect(within(await screen.findByRole('table', { name: 'Asset register' })).getByText('Instrument')).toBeTruthy();
  });
  it('filters go to the server, the empty result says to clear, and Clear brings all back', async () => {
    const f = await register(undefined, (url) => (url.includes('status=retired') ? { items: [], page: 1, pageSize: 25, total: 0, today: '2026-03-01' } : undefined));
    await screen.findByText('IT-05');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'it');
    await waitFor(() => expect(reads(f, 'category=it').length).toBeGreaterThan(0));
    await userEvent.selectOptions(screen.getByLabelText('Service'), '30');
    await waitFor(() => expect(reads(f, 'calibrationWithinDays=30').length).toBeGreaterThan(0));
    await userEvent.type(screen.getByLabelText('Search'), 'lap');
    await waitFor(() => expect(reads(f, 'search=lap').length).toBeGreaterThan(0));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'retired');
    expect(await screen.findByText('No assets match')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('IT-05')).toBeTruthy();
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('');
  });
  it('a new organization is told to add the first asset', async () => {
    await register([]);
    expect(await screen.findByText('No assets yet')).toBeTruthy();
  });
});

describe('asset form', () => {
  it('refuses a bad tag at the field, then posts all values with blanks as null', async () => {
    const f = await register();
    await userEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add asset' });
    await userEvent.type(within(dlg).getByLabelText(/^Asset tag/), '-bad');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Forklift');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText(/starting with a letter or digit/)).toBeTruthy();
    expect(writes(f, '/api/v1/assets')).toHaveLength(0);
    await userEvent.clear(within(dlg).getByLabelText(/^Asset tag/));
    await userEvent.type(within(dlg).getByLabelText(/^Asset tag/), ' VH/01 ');
    await userEvent.selectOptions(within(dlg).getByLabelText('Category'), 'vehicle');
    await userEvent.type(within(dlg).getByLabelText(/^Serial number/), 'SN9');
    await userEvent.selectOptions(within(dlg).getByLabelText('Location'), await within(dlg).findByRole('option', { name: 'Pune' }));
    fireEvent.change(within(dlg).getByLabelText(/^Purchase date/), { target: { value: '2025-05-01' } });
    fireEvent.change(within(dlg).getByLabelText(/^Service due/), { target: { value: '2027-05-01' } });
    await userEvent.type(within(dlg).getByLabelText(/^Notes/), 'Yard');
    expect(within(dlg).queryByLabelText('Status')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/api/v1/assets')).toHaveLength(1));
    expect((writes(f, '/api/v1/assets')[0]![1] as RequestInit).method).toBe('POST');
    expect(bodyOf(writes(f, '/api/v1/assets')[0]!)).toEqual({ tag: 'VH/01', name: 'Forklift', category: 'vehicle', serialNumber: 'SN9', branchId: 'b1', purchaseDate: '2025-05-01', calibrationDue: '2027-05-01', notes: 'Yard' });
    expect(await screen.findByText('Saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('editing starts from the asset, changes status, and PUTs', async () => {
    const f = await register([{ ...ASSET, notes: 'Old' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit IT-05' });
    expect((within(dlg).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Laptop');
    await userEvent.selectOptions(within(dlg).getByLabelText('Status'), 'in_repair');
    await userEvent.clear(within(dlg).getByLabelText(/^Notes/));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/assets/a1')).toHaveLength(1));
    expect((writes(f, '/assets/a1')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/assets/a1')[0]!)).toMatchObject({ tag: 'IT-05', serialNumber: 'S1', status: 'in_repair', notes: null, branchId: null });
  });
  it('leaving the status alone sends none, and an issued asset has no status box', async () => {
    const f = await register([ASSET, ISSUED]);
    const rows = within(await screen.findByRole('table', { name: 'Asset register' })).getAllByRole('row');
    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit IT-06' });
    expect(within(dlg).queryByLabelText('Status')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/assets/a2')).toHaveLength(1));
    expect(bodyOf(writes(f, '/assets/a2')[0]!)).not.toHaveProperty('status');
  });
  it('a duplicate tag is refused and the form stays open', async () => {
    await register(undefined, (url, init) => (url.endsWith('/assets') && init.method === 'POST' ? problem(409, 'Tag is already used') : undefined));
    await userEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add asset' });
    await userEvent.type(within(dlg).getByLabelText(/^Asset tag/), 'IT-05');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Laptop');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Tag is already used');
    expect((within(dlg).getByLabelText(/^Asset tag/) as HTMLInputElement).value).toBe('IT-05');
  });
  it('with the lab flag an instrument warns it cannot be issued past calibration', async () => {
    await register(undefined, undefined, LAB);
    await userEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add asset' });
    await userEvent.selectOptions(within(dlg).getByLabelText('Category'), 'lab_instrument');
    expect(within(dlg).getByText('An instrument past this date cannot be issued')).toBeTruthy();
  });
});

describe('issue and receive', () => {
  it('Issue needs a person, then posts them with the dates and condition', async () => {
    const f = await register([{ ...ASSET, calibration_due: '2026-09-01' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const dlg = await screen.findByRole('dialog', { name: 'Issue IT-05 — Laptop' });
    expect(within(dlg).getByText(/^Service due /)).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Issued on/) as HTMLInputElement).value).toBe('2026-03-01');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Issue' }));
    expect(await within(dlg).findByText('Choose who receives it')).toBeTruthy();
    expect(writes(f, '/issue')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Issue to/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    await waitFor(() => expect(within(dlg).queryByText('Choose who receives it')).toBeNull());
    fireEvent.change(within(dlg).getByLabelText(/^Issued on/), { target: { value: '2026-03-02' } });
    fireEvent.change(within(dlg).getByLabelText(/^Due back/), { target: { value: '2026-04-02' } });
    await userEvent.clear(within(dlg).getByLabelText(/^Condition at issue/));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Issue' }));
    await waitFor(() => expect(writes(f, '/assets/a1/issue')).toHaveLength(1));
    expect(bodyOf(writes(f, '/assets/a1/issue')[0]!)).toEqual({ employeeId: 'e9', issuedAt: '2026-03-02', conditionOut: null, dueBack: '2026-04-02' });
    expect(await screen.findByText('Issued; the employee is asked to confirm receipt')).toBeTruthy();
  });
  it('a refused issue stays open with the reason', async () => {
    await register(undefined, (url, init) => (url.endsWith('/issue') && init.method === 'POST' ? problem(409, 'Calibration has expired') : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Issue' }));
    const dlg = await screen.findByRole('dialog', { name: /^Issue IT-05/ });
    await userEvent.click(within(dlg).getByRole('combobox', { name: /Issue to/ }));
    await userEvent.click(await within(dlg).findByRole('option', { name: /Rohan Iyer/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Issue' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Calibration has expired');
  });
  it('a plain return needs no comment, and blank condition is sent as null', async () => {
    const f = await register();
    await userEvent.click(await screen.findByRole('button', { name: 'Receive' }));
    const dlg = await screen.findByRole('dialog', { name: 'Receive IT-06 from Rohan Iyer' });
    fireEvent.change(within(dlg).getByLabelText(/^Returned on/), { target: { value: '2026-03-02' } });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record return' }));
    await waitFor(() => expect(writes(f, '/assets/a2/receive')).toHaveLength(1));
    expect(bodyOf(writes(f, '/assets/a2/receive')[0]!)).toEqual({ returnedAt: '2026-03-02', outcome: 'returned', conditionIn: null });
    expect(await screen.findByText('Recorded')).toBeTruthy();
  });
  it('damage or loss asks what happened and says what becomes of the asset', async () => {
    const f = await register();
    await userEvent.click(await screen.findByRole('button', { name: 'Receive' }));
    const dlg = await screen.findByRole('dialog', { name: /^Receive IT-06/ });
    await userEvent.selectOptions(within(dlg).getByLabelText('Outcome'), 'lost');
    expect(within(dlg).getByText('The asset is marked lost')).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText('Outcome'), 'damaged');
    expect(within(dlg).getByText('The asset goes to “In repair”')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record return' }));
    expect(writes(f, '/receive')).toHaveLength(0);
    await userEvent.type(within(dlg).getByLabelText(/^What happened/), 'Cracked screen');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Record return' }));
    await waitFor(() => expect(writes(f, '/assets/a2/receive')).toHaveLength(1));
    expect(bodyOf(writes(f, '/assets/a2/receive')[0]!)).toMatchObject({ outcome: 'damaged', conditionIn: 'Cracked screen' });
  });
  it('a holder with no name reads as the employee', async () => {
    await register([{ ...ISSUED, holder_name: null }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Receive' }));
    expect(await screen.findByRole('dialog', { name: 'Receive IT-06 from employee' })).toBeTruthy();
  });
});

describe('history', () => {
  it('never issued says so', async () => {
    await register();
    await userEvent.click((await screen.findAllByRole('button', { name: 'History' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'History — IT-05' });
    expect(await within(dlg).findByText('Never issued')).toBeTruthy();
  });
  it('lists who held it, how it came back and what state it was in', async () => {
    const past = { id: 'h1', employee_name: 'Kim', employee_code: 'E3', issued_at: '2025-01-01', condition_out: 'Good', due_back: null, returned_at: '2025-06-01', condition_in: 'Scratched', outcome: 'damaged', acknowledged_at: '2025-01-02T05:00:00Z', issued_by_name: 'Lee', received_by_name: 'Sam' };
    const current = { ...past, id: 'h2', employee_name: 'Rohan Iyer', returned_at: null, condition_in: null, condition_out: null, outcome: null, acknowledged_at: null, received_by_name: null };
    await register(undefined, (url) => (url.includes('/assets/a1/history') ? { items: [past, current] } : undefined));
    await userEvent.click((await screen.findAllByRole('button', { name: 'History' }))[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'History — IT-05' });
    expect(await within(dlg).findByText('Damaged')).toBeTruthy();
    expect(within(dlg).getByText('Good → Scratched')).toBeTruthy();
    expect(within(dlg).getByText('by Sam')).toBeTruthy();
    expect(within(dlg).getByText(/by Lee · confirmed/)).toBeTruthy();
    expect(within(dlg).getByText('With employee')).toBeTruthy();
  });
});
