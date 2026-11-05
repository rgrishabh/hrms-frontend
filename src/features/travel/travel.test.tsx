import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Travel } from '../../pages/Travel';
import { bodyOf, mockPageApi, problem, showPage, writes } from '../../test/page';

const FLAG = ['FEATURE_TRAVEL'];
const TRIP = { id: 't1', employee_id: 'e2', name: 'Rohan Iyer', employee_code: 'E5', department: 'Ops', start_date: '2026-03-01', end_date: '2026-03-03', origin: 'Pune', destination: 'Mumbai', purpose: 'Client audit', travel_mode: 'rail', trip_type: 'domestic', estimate_total: '5000', advance_requested: '3000', advance_paid_at: '2026-02-20T10:00:00Z', advance_reference: 'NEFT1', status: 'approved' };

afterEach(() => vi.restoreAllMocks());

describe('Travel', () => {
  it('a tab survives a reload through the URL', async () => {
    mockPageApi(['travel.self', 'travel.read'], FLAG, () => ({ items: [TRIP], page: 1, pageSize: 25, total: 1, today: '2026-03-02' }));
    showPage(<Travel />, '/travel?tab=all');
    expect((await screen.findByRole('tab', { name: 'Everyone' })).getAttribute('aria-selected')).toBe('true');
  });

  it('my trips are paged instead of cut off at 50', async () => {
    const f = mockPageApi(['travel.self'], FLAG, (url) => ({ items: [{ ...TRIP, employee_id: 'e1' }], page: url.includes('page=2') ? 2 : 1, pageSize: 25, total: 60, today: '2026-03-02' }));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: /Next/ }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => /scope=mine.*page=2/.test(String(u)))).toBe(true));
  });

  it('a returned trip goes back through resubmit, not a new request', async () => {
    const f = mockPageApi(['travel.self'], FLAG, () => ({ items: [{ ...TRIP, employee_id: 'e1', status: 'returned' }], page: 1, pageSize: 25, total: 1, today: '2026-03-02' }));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Correct and resubmit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Correct and resubmit' });
    expect(within(dlg).getByRole('textbox', { name: /Purpose/ })).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: /Submit|Send/ }));
    await waitFor(() => expect(writes(f, '/requests/t1/resubmit')).toHaveLength(1));
    expect(writes(f, '/travel/requests').filter(([u]) => String(u).endsWith('/requests'))).toHaveLength(0);
  });

  it('a correction starts from the estimate and advance on the request, so fixing the purpose does not zero them', async () => {
    const f = mockPageApi(['travel.self'], FLAG, () => ({ items: [{ ...TRIP, employee_id: 'e1', status: 'returned', estimate_travel: '1200.00', estimate_stay: '0.00', estimate_local: '800.00', estimate_meals: '600.00', estimate_other: '0.00', advance_requested: '1500.00', accommodation: true, mark_on_duty: true }], page: 1, pageSize: 25, total: 1, today: '2026-03-02' }));
    showPage(<Travel />, '/travel');
    await userEvent.click(await screen.findByRole('button', { name: 'Correct and resubmit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Correct and resubmit' });
    await userEvent.click(within(dlg).getByRole('button', { name: /Submit|Send/ }));
    await waitFor(() => expect(writes(f, '/resubmit')).toHaveLength(1));
    const body = bodyOf(writes(f, '/resubmit')[0]!);
    expect(body['estimate']).toMatchObject({ travel: '1200.00', local: '800.00', meals: '600.00' });
    expect(body['advance']).toBe('1500.00');
    expect(body['accommodation']).toBe(true);
    expect(body['markOnDuty']).toBe(true);
  });

  it('if the outstanding advance cannot be loaded, it says so rather than showing zero', async () => {
    mockPageApi(['expenses.pay', 'travel.read'], FLAG, (url) => (url.endsWith('/requests/t1') ? problem(500, 'Settlement is down') : { items: [TRIP], page: 1, pageSize: 25, total: 1, today: '2026-03-02' }));
    showPage(<Travel />, '/travel?tab=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance returned' }));
    const dlg = await screen.findByRole('dialog', { name: 'Advance returned' });
    expect(await within(dlg).findByText(/Settlement is down/)).toBeTruthy();
    expect(within(dlg).queryByText(/still has/)).toBeNull();
  });
});
