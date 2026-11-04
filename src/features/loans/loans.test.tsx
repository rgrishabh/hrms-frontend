import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Loans } from '../../pages/Loans';
import { bodyOf, mockPageApi, problemResponse, showPage, writes } from '../../test/page';

const SELF = ['loans.self'];
const ALL = ['loans.self', 'loans.team.read', 'loans.read', 'loans.manage', 'loans.approve'];
const BOTH = ['FEATURE_LOANS', 'FEATURE_SALARY_ADVANCE'];
const loan = (over = {}) => ({ id: 'l1', employee_id: 'e9', employee_code: 'E9', name: 'Rohan Iyer', department: 'Ops', kind: 'loan', amount: '25000', installments: 6, installment_amount: '4167', first_period: '2026-11', skip_periods: [], purpose: 'Laptop', status: 'disbursed', outstanding: '25000', recorded_by_other: false, ...over });
const paged = (items: unknown[], over = {}) => ({ items, page: 1, pageSize: 25, total: items.length, ...over });

afterEach(() => vi.restoreAllMocks());

describe('Loans', () => {
  it('a kind whose flag is off is not offered', async () => {
    mockPageApi(SELF, ['FEATURE_LOANS'], () => paged([]));
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    const dlg = await screen.findByRole('dialog', { name: /Apply for a/ });
    expect(within(dlg).queryByRole('option', { name: /Salary advance/ })).toBeNull();
  });
  it('with both off in the kinds filter there is nothing odd: one kind means no filter', async () => {
    mockPageApi(ALL, ['FEATURE_SALARY_ADVANCE'], () => paged([loan({ kind: 'salary_advance' })]));
    showPage(<Loans />, '/loans?tab=all');
    await screen.findByRole('table', { name: 'Advances and loans' });
    expect(screen.queryByLabelText('Kind')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Salary advances');
  });
  it('the applicant list pages instead of stopping at 50', async () => {
    const f = mockPageApi(SELF, BOTH, (url) => paged([loan({ employee_id: 'e1' })], { total: 60, page: Number(new URL(url, 'http://x').searchParams.get('page') ?? 1) }));
    showPage(<Loans />, '/loans');
    await screen.findByRole('table', { name: 'My advances and loans' });
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=mine/.test(String(u)) && /page=2/.test(String(u)))).toBe(true));
  });
  it('changing tab returns to page 1 and drops the other tab\'s filters', async () => {
    const f = mockPageApi(ALL, BOTH, (url) => paged([loan()], { total: 60, page: Number(new URL(url, 'http://x').searchParams.get('page') ?? 1) }));
    showPage(<Loans />, '/loans?tab=team');
    await screen.findByRole('table', { name: 'Advances and loans' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'disbursed');
    await userEvent.click(await screen.findByRole('button', { name: /next/i }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=team/.test(String(u)) && /page=2/.test(String(u)))).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'Everyone' }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=all/.test(String(u)))).toBe(true));
    const all = f.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('scope=all'));
    expect(all.every((u) => !u.includes('page=2') && !u.includes('status='))).toBe(true);
  });
  it('someone cannot defer their own recovery, as with disburse and repayment', async () => {
    mockPageApi(ALL, BOTH, () => paged([loan({ employee_id: 'e1', name: 'Me Myself' }), loan({ id: 'l2' })]));
    showPage(<Loans />, '/loans?tab=all');
    const table = await screen.findByRole('table', { name: 'Advances and loans' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows.find((r) => r.textContent?.includes('Me Myself'))!).queryByRole('button', { name: /Defer/ })).toBeNull();
    expect(within(rows.find((r) => r.textContent?.includes('Rohan'))!).getByRole('button', { name: /Defer/ })).toBeTruthy();
  });
  it('apply: the plan is shown, the wrong amount is caught at the field, a failed send keeps the form', async () => {
    const f = mockPageApi(SELF, BOTH, (url, init) => {
      if (init.method === 'POST') return problemResponse(409, 'There is already a loan in progress');
      return paged([]);
    });
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    const form = await screen.findByRole('dialog', { name: 'Apply for an advance or loan' });
    await userEvent.selectOptions(within(form).getByLabelText(/^Kind/), 'loan');
    await userEvent.type(within(form).getByLabelText(/^Amount/), '25000');
    await userEvent.clear(within(form).getByLabelText(/^Instalments/));
    await userEvent.type(within(form).getByLabelText(/^Instalments/), '6');
    expect(form.textContent).toContain('6 monthly instalments of');
    await userEvent.type(within(form).getByLabelText(/^Purpose/), 'Laptop');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit for approval' }));
    expect(await within(form).findByText('There is already a loan in progress')).toBeTruthy();
    expect(bodyOf(writes(f, '/loans/requests')[0]!)).toMatchObject({ kind: 'loan', amount: 25000, installments: 6 });
    expect(screen.getByRole('dialog', { name: 'Apply for an advance or loan' })).toBeTruthy();
  });
  it('a failed withdraw stays open', async () => {
    mockPageApi(SELF, BOTH, (url, init) => (init.method === 'POST' ? problemResponse(409, 'Already decided') : paged([loan({ employee_id: 'e1', status: 'pending' })])));
    showPage(<Loans />, '/loans');
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw application' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already decided');
  });
});
