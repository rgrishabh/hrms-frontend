import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Accounting } from '../../pages/Accounting';
import { mockPageApi, problemResponse, showPage } from '../../test/page';

const PERMS = ['accounting.export', 'accounting.configure'];
const FLAGS = ['FEATURE_ACCOUNTING_EXPORTS', 'FEATURE_EXPENSE_CLAIMS'];
const SOURCES = { runs: [{ id: 'r1', period: '2026-10', kind: 'regular', status: 'finalized', totals: { gross: 1000 }, legal_entity: 'Co', last_export: null }], batches: [{ id: 'b1', status: 'paid', total: 500, claim_count: 2, created_at: '2026-10-31T19:00:00Z', paid_at: null, payment_reference: 'NEFT-1', last_export: null }] };
const JOURNAL = { number: 'PR-1', date: '2026-10-31', narration: 'Payroll', missing: [], balanced: true, total: 1000, entries: [{ key: 'net_pay', label: 'Net salary payable', ledger: 'Salary Payable', debit: 0, credit: 1000 }, { key: 'earning:BASIC', label: 'Basic', ledger: 'Salaries', debit: 1000, credit: 0 }] };

afterEach(() => vi.restoreAllMocks());

describe('Accounting', () => {
  it('the tab lives in the URL, so a reload keeps the place', async () => {
    mockPageApi(PERMS, FLAGS, (url) => (url.includes('/ledger-map') ? { items: [], heads: [{ key: 'net_pay', label: 'Net salary payable' }] } : SOURCES));
    showPage(<Accounting />, '/accounting?tab=ledgers');
    expect(await screen.findByLabelText('Ledger for net_pay')).toBeTruthy();
  });
  it('a batch shows the date in the organization timezone, not UTC', async () => {
    mockPageApi(PERMS, FLAGS, () => SOURCES);
    showPage(<Accounting />, '/accounting');
    expect((await screen.findByRole('table', { name: 'Reimbursement batches' })).textContent).toContain('01/11/2026');
  });
  it('a failed download stays on the page with the reason', async () => {
    mockPageApi(PERMS, FLAGS, (url) => {
      if (url.includes('/export')) return problemResponse(409, 'Map these heads to ledgers first');
      if (url.includes('/journal')) return JOURNAL;
      return SOURCES;
    });
    showPage(<Accounting />, '/accounting');
    const table = await screen.findByRole('table', { name: 'Payroll runs' });
    await userEvent.click(within(table).getByRole('button', { name: /Journal/ }));
    const dlg = await screen.findByRole('dialog', { name: /Journal/ });
    await userEvent.click(await within(dlg).findByRole('button', { name: 'Download CSV' }));
    expect(await screen.findByText('Map these heads to ledgers first')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /Journal/ })).toBeTruthy();
  });
});
