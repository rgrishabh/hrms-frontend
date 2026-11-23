import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reports } from '../../pages/Reports';
import { formatMoney } from '../../components/Money';
import { mockPageApi, problem, reads, renderPage } from '../../test/page';

afterEach(() => { vi.restoreAllMocks(); window.__testViewportWidth = undefined; });

const INFO = { key: 'pay', name: 'Payroll cost', description: 'Cost by department', category: 'Pay', scope: 'all', params: [{ key: 'month', label: 'Month', type: 'month', default: '2026-10' }] };
const row = (i: number) => ({ department: `Department ${i}`, cost: 1000 * i });
const REPORT = (rows = [row(1), row(2)]) => ({ key: 'pay', name: 'Payroll cost', generatedAt: '2026-11-01T10:00:00Z', scope: 'all', params: {}, columns: [{ key: 'department', label: 'Department', type: 'text' }, { key: 'cost', label: 'Cost', type: 'money' }], rows, totals: { cost: 3000 }, notes: [], truncated: false });
const api = (report = REPORT(), advanced = false) => mockPageApi(['payroll.read'], (url) => {
  if (url.endsWith('/api/v1/reports')) return { items: [INFO], today: '2026-11-01', advanced };
  if (url.includes('/reports/pay')) return report;
  return { items: [] };
});

describe('reports', () => {
  it('Run report asks the server again even when the options did not change', async () => {
    const f = api();
    renderPage(<Reports />, '/reports?r=pay');
    await screen.findByRole('table', { name: 'Payroll cost' });
    expect(reads(f, '/reports/pay?')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Run report' }));
    await waitFor(() => expect(reads(f, '/reports/pay?')).toHaveLength(2));
  });
  it('a failed download stays on the page and says why', async () => {
    mockPageApi(['payroll.read'], (url) => {
      if (url.endsWith('/api/v1/reports')) return { items: [INFO], today: '2026-11-01', advanced: false };
      if (url.includes('/export.csv')) return problem(403, 'Exports are off for you');
      return REPORT();
    });
    renderPage(<Reports />, '/reports?r=pay');
    await userEvent.click(await screen.findByRole('button', { name: 'Download CSV' }));
    expect(await screen.findByText('Exports are off for you')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Payroll cost' })).toBeTruthy();
  });
  it('a filter that matches nothing says so', async () => {
    api(REPORT(Array.from({ length: 12 }, (_, i) => row(i))));
    renderPage(<Reports />, '/reports?r=pay');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Filter rows' }), 'nothing like this');
    expect(await screen.findByText('No rows match this filter.')).toBeTruthy();
  });
  it('on a phone rows are cards with the total, and amounts use the shared formatter', async () => {
    window.__testViewportWidth = 360;
    api();
    renderPage(<Reports />, '/reports?r=pay');
    const list = await screen.findByRole('list', { name: 'Payroll cost' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(list).getByText('Department 1')).toBeTruthy();
    expect(within(list).getByText('Total')).toBeTruthy();
    expect(within(list).getByText(formatMoney(3000))).toBeTruthy();
  });
  it('sorts on the server-free columns with real buttons', async () => {
    api();
    renderPage(<Reports />, '/reports?r=pay');
    const table = await screen.findByRole('table', { name: 'Payroll cost' });
    const sort = within(table).getByRole('button', { name: 'Cost' });
    await userEvent.click(sort);
    await userEvent.click(within(table).getByRole('button', { name: 'Cost' }));
    expect(within(table).getAllByRole('row')[1]!.textContent).toContain('Department 2');
  });
  it('removing a schedule does not claim a next run', async () => {
    const saved = { id: 's1', name: 'Monthly cost', report_key: 'pay', reportName: 'Payroll cost', params: {}, schedule: { frequency: 'monthly', dayOfMonth: 1, weekday: null, period: 'last_month', enabled: true, nextRunOn: '2026-12-01', recipientIds: [], lastResult: null } };
    mockPageApi(['payroll.read'], (url, init) => {
      if (init.method === 'DELETE') return { ok: true };
      if (url.endsWith('/api/v1/reports')) return { items: [INFO], today: '2026-11-01', advanced: true };
      if (url.includes('/saved/s1/recipients')) return { items: [] };
      if (url.endsWith('/reports/saved')) return { items: [saved] };
      return { items: [] };
    });
    renderPage(<Reports />, '/reports');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit schedule' }));
    const form = await screen.findByRole('dialog', { name: 'Schedule — Monthly cost' });
    await userEvent.click(within(form).getByRole('button', { name: 'Remove schedule' }));
    const confirm = screen.queryByRole('dialog', { name: 'Remove schedule' });
    if (confirm) await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Schedule removed')).toBeTruthy();
    expect(screen.queryByText(/Scheduled; next run/)).toBeNull();
  });
  it('a failed list of sent reports is shown, not hidden', async () => {
    mockPageApi(['payroll.read'], (url) => {
      if (url.endsWith('/api/v1/reports')) return { items: [INFO], today: '2026-11-01', advanced: true };
      if (url.includes('/snapshots')) return problem(500, 'Snapshots failed');
      return { items: [] };
    });
    renderPage(<Reports />, '/reports');
    expect(await screen.findByText('Snapshots failed', {}, { timeout: 3000 })).toBeTruthy();
  });
});
