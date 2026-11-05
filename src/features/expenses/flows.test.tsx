import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../components/Money';
import { fmtDate, todayLocal } from '../../format';
import { Expenses } from '../../pages/Expenses';
import { bodyOf, mockPageApi, problem, reads, showPage, writes, type Handler } from '../../test/page';
import { resetViewport, setViewport } from '../../test/render';
import type { AllowanceRate, Batch, Claim, ClaimItem, ClaimRow, ExpenseCategory, Payable } from './types';

const FLAG = ['FEATURE_EXPENSE_CLAIMS'];
const SELF = ['expenses.self'];
const item = (over: Partial<ClaimItem> = {}): ClaimItem => ({ id: 'i1', expense_date: '2026-03-01', category_name: 'Meals', description: 'Lunch', amount: '50', has_receipt: false, ...over });
const claim = (over: Partial<Claim> = {}): Claim => ({ id: 'c1', title: 'Client visit', status: 'draft', employee_id: 'e1', employee_name: 'Rohan Iyer', purpose: 'Visit', project: null, total: '500', editable: true, items: [], ...over });
const row = (over: Partial<ClaimRow> = {}): ClaimRow => ({ id: 'c1', title: 'Client visit', status: 'draft', employee_name: 'Rohan Iyer', items: 1, total: '500', flagged: 0, created_at: '2026-03-01T10:00:00Z', ...over });
const cat = (over: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: 'k1', code: 'MEAL', name: 'Meals', description: 'Food', requires_receipt: false, max_amount: null, gst_applicable: false, status: 'active', calc: null, ...over });
const rate = (over: Partial<AllowanceRate> = {}): AllowanceRate => ({ id: 'r1', kind: 'per_diem', tier: 'METRO', grade: null, vehicle: null, rate: '1500', effective_from: '2026-01-01', state: 'current', note: null, created_by_name: null, ...over });
const batch = (over: Partial<Batch> = {}): Batch => ({ id: 'b1', status: 'prepared', total: '900', claim_count: 2, created_at: '2026-03-01T10:00:00Z', prepared_by: 'u2', prepared_by_name: 'Asha Rao', ...over });
const payable = (over: Partial<Payable> = {}): Payable => ({ id: 'p1', employee_name: 'Rohan Iyer', employee_code: 'E5', title: 'Taxi', payable: '100', total: '100', advance_adjusted: '0', approved_at: '2026-03-10T05:00:00Z', age_days: 2, ...over });

afterEach(() => { resetViewport(); vi.restoreAllMocks(); });

const claimsApi = (c: Claim, cats: ExpenseCategory[] = [cat()], extra: Handler = () => undefined): Handler => (url, init) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if ((init.method ?? 'GET') !== 'GET') return { id: 'c1' };
  if (url.includes('/categories')) return { items: cats };
  if (url.endsWith('/claims/c1')) return c;
  if (url.includes('/claims')) return { items: [row()], page: 1, pageSize: 20, total: 1 };
  return { items: [] };
};
const openClaim = async () => {
  showPage(<Expenses />, '/expenses?tab=mine');
  await userEvent.click(await screen.findByRole('button', { name: 'Client visit' }));
  return screen.findByRole('dialog', { name: 'Client visit' });
};

describe('tabs', () => {
  it('someone with no expense permission is told so', async () => {
    mockPageApi([], FLAG, () => ({ items: [] }));
    showPage(<Expenses />, '/expenses');
    expect(await screen.findByText('You do not have access to expenses')).toBeTruthy();
  });
  it('a manager with no employee record starts on team claims with no My claims tab', async () => {
    const f = mockPageApi(['expenses.self', 'expenses.team.read'], FLAG, () => ({ items: [], page: 1, pageSize: 20, total: 0 }), null);
    showPage(<Expenses />, '/expenses');
    expect(await screen.findByText('No claims from your team')).toBeTruthy();
    expect(reads(f, 'scope=team').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'New claim' })).toBeNull();
  });
});

describe('claim list', () => {
  it('shows the empty state and starts a claim that then opens', async () => {
    let created = false;
    const f = mockPageApi(SELF, FLAG, (url, init) => {
      if (url.endsWith('/claims') && init.method === 'POST') { created = true; return { id: 'c1' }; }
      if (url.endsWith('/claims/c1')) return claim();
      if (url.includes('/categories')) return { items: [cat()] };
      if (url.includes('/claims')) return created ? { items: [row()], page: 1, pageSize: 20, total: 1 } : { items: [], page: 1, pageSize: 20, total: 0 };
      return { items: [] };
    });
    showPage(<Expenses />, '/expenses?tab=mine');
    expect(await screen.findByText('You have no expense claims yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'New claim' }));
    const dlg = await screen.findByRole('dialog', { name: 'New expense claim' });
    await userEvent.type(within(dlg).getByLabelText(/^Title/), 'Pune trip');
    await userEvent.type(within(dlg).getByLabelText(/^Business purpose/), 'Client audit');
    await userEvent.type(within(dlg).getByLabelText(/^Project/), 'P-7');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create and add items' }));
    await waitFor(() => expect(writes(f, '/expenses/claims')).toHaveLength(1));
    expect(bodyOf(writes(f, '/expenses/claims')[0]!)).toEqual({ title: 'Pune trip', purpose: 'Client audit', project: 'P-7' });
    expect(await screen.findByRole('dialog', { name: 'Client visit' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New expense claim' })).toBeNull();
  });

  it('a refused claim stays open with the reason and the field error', async () => {
    mockPageApi(SELF, FLAG, (url, init) => {
      if (url.endsWith('/claims') && init.method === 'POST') return problem(422, 'Check the claim', { errors: [{ field: 'title', message: 'Title already used' }] });
      return { items: [], page: 1, pageSize: 20, total: 0 };
    });
    showPage(<Expenses />, '/expenses?tab=mine');
    await userEvent.click(await screen.findByRole('button', { name: 'New claim' }));
    const dlg = await screen.findByRole('dialog', { name: 'New expense claim' });
    await userEvent.type(within(dlg).getByLabelText(/^Title/), 'Pune trip');
    await userEvent.type(within(dlg).getByLabelText(/^Business purpose/), 'Client audit');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create and add items' }));
    expect(await within(dlg).findByText('Title already used')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Pune trip');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('flags possible duplicates and lists team claims with the employee', async () => {
    mockPageApi(['expenses.team.read'], FLAG, () => ({ items: [row({ flagged: 1, approved_at: '2026-03-02T10:00:00Z' })], page: 1, pageSize: 20, total: 1 }));
    showPage(<Expenses />, '/expenses?tab=team');
    const table = await screen.findByRole('table', { name: 'Team expense claims' });
    expect(within(table).getByText('Possible duplicate')).toBeTruthy();
    expect(within(table).getByText('Rohan Iyer')).toBeTruthy();
  });

  it('?claim= opens that claim directly, and it stays closed once closed', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim({ editable: false, status: 'approved' })));
    showPage(<Expenses />, '/expenses?tab=mine&claim=c1');
    const dlg = await screen.findByRole('dialog', { name: 'Client visit' });
    await userEvent.click(within(dlg).getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('claim detail', () => {
  it('a draft with nothing in it invites the first expense and holds Submit', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim()));
    const dlg = await openClaim();
    expect(await within(dlg).findByText('Add the first one to submit this claim.')).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Submit for approval' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows how each item was priced, its supplier details, and warns of duplicates', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim({ project: 'P-7', payment_reference: 'NEFT-9', editable: false, status: 'paid', items: [
      item({ id: 'i1', description: 'Mumbai', calc: 'per_diem', quantity: '1.5', rate: '1000', tier: 'METRO', amount: '1500' }),
      item({ id: 'i2', description: 'To site', calc: 'mileage', quantity: '10', rate: '12', vehicle: 'two_wheeler', amount: '120' }),
      item({ id: 'i3', description: 'Dinner', merchant: 'Cafe', invoice_number: 'INV-1', gstin: '27ABC', duplicate_of: 'i9' }),
    ] })));
    const dlg = await openClaim();
    expect(await within(dlg).findByText(`1.5 day(s) × ${formatMoney('1000')} · METRO`)).toBeTruthy();
    expect(within(dlg).getByText(`10 km × ${formatMoney('12')} · Two-wheeler`)).toBeTruthy();
    expect(within(dlg).getByText('Cafe · INV-1 · GSTIN 27ABC')).toBeTruthy();
    expect(within(dlg).getByText('Possible duplicate')).toBeTruthy();
    expect(within(dlg).getByText('Visit · P-7 · paid, ref NEFT-9')).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Add expense' })).toBeNull();
  });

  it('a trip claim says what the advance covered', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim({ travel_request_id: 't1', advance_adjusted: '200', total: '500', editable: false, status: 'approved' })));
    const dlg = await openClaim();
    const note = (await within(dlg).findByText(/set off against the travel advance/));
    expect(note.textContent).toContain(formatMoney('200'));
    expect(note.textContent).toContain(formatMoney(300));
  });

  it('a trip claim with no advance yet says one would be set off first', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim({ travel_request_id: 't1' })));
    const dlg = await openClaim();
    expect(await within(dlg).findByText(/any travel advance still outstanding is set off first/)).toBeTruthy();
  });

  it('submits after showing the total', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim({ items: [item()] })));
    const dlg = await openClaim();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Submit for approval' }));
    const confirm = await screen.findByRole('dialog', { name: 'Submit claim' });
    expect(within(confirm).getByText(new RegExp(`Submit ${formatMoney('500')} for approval`))).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(writes(f, '/claims/c1/submit')).toHaveLength(1));
    expect(await screen.findByText('Submitted for approval')).toBeTruthy();
  });

  it('cancels a draft, posting to cancel', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim()));
    const dlg = await openClaim();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Cancel claim' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancel claim' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel claim' }));
    await waitFor(() => expect(writes(f, '/claims/c1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Claim cancelled')).toBeTruthy();
  });

  it('withdraws your own submitted claim, which cancels it', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim({ status: 'submitted', editable: false })));
    const dlg = await openClaim();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Withdraw' }));
    const confirm = await screen.findByRole('dialog', { name: 'Withdraw claim' });
    expect(within(confirm).getByText(/this cannot be undone/)).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Withdraw claim' }));
    await waitFor(() => expect(writes(f, '/claims/c1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Claim withdrawn')).toBeTruthy();
  });

  it('removes one expense by its id after naming it', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim({ items: [item()] })));
    const dlg = await openClaim();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove expense' });
    expect(within(confirm).getByText(/Remove “Lunch”/)).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(writes(f, '/claims/c1/items/i1')).toHaveLength(1));
    expect((writes(f, '/claims/c1/items/i1')[0]![1] as RequestInit).method).toBe('DELETE');
    expect(await screen.findByText('Expense removed')).toBeTruthy();
  });

  it('edits the claim details with PUT, clearing the project to null', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim({ project: 'Old' })));
    const dlg = await openClaim();
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Edit details' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit claim' });
    expect((within(edit).getByLabelText(/^Business purpose/) as HTMLTextAreaElement).value).toBe('Visit');
    await userEvent.clear(within(edit).getByLabelText(/^Project/));
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/claims/c1')).toHaveLength(1));
    const call = writes(f, '/claims/c1')[0]!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(call)).toEqual({ title: 'Client visit', purpose: 'Visit', project: null });
    expect(await screen.findByText('Claim saved')).toBeTruthy();
  });

  it('when categories cannot load, says why and holds Add expense', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim(), [], (url) => (url.includes('/categories') ? problem(500, 'Categories are down') : undefined)));
    const dlg = await openClaim();
    expect(await within(dlg).findByText('Categories are down')).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Add expense' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('adding an expense', () => {
  const openForm = async () => {
    const dlg = await openClaim();
    const add = await within(dlg).findByRole('button', { name: 'Add expense' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(add);
    return screen.findByRole('dialog', { name: 'Add expense' });
  };
  const sent = (f: ReturnType<typeof mockPageApi>) => (writes(f, '/items')[0]![1] as RequestInit).body as FormData;

  it('sends an ordinary expense with supplier details and the receipt, and leaves out inactive categories', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim(), [cat({ requires_receipt: true, gst_applicable: true, max_amount: '1000' }), cat({ id: 'k2', name: 'Old', status: 'inactive' })]));
    const dlg = await openForm();
    expect(within(within(dlg).getByLabelText(/^Category/)).queryByRole('option', { name: 'Old' })).toBeNull();
    expect(within(dlg).getByText(`Up to ${formatMoney('1000')}`)).toBeTruthy();
    expect(within(dlg).getByText(/GST input credit is decided by finance/)).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '120.50');
    await userEvent.type(within(dlg).getByLabelText(/^Merchant/), 'Cafe');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Lunch');
    await userEvent.type(within(dlg).getByLabelText(/^Supplier GSTIN/), '27abc');
    await userEvent.type(within(dlg).getByLabelText(/^Invoice number/), 'INV-1');
    fireEvent.change(within(dlg).getByLabelText(/^Date/), { target: { value: '2026-02-01' } });
    await userEvent.upload(within(dlg).getByLabelText(/^Receipt/), new File(['x'], 'bill.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/claims/c1/items')).toHaveLength(1));
    const body = sent(f);
    expect(Object.fromEntries([...body.entries()].filter(([k]) => k !== 'receipt'))).toEqual({ categoryId: 'k1', expenseDate: '2026-02-01', amount: '120.50', description: 'Lunch', merchant: 'Cafe', invoiceNumber: 'INV-1', gstin: '27ABC' });
    expect((body.get('receipt') as File).name).toBe('bill.pdf');
    expect(await screen.findByText('Expense added')).toBeTruthy();
  });

  it('refuses a bad amount, one over the limit, and a missing receipt before sending', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim(), [cat({ requires_receipt: true, max_amount: '100' })]));
    const dlg = await openForm();
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '12.345');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Lunch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Enter an amount such as 120 or 120.50')).toBeTruthy();
    expect(within(dlg).getByText('This category needs a receipt')).toBeTruthy();
    await userEvent.clear(within(dlg).getByLabelText(/^Amount/));
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '101');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText(`The limit for Meals is ${formatMoney('100')}`)).toBeTruthy();
    await userEvent.upload(within(dlg).getByLabelText(/^Receipt/), new File(['x'], 'bill.pdf', { type: 'application/pdf' }));
    expect(within(dlg).queryByText('This category needs a receipt')).toBeNull();
    expect(writes(f, '/items')).toHaveLength(0);
  });

  it('warns when the server thinks it is a duplicate', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim(), [cat()], (url, init) => (url.endsWith('/items') && init.method === 'POST' ? { possibleDuplicate: true } : undefined)));
    const dlg = await openForm();
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '10');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Lunch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/looks similar to another claimed expense/)).toBeTruthy();
  });

  it('a refused expense stays open with the reason', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim(), [cat()], (url, init) => (url.endsWith('/items') && init.method === 'POST' ? problem(422, 'Date is before the claim window') : undefined)));
    const dlg = await openForm();
    await userEvent.type(within(dlg).getByLabelText(/^Amount/), '10');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Lunch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Date is before the claim window')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Description/) as HTMLInputElement).value).toBe('Lunch');
  });

  const allowance: Handler = (url) => {
    if (url.includes('/allowance-quote')) return url.includes('tier=OTHER') ? { rate: null } : { rate: url.includes('kind=mileage') ? '12' : '1000' };
    if (url.includes('/allowance-rates')) return { items: [], tiers: ['METRO', 'OTHER'], canManage: false };
    return undefined;
  };
  const CALC = [cat({ id: 'pd', name: 'Per diem', calc: 'per_diem' }), cat({ id: 'km', name: 'Mileage', calc: 'mileage' })];

  it('prices a per-diem from the rate in force, and asks for half-day steps', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim(), CALC, allowance));
    const dlg = await openForm();
    await within(dlg).findByRole('option', { name: 'METRO' });
    expect(within(dlg).getByText('Where, for example: Mumbai, client audit')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Days/), '1.2');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Mumbai');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Enter days in half-day steps, such as 1.5')).toBeTruthy();
    expect(writes(f, '/items')).toHaveLength(0);
    await userEvent.clear(within(dlg).getByLabelText(/^Days/));
    await userEvent.type(within(dlg).getByLabelText(/^Days/), '1.5');
    expect(await within(dlg).findByText(`Allowance ${formatMoney(1500)} (1.5 × ${formatMoney(1000)})`)).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Claim less/) as HTMLInputElement).placeholder).toBe('1500');
    expect(reads(f, `kind=per_diem&date=${todayLocal()}&tier=METRO`).length).toBeGreaterThan(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/items')).toHaveLength(1));
    const body = sent(f);
    expect(body.get('quantity')).toBe('1.5');
    expect(body.get('tier')).toBe('METRO');
    expect(body.get('vehicle')).toBeNull();
    expect(body.get('amount')).toBeNull();
  });

  it('says when no rate is set for the destination class', async () => {
    mockPageApi(SELF, FLAG, claimsApi(claim(), CALC, allowance));
    const dlg = await openForm();
    await within(dlg).findByRole('option', { name: 'OTHER' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Destination class/), 'OTHER');
    expect(await within(dlg).findByText('No rate is set for this. Ask finance.')).toBeTruthy();
  });

  it('prices mileage by vehicle and asks for one decimal at most', async () => {
    const f = mockPageApi(SELF, FLAG, claimsApi(claim(), CALC, allowance));
    const dlg = await openForm();
    await within(dlg).findByRole('option', { name: 'METRO' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Category/), 'km');
    expect(within(dlg).getByText('From and to, for example: Office to client site and back')).toBeTruthy();
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Vehicle/), 'two_wheeler');
    await waitFor(() => expect(reads(f, 'kind=mileage').some((c) => String(c[0]).includes('vehicle=two_wheeler'))).toBe(true));
    await userEvent.type(within(dlg).getByLabelText(/^Distance/), '12.55');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Office to site');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    expect(await within(dlg).findByText('Enter the distance with at most one decimal, such as 12.5')).toBeTruthy();
    await userEvent.clear(within(dlg).getByLabelText(/^Distance/));
    await userEvent.type(within(dlg).getByLabelText(/^Distance/), '10');
    await userEvent.type(within(dlg).getByLabelText(/^Claim less/), '100');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/items')).toHaveLength(1));
    const body = sent(f);
    expect(body.get('quantity')).toBe('10');
    expect(body.get('vehicle')).toBe('two_wheeler');
    expect(body.get('amount')).toBe('100');
    expect(body.get('tier')).toBeNull();
  });
});

describe('finance', () => {
  const finance = (over: Record<string, unknown> = {}, extra: Handler = () => undefined): Handler => (url, init) => {
    const x = extra(url, init);
    if (x !== undefined) return x;
    if ((init.method ?? 'GET') !== 'GET') return { total: '100' };
    const key = Object.keys(over).find((k) => url.includes(k));
    if (key) return over[key];
    if (url.includes('/reports/ageing')) return { pipeline: [], approvedUnpaidByAge: [] };
    return { items: [] };
  };

  it('shows the pipeline and the ageing of unpaid claims', async () => {
    mockPageApi(['expenses.read'], FLAG, finance({ '/reports/ageing': { pipeline: [{ status: 'submitted', amount: '500', claims: 2 }, { status: 'approved', amount: '100', claims: 1 }], approvedUnpaidByAge: [{ bucket: '0-7', amount: '100', claims: 1 }] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    const tiles = await screen.findByLabelText('Reimbursement pipeline');
    expect(within(tiles).getByText('Awaiting approval')).toBeTruthy();
    expect(within(tiles).getByText('Approved, unpaid')).toBeTruthy();
    expect(within(tiles).getByText('Unpaid 0-7 days')).toBeTruthy();
    expect(within(tiles).getByText('2 claim(s)')).toBeTruthy();
    expect(await screen.findByText('No batches yet')).toBeTruthy();
  });

  it('read access sees batches but cannot select or act on them', async () => {
    mockPageApi(['expenses.read'], FLAG, finance({ '/batches': { items: [batch()] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    await screen.findByText('Asha Rao');
    expect(screen.queryByText('Approved, ready to pay')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('prepares a batch from what is ticked, then clears the ticks', async () => {
    const f = mockPageApi(['expenses.pay'], FLAG, finance({ '/payables': { items: [payable(), payable({ id: 'p2', title: 'Hotel', advance_adjusted: '40', total: '140' })] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    const prep = await screen.findByRole('button', { name: 'Prepare batch (0)' });
    expect((prep as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/less/)).toBeTruthy();
    await userEvent.click(await screen.findByLabelText('Select Taxi'));
    await userEvent.click(screen.getByLabelText('Select Hotel'));
    await userEvent.click(screen.getByLabelText('Select Hotel'));
    await userEvent.click(screen.getByRole('button', { name: 'Prepare batch (1)' }));
    await waitFor(() => expect(writes(f, '/expenses/batches')).toHaveLength(1));
    expect(bodyOf(writes(f, '/expenses/batches')[0]!)).toEqual({ claimIds: ['p1'] });
    expect(await screen.findByText(`Batch prepared: ${formatMoney('100')}. Another finance user must approve it.`)).toBeTruthy();
    await screen.findByRole('button', { name: 'Prepare batch (0)' });
  });

  it('a refused batch shows the reason and keeps the tick', async () => {
    mockPageApi(['expenses.pay'], FLAG, finance({ '/payables': { items: [payable()] } }, (url, init) => (url.endsWith('/batches') && init.method === 'POST' ? problem(409, 'Claim already batched') : undefined)));
    showPage(<Expenses />, '/expenses?tab=finance');
    await userEvent.click(await screen.findByLabelText('Select Taxi'));
    await userEvent.click(screen.getByRole('button', { name: 'Prepare batch (1)' }));
    expect(await screen.findByText('Claim already batched')).toBeTruthy();
    expect((screen.getByLabelText('Select Taxi') as HTMLInputElement).checked).toBe(true);
  });

  it('on a phone each payable has a visible Select', async () => {
    setViewport(400);
    mockPageApi(['expenses.pay'], FLAG, finance({ '/payables': { items: [payable()] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    expect(await screen.findByText('Select')).toBeTruthy();
  });

  it('approves a batch another person prepared', async () => {
    const f = mockPageApi(['expenses.pay'], FLAG, finance({ '/batches': { items: [batch()] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes(f, '/batches/b1/approve')).toHaveLength(1));
    expect(await screen.findByText('Batch approved')).toBeTruthy();
  });

  it('tells the preparer another person must approve', async () => {
    mockPageApi(['expenses.pay'], FLAG, finance({ '/batches': { items: [batch({ prepared_by: 'u1' })] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    expect(await screen.findByText(/Another finance user must approve it/)).toBeTruthy();
  });

  it('records a payment with its reference, and a refusal keeps the reference', async () => {
    let refuse = true;
    const f = mockPageApi(['expenses.pay'], FLAG, finance({ '/batches': { items: [batch({ status: 'approved', approved_by_name: 'Dev' })] } }, (url) => {
      if (!url.endsWith('/paid')) return undefined;
      if (refuse) { refuse = false; return problem(409, 'Reference already used'); }
      return { ok: true };
    }));
    showPage(<Expenses />, '/expenses?tab=finance');
    expect(await screen.findByText('Asha Rao → Dev', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    const dlg = await screen.findByRole('dialog', { name: 'Record payment' });
    await userEvent.type(within(dlg).getByLabelText(/^Payment reference/), 'NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark paid' }));
    expect(await within(dlg).findByText('Reference already used')).toBeTruthy();
    expect((within(dlg).getByLabelText(/^Payment reference/) as HTMLInputElement).value).toBe('NEFT-1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mark paid' }));
    await waitFor(() => expect(writes(f, '/batches/b1/paid')).toHaveLength(2));
    expect(bodyOf(writes(f, '/batches/b1/paid')[1]!)).toEqual({ paymentReference: 'NEFT-1' });
    expect(await screen.findByText('Payment recorded; employees notified')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record payment' })).toBeNull());
  });

  it('a paid batch shows its reference and offers only the export', async () => {
    mockPageApi(['expenses.pay'], FLAG, finance({ '/batches': { items: [batch({ status: 'paid', payment_reference: 'NEFT-1', paid_by_name: 'Dev' })] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    expect(await screen.findByText(/Ref NEFT-1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancels a batch after saying where the claims go', async () => {
    const f = mockPageApi(['expenses.pay'], FLAG, finance({ '/batches': { items: [batch()] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel batch' });
    expect(within(dlg).getByText(/The claims go back to ready to pay/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel batch' }));
    await waitFor(() => expect(writes(f, '/batches/b1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Batch cancelled')).toBeTruthy();
  });
});

describe('categories', () => {
  const api = (items: ExpenseCategory[], extra: Handler = () => undefined): Handler => (url, init) => extra(url, init) ?? ((init.method ?? 'GET') === 'GET' ? { items } : { ok: true });

  it('lists what each category does', async () => {
    mockPageApi(['expenses.manage'], FLAG, api([cat({ requires_receipt: true, gst_applicable: true, max_amount: '100' }), cat({ id: 'k2', code: 'PD', name: 'Per diem', calc: 'per_diem' }), cat({ id: 'k3', code: 'KM', name: 'Mileage', calc: 'mileage' })]));
    showPage(<Expenses />, '/expenses?tab=categories');
    const table = await screen.findByRole('table', { name: 'Expense categories' });
    const meals = within(table).getByRole('row', { name: /Meals/ });
    expect(within(meals).getByText('Required')).toBeTruthy();
    expect(within(meals).getByText('Captured')).toBeTruthy();
    expect(within(meals).getByText('Amount')).toBeTruthy();
    expect(within(table).getByText('Days × per-diem rate')).toBeTruthy();
    expect(within(table).getByText('Km × mileage rate')).toBeTruthy();
    expect(within(within(table).getByRole('row', { name: /Mileage/ })).getByText('Optional')).toBeTruthy();
  });

  it('with none yet, gives examples', async () => {
    mockPageApi(['expenses.manage'], FLAG, api([]));
    showPage(<Expenses />, '/expenses?tab=categories');
    expect(await screen.findByText('No categories yet')).toBeTruthy();
  });

  it('creates a category; choosing an allowance drops the receipt requirement', async () => {
    const f = mockPageApi(['expenses.manage'], FLAG, api([]));
    showPage(<Expenses />, '/expenses?tab=categories');
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const dlg = await screen.findByRole('dialog', { name: 'New expense category' });
    await userEvent.type(within(dlg).getByLabelText(/^Code/), 'taxi');
    await userEvent.type(within(dlg).getByLabelText(/^Name/), 'Taxi');
    fireEvent.change(within(dlg).getByLabelText(/^Limit per item/), { target: { value: '250' } });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Status/), 'inactive');
    await userEvent.type(within(dlg).getByLabelText(/^Description/), 'Local');
    const receipt = within(dlg).getByLabelText('Receipt required') as HTMLInputElement;
    expect(receipt.checked).toBe(true);
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Calculated as/), 'mileage');
    expect(receipt.checked).toBe(false);
    await userEvent.click(receipt);
    await userEvent.click(within(dlg).getByLabelText(/Capture supplier GSTIN/));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/expenses/categories')).toHaveLength(1));
    const call = writes(f, '/expenses/categories')[0]!;
    expect((call[1] as RequestInit).method).toBe('POST');
    expect(bodyOf(call)).toEqual({ code: 'TAXI', name: 'Taxi', description: 'Local', requiresReceipt: true, maxAmount: 250, gstApplicable: true, status: 'inactive', calc: 'mileage' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('edits with PUT, blank limit and description as null; a refusal stays open', async () => {
    let refuse = true;
    const f = mockPageApi(['expenses.manage'], FLAG, api([cat({ max_amount: '100' })], (url, init) => {
      if (init.method !== 'PUT') return undefined;
      if (refuse) { refuse = false; return problem(409, 'Code already used'); }
      return { ok: true };
    }));
    showPage(<Expenses />, '/expenses?tab=categories');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit MEAL' });
    fireEvent.change(within(dlg).getByLabelText(/^Limit per item/), { target: { value: '' } });
    await userEvent.clear(within(dlg).getByLabelText(/^Description/));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Code already used')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/categories/k1')).toHaveLength(2));
    expect(bodyOf(writes(f, '/categories/k1')[1]!)).toMatchObject({ maxAmount: null, description: null, calc: null });
    expect(bodyOf(writes(f, '/categories/k1')[1]!)).not.toHaveProperty('id');
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
});

describe('allowance rates', () => {
  const api = (items: AllowanceRate[], canManage = true, extra: Handler = () => undefined): Handler => (url, init) => extra(url, init) ?? ((init.method ?? 'GET') === 'GET' ? { items, tiers: ['METRO', 'OTHER'], canManage } : { ok: true });
  const show = async () => { showPage(<Expenses />, '/expenses?tab=rates'); return screen.findByText(/Your organization's allowance policy/); };

  it('hides superseded rates until asked, and names vehicles and grades', async () => {
    mockPageApi(['expenses.manage'], FLAG, api([
      rate({ note: 'Board decision', created_by_name: 'Asha Rao' }),
      rate({ id: 'r2', grade: 'M2', state: 'superseded', rate: '900' }),
      rate({ id: 'r3', kind: 'mileage', tier: null, vehicle: 'two_wheeler', rate: '6' }),
      rate({ id: 'r4', kind: 'mileage', tier: null, vehicle: 'tram', rate: '3' }),
    ]));
    await show();
    const perDiem = screen.getByRole('table', { name: 'Per diem (per day)' });
    expect(within(perDiem).getByText('All grades')).toBeTruthy();
    expect(within(perDiem).getByText('Board decision')).toBeTruthy();
    expect(within(perDiem).getByText('Asha Rao')).toBeTruthy();
    expect(within(perDiem).queryByText('M2')).toBeNull();
    const mileage = screen.getByRole('table', { name: 'Mileage (per km)' });
    expect(within(mileage).getByText('Two-wheeler')).toBeTruthy();
    expect(within(mileage).getByText('tram')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Show superseded rates'));
    expect(await within(perDiem).findByText('M2')).toBeTruthy();
  });

  it('says when a section has no rates, and a reader cannot add or withdraw', async () => {
    mockPageApi(['expenses.manage'], FLAG, api([rate({ state: 'scheduled' })], false));
    await show();
    expect(screen.getByText('No mileage rates yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add rate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('adds a per-diem rate with a blank grade as null, and checks the rate first', async () => {
    const f = mockPageApi(['expenses.manage'], FLAG, api([]));
    await show();
    await userEvent.click(within(screen.getByLabelText('Per diem (per day)')).getByRole('button', { name: 'Add rate' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add per-diem rate' });
    expect((within(dlg).getByLabelText(/^Destination class/) as HTMLInputElement).value).toBe('METRO');
    await userEvent.clear(within(dlg).getByLabelText(/^Destination class/));
    await userEvent.type(within(dlg).getByLabelText(/^Destination class/), 'intl');
    await userEvent.type(within(dlg).getByLabelText(/^Rate per day/), 'abc');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add rate' }));
    expect(await within(dlg).findByText('Enter a rate such as 12 or 12.50')).toBeTruthy();
    expect(writes(f, '/allowance-rates')).toHaveLength(0);
    await userEvent.clear(within(dlg).getByLabelText(/^Rate per day/));
    await userEvent.type(within(dlg).getByLabelText(/^Rate per day/), '12.50');
    fireEvent.change(within(dlg).getByLabelText(/^Applies from/), { target: { value: '2026-02-01' } });
    await userEvent.type(within(dlg).getByLabelText(/^Note/), ' Board ');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add rate' }));
    await waitFor(() => expect(writes(f, '/allowance-rates')).toHaveLength(1));
    expect(bodyOf(writes(f, '/allowance-rates')[0]!)).toEqual({ kind: 'per_diem', rate: 12.5, effectiveFrom: '2026-02-01', note: 'Board', tier: 'INTL', grade: null });
    expect(await screen.findByText('Rate added')).toBeTruthy();
  });

  it('adds a grade-specific per-diem rate', async () => {
    const f = mockPageApi(['expenses.manage'], FLAG, api([]));
    await show();
    await userEvent.click(within(screen.getByLabelText('Per diem (per day)')).getByRole('button', { name: 'Add rate' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add per-diem rate' });
    await userEvent.type(within(dlg).getByLabelText(/^Grade/), ' M2 ');
    await userEvent.type(within(dlg).getByLabelText(/^Rate per day/), '100');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add rate' }));
    await waitFor(() => expect(writes(f, '/allowance-rates')).toHaveLength(1));
    expect(bodyOf(writes(f, '/allowance-rates')[0]!)).toMatchObject({ tier: 'METRO', grade: 'M2' });
  });

  it('adds a mileage rate by vehicle; a refusal stays open with the reason', async () => {
    let refuse = true;
    const f = mockPageApi(['expenses.manage'], FLAG, api([], true, (_url, init) => {
      if (init.method !== 'POST') return undefined;
      if (refuse) { refuse = false; return problem(409, 'A rate already starts that day'); }
      return { ok: true };
    }));
    await show();
    await userEvent.click(within(screen.getByLabelText('Mileage (per km)')).getByRole('button', { name: 'Add rate' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add mileage rate' });
    await userEvent.selectOptions(within(dlg).getByLabelText(/^Vehicle/), 'two_wheeler');
    await userEvent.type(within(dlg).getByLabelText(/^Rate per km/), '6');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add rate' }));
    expect(await within(dlg).findByText('A rate already starts that day')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add rate' }));
    await waitFor(() => expect(writes(f, '/allowance-rates')).toHaveLength(2));
    expect(bodyOf(writes(f, '/allowance-rates')[1]!)).toEqual({ kind: 'mileage', rate: 6, effectiveFrom: todayLocal(), vehicle: 'two_wheeler' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('withdraws a scheduled rate only, with DELETE', async () => {
    const f = mockPageApi(['expenses.manage'], FLAG, api([rate({ id: 'r9', state: 'scheduled', effective_from: '2027-01-01' }), rate()]));
    await show();
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw rate' });
    expect(within(dlg).getByText(new RegExp(`from ${fmtDate('2027-01-01')}`))).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw rate' }));
    await waitFor(() => expect(writes(f, '/allowance-rates/r9')).toHaveLength(1));
    expect((writes(f, '/allowance-rates/r9')[0]![1] as RequestInit).method).toBe('DELETE');
    expect(await screen.findByText('Rate withdrawn')).toBeTruthy();
  });
});
