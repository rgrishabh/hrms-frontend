import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Expenses } from '../../pages/Expenses';
import { mockPageApi, problem, showPage, writes } from '../../test/pageApi';

const FLAG = ['FEATURE_EXPENSE_CLAIMS'];
const CLAIM = { id: 'c1', title: 'Client visit', status: 'submitted', employee_id: 'e2', employee_name: 'Rohan Iyer', items: [], total: '500', purpose: 'Visit', project: null, editable: false, flagged: 0, created_at: '2026-03-01T10:00:00Z' };

afterEach(() => vi.restoreAllMocks());

describe('Expenses', () => {
  it('a page number from one tab does not carry over to the next', async () => {
    const f = mockPageApi(['expenses.self', 'expenses.team.read'], FLAG, (url) => (url.includes('/claims') ? { items: [{ ...CLAIM, items: 1 }], page: url.includes('page=2') ? 2 : 1, pageSize: 20, total: 60 } : { items: [] }));
    showPage(<Expenses />, '/expenses?tab=mine');
    await userEvent.click(await screen.findByRole('button', { name: /Next/ }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=mine.*page=2/.test(String(u)))).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'Team claims' }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=team/.test(String(u)))).toBe(true));
    const team = f.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('scope=team'));
    expect(team.every((u) => u.includes('page=1'))).toBe(true);
  });

  it('Withdraw is offered only on your own submitted claim', async () => {
    mockPageApi(['expenses.self', 'expenses.team.read'], FLAG, (url) => {
      if (url.endsWith('/claims/c1')) return CLAIM;
      if (url.includes('/claims')) return { items: [{ ...CLAIM, items: 1 }], page: 1, pageSize: 20, total: 1 };
      return { items: [] };
    });
    showPage(<Expenses />, '/expenses?tab=team');
    await userEvent.click(await screen.findByText('Client visit'));
    await screen.findByRole('dialog', { name: 'Client visit' });
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  const financeApi = (over: Record<string, unknown> = {}) => (url: string) => {
    const key = Object.keys(over).find((k) => url.includes(k));
    if (key) return over[key];
    if (url.includes('/reports/ageing')) return { pipeline: [], approvedUnpaidByAge: [] };
    return { items: [] };
  };

  it('a batch cannot be approved by the person who prepared it', async () => {
    const batch = { id: 'b1', status: 'prepared', total: '900', claim_count: 2, created_at: '2026-03-01T10:00:00Z', prepared_by: 'u1', prepared_by_name: 'Me Myself' };
    mockPageApi(['expenses.pay'], FLAG, financeApi({ '/batches': { items: [batch, { ...batch, id: 'b2', prepared_by: 'u2', prepared_by_name: 'Someone Else' }] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    const mine = (await screen.findByText('Me Myself')).closest('tr')!;
    const other = screen.getByText('Someone Else').closest('tr')!;
    expect(within(mine).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(other).getByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  it('a failed finance load is an error, not "nothing to pay"', async () => {
    const down = () => problem(500, 'Finance is down');
    mockPageApi(['expenses.pay'], FLAG, () => down());
    showPage(<Expenses />, '/expenses?tab=finance');
    await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.queryByText('Nothing to pay.')).toBeNull();
    expect(screen.queryByText('No batches yet.')).toBeNull();
  });

  it('the approved date is the local one, not the UTC one', async () => {
    const row = { id: 'p1', employee_name: 'Rohan', employee_code: 'E5', title: 'Taxi', payable: '100', total: '100', advance_adjusted: '0', approved_at: '2026-03-31T20:00:00Z', age_days: 2 };
    mockPageApi(['expenses.pay'], FLAG, financeApi({ '/payables': { items: [row] } }));
    showPage(<Expenses />, '/expenses?tab=finance');
    const tr = (await screen.findByText('Taxi')).closest('tr')!;
    expect(tr.textContent).toContain('01/04/2026');
  });

  it('pressing Add twice adds the expense once', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const draft = { ...CLAIM, status: 'draft', employee_id: 'e1', editable: true };
    const f = mockPageApi(['expenses.self'], FLAG, (url, init) => {
      if (url.includes('/categories')) return { items: [{ id: 'k1', name: 'Meals', requires_receipt: false, status: 'active' }] };
      if (url.endsWith('/claims/c1/items') && init.method === 'POST') return new Promise((r) => { finish = r; });
      if (url.endsWith('/claims/c1')) return draft;
      if (url.includes('/claims')) return { items: [{ ...draft, items: 0 }], page: 1, pageSize: 20, total: 1 };
      return { items: [] };
    });
    showPage(<Expenses />, '/expenses?tab=mine');
    await userEvent.click(await screen.findByText('Client visit'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    const form = await screen.findByRole('dialog', { name: 'Add expense' });
    await userEvent.type(within(form).getByLabelText(/Amount/), '120');
    await userEvent.type(within(form).getByLabelText(/Description/), 'Lunch');
    await userEvent.dblClick(within(form).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(f, '/items').length).toBeGreaterThan(0));
    expect(writes(f, '/items')).toHaveLength(1);
    finish({ id: 'i1' });
  });

  it('a failed receipt download stays on the page and says why', async () => {
    const claim = { ...CLAIM, status: 'approved', employee_id: 'e1', items: [{ id: 'i1', expense_date: '2026-03-01', category_name: 'Meals', description: 'Lunch', amount: '50', has_receipt: true }] };
    mockPageApi(['expenses.self'], FLAG, (url) => {
      if (url.includes('/receipt')) return problem(410, 'Receipt was purged');
      if (url.endsWith('/claims/c1')) return claim;
      if (url.includes('/claims')) return { items: [{ ...claim, items: 1 }], page: 1, pageSize: 20, total: 1 };
      return { items: [] };
    });
    showPage(<Expenses />, '/expenses?tab=mine');
    await userEvent.click(await screen.findByText('Client visit'));
    await userEvent.click(await screen.findByRole('button', { name: /Download receipt/ }));
    expect(await screen.findByText('Receipt was purged')).toBeTruthy();
  });

  it('a failed confirmation stays open with the error', async () => {
    const draft = { ...CLAIM, status: 'draft', employee_id: 'e1', editable: true, items: [{ id: 'i1', expense_date: '2026-03-01', category_name: 'Meals', description: 'Lunch', amount: '50', has_receipt: false }] };
    mockPageApi(['expenses.self'], FLAG, (url, init) => {
      if (url.endsWith('/submit') && init.method === 'POST') return problem(409, 'Receipts are missing');
      if (url.endsWith('/claims/c1')) return draft;
      if (url.includes('/claims')) return { items: [{ ...draft, items: 1 }], page: 1, pageSize: 20, total: 1 };
      return { items: [] };
    });
    showPage(<Expenses />, '/expenses?tab=mine');
    await userEvent.click(await screen.findByText('Client visit'));
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    const dlg = await screen.findByRole('dialog', { name: 'Submit claim' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Submit' }));
    expect(await within(dlg).findByText('Receipts are missing')).toBeTruthy();
  });
});
