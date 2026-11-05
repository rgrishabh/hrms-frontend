import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Accounting } from './Accounting';
import { queryClient } from '../lib/query';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes, type Handler } from '../test/page';

configure({ asyncUtilTimeout: 10000 });

const EXPORT = ['accounting.export'];
const BOTH = ['accounting.export', 'accounting.configure'];
const RUN = { id: 'r1', period: '2026-01', kind: 'regular', status: 'finalized', totals: { gross: 1000 }, legal_entity: 'Co', last_export: null };
const BATCH = { id: 'b1', status: 'paid', total: 750, claim_count: 3, created_at: '2026-02-01T05:00:00Z', payment_reference: 'NEFT-9', last_export: { at: '2026-02-02T05:00:00Z', format: 'tally_xml', by: 'Kim' } };
const JOURNAL = { number: 'PR-001', date: '2026-01-31', narration: 'January payroll', missing: [], balanced: true, total: 1000, entries: [{ key: 'BASIC', label: 'Basic pay', ledger: 'Salaries', debit: 1000, credit: 0 }, { key: 'BANK', label: 'Bank', ledger: null, debit: 0, credit: 1000 }] };
const MAP = { heads: [{ key: 'BASIC', label: 'Basic pay' }, { key: 'BANK', label: 'BANK' }], items: [{ map_key: 'BASIC', ledger_name: 'Salaries' }, { map_key: 'OLD*', ledger_name: 'Old ledger' }] };

const api = (over: { sources?: object; journal?: object; map?: object; extra?: Handler } = {}): Handler => (url, init) => {
  const x = over.extra?.(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/sources')) return over.sources ?? { runs: [RUN], batches: [BATCH] };
  if (url.includes('/journal')) return over.journal ?? JOURNAL;
  if (url.includes('/ledger-map')) return over.map ?? MAP;
  return {};
};
const openJournal = async (over: Parameters<typeof api>[0] = {}, permissions = BOTH) => {
  const f = mockPageApi(permissions, ['FEATURE_EXPENSE_CLAIMS'], api(over));
  renderPage(<Accounting />, '/accounting?tab=exports');
  await userEvent.click(await screen.findByRole('button', { name: 'Journal for payroll 2026-01, Co' }));
  return { f, dlg: await screen.findByRole('dialog', { name: 'Journal — Payroll 2026-01' }) };
};

describe('access', () => {
  it('no permission says so and loads nothing', async () => {
    const f = mockPageApi([], api());
    renderPage(<Accounting />, '/accounting');
    expect(await screen.findByText('You do not have access to accounting exports')).toBeTruthy();
    expect(reads(f, '/accounting/')).toHaveLength(0);
  });
  it('a configure-only role gets the ledger map alone, without tabs', async () => {
    mockPageApi(['accounting.configure'], api());
    renderPage(<Accounting />, '/accounting');
    expect(await screen.findByRole('table', { name: 'Ledger map' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('someone who exports moves between journals and ledgers, read-only on ledgers', async () => {
    mockPageApi(EXPORT, api());
    renderPage(<Accounting />, '/accounting');
    await screen.findByRole('table', { name: 'Payroll runs' });
    await userEvent.click(screen.getByRole('tab', { name: 'Ledger map' }));
    const table = await screen.findByRole('table', { name: 'Ledger map' });
    expect(within(table).getByText('Salaries')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    expect(within(table).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });
});

describe('journals', () => {
  it('lists runs and batches with what was last exported', async () => {
    mockPageApi(EXPORT, ['FEATURE_EXPENSE_CLAIMS'], api({ sources: { runs: [RUN, { ...RUN, id: 'r2', period: '2026-02', kind: 'fnf', last_export: { at: '2026-03-01T05:00:00Z', format: 'csv', by: 'Lee' } }], batches: [BATCH, { ...BATCH, id: 'b2', payment_reference: null }] } }));
    renderPage(<Accounting />, '/accounting');
    const runs = await screen.findByRole('table', { name: 'Payroll runs' });
    expect(within(runs).getByText('2026-02 · full and final')).toBeTruthy();
    expect(within(runs).getByText('Not exported')).toBeTruthy();
    expect(within(runs).getByText(/^CSV · .* · Lee$/)).toBeTruthy();
    const batches = screen.getByRole('table', { name: 'Reimbursement batches' });
    expect(within(batches).getByText('NEFT-9')).toBeTruthy();
    expect(within(batches).getAllByText(/^Tally · .* · Kim$/)).toHaveLength(2);
    expect(within(batches).getByText('—')).toBeTruthy();
  });
  it('hides reimbursements when expenses are off, and says when lists are empty', async () => {
    mockPageApi(EXPORT, [], api({ sources: { runs: [], batches: [] } }));
    const one = renderPage(<Accounting />, '/accounting');
    expect(await screen.findByText('No finalized payroll runs yet')).toBeTruthy();
    expect(screen.queryByText('Reimbursement batches')).toBeNull();
    one.unmount();
    mockPageApi(EXPORT, ['FEATURE_EXPENSE_CLAIMS'], api({ sources: { runs: [], batches: [] } }));
    renderPage(<Accounting />, '/accounting');
    expect(await screen.findByText('No approved reimbursement batches')).toBeTruthy();
  });
  it('masked gross stays hidden until reveal, which asks with reveal=1', async () => {
    const hidden = { runs: [{ ...RUN, totals: null, masked: true, maskedFields: ['totals'] }], batches: [] };
    const f = mockPageApi(EXPORT, api({ extra: (url) => (url.includes('/sources') ? (url.includes('reveal=1') ? { runs: [RUN], batches: [] } : hidden) : undefined) }));
    renderPage(<Accounting />, '/accounting');
    const runs = await screen.findByRole('table', { name: 'Payroll runs' });
    expect(within(runs).getByText('Hidden')).toBeTruthy();
    expect(within(runs).queryByText(/1,000/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(await screen.findByText(/1,000/)).toBeTruthy();
    expect(reads(f, '/accounting/sources?reveal=1').length).toBeGreaterThan(0);
  });
  it('a failed source list shows the reason', async () => {
    mockPageApi(EXPORT, api({ extra: (url) => (url.includes('/sources') ? problem(500, 'Sources are down') : undefined) }));
    renderPage(<Accounting />, '/accounting');
    expect(await screen.findByText('Sources are down')).toBeTruthy();
  });
});

describe('journal preview', () => {
  it('shows entries and totals, marks unmapped ones, and opens for a batch too', async () => {
    const { dlg, f } = await openJournal();
    expect(await within(dlg).findByText(/PR-001 · .* · January payroll/)).toBeTruthy();
    expect(reads(f, '/accounting/payroll-runs/r1/journal').length).toBeGreaterThan(0);
    const table = within(dlg).getByRole('table', { name: 'Journal entries' });
    expect(within(table).getByText('Salaries')).toBeTruthy();
    expect(within(table).getByText('Not mapped')).toBeTruthy();
    expect(within(dlg).getByText('Total debit and credit')).toBeTruthy();
  });
  it('a batch journal reads from the batch', async () => {
    const f = mockPageApi(EXPORT, ['FEATURE_EXPENSE_CLAIMS'], api());
    renderPage(<Accounting />, '/accounting');
    await userEvent.click(await screen.findByRole('button', { name: /Journal for reimbursements prepared/ }));
    await screen.findByRole('dialog', { name: /Journal — Reimbursements/ });
    await waitFor(() => expect(reads(f, '/accounting/reimbursement-batches/b1/journal').length).toBeGreaterThan(0));
  });
  it('downloads CSV under the journal number, then asks for the list again', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { dlg, f } = await openJournal({ extra: (url) => (url.includes('/export') ? new Response('a,b', { status: 200, headers: { 'content-type': 'text/csv' } }) : undefined) });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('PR-001.csv');
    expect(reads(f, '/payroll-runs/r1/export?format=csv')).toHaveLength(1);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });
  it('a failed Tally export says why', async () => {
    const { dlg, f } = await openJournal({ extra: (url) => (url.includes('/export') ? problem(409, 'Ledger names changed') : undefined) });
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Download Tally XML' }));
    expect(await screen.findByText('Ledger names changed')).toBeTruthy();
    expect(reads(f, 'format=tally_xml')).toHaveLength(1);
  });
  it('missing heads block export and point a configurer to the ledger map', async () => {
    const { dlg } = await openJournal({ journal: { ...JOURNAL, missing: ['BANK', 'PF'] } });
    expect(await within(dlg).findByText(/Map these heads to ledgers before exporting: BANK, PF/)).toBeTruthy();
    expect(within(dlg).getByRole('link', { name: 'Open the ledger map' }).getAttribute('href')).toBe('/accounting?tab=ledgers');
    expect(within(dlg).queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });
  it('someone who cannot configure is told to ask finance', async () => {
    const { dlg } = await openJournal({ journal: { ...JOURNAL, missing: ['BANK'] } }, EXPORT);
    expect(await within(dlg).findByText(/Ask finance to map them/)).toBeTruthy();
    expect(within(dlg).queryByRole('link', { name: 'Open the ledger map' })).toBeNull();
  });
  it('an unbalanced journal blocks export', async () => {
    const { dlg } = await openJournal({ journal: { ...JOURNAL, balanced: false } });
    expect(await within(dlg).findByText('The journal does not balance. Check the run before exporting.')).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Download Tally XML' })).toBeNull();
  });
});

describe('ledger map', () => {
  const open = async (over: Parameters<typeof api>[0] = {}) => {
    const f = mockPageApi(['accounting.configure'], api(over));
    renderPage(<Accounting />, '/accounting');
    return { f, table: await screen.findByRole('table', { name: 'Ledger map' }) };
  };
  it('nothing to map says when heads appear', async () => {
    mockPageApi(['accounting.configure'], api({ map: { heads: [], items: [] } }));
    renderPage(<Accounting />, '/accounting');
    expect(await screen.findByText('Nothing to map yet')).toBeTruthy();
  });
  it('shows heads and leftovers; saving sends only what changed', async () => {
    const { f, table } = await open();
    expect(within(table).getByText('Basic pay')).toBeTruthy();
    expect(within(table).getByText('OLD*')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(within(table).getByLabelText('Ledger for BANK'), 'HDFC');
    expect(screen.getByRole('button', { name: 'Save (1)' })).toBeTruthy();
    await userEvent.clear(within(table).getByLabelText('Ledger for BASIC'));
    await userEvent.click(screen.getByRole('button', { name: 'Save (2)' }));
    await waitFor(() => expect(writes(f, '/accounting/ledger-map')).toHaveLength(1));
    expect((writes(f, '/accounting/ledger-map')[0]![1] as RequestInit).method).toBe('PUT');
    expect(bodyOf(writes(f, '/accounting/ledger-map')[0]!)).toEqual({ entries: [{ key: 'BASIC', ledger: '' }, { key: 'BANK', ledger: 'HDFC' }] });
    expect(await screen.findByText('Ledger map saved')).toBeTruthy();
  });
  it('putting a value back removes it from the changes', async () => {
    const { table } = await open();
    const input = within(table).getByLabelText('Ledger for BANK');
    await userEvent.type(input, 'H');
    expect(screen.getByRole('button', { name: 'Save (1)' })).toBeTruthy();
    await userEvent.clear(input);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('a refused save shows the reason and keeps what was typed', async () => {
    const { table } = await open({ extra: (url, init) => (url.includes('/ledger-map') && init.method === 'PUT' ? problem(422, 'Ledger name too long') : undefined) });
    await userEvent.type(within(table).getByLabelText('Ledger for BANK'), 'HDFC');
    await userEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ledger name too long');
    expect((within(table).getByLabelText('Ledger for BANK') as HTMLInputElement).value).toBe('HDFC');
  });
});
