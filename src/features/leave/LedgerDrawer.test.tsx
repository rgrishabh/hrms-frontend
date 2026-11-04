import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPageApi, renderPage } from '../../test/pageHarness';
import { LedgerDrawer } from './LedgerDrawer';
import type { LeaveBalance } from './types';

afterEach(() => vi.restoreAllMocks());

describe('leave balance history', () => {
  it('names a carry out in words, for the leave year asked for', async () => {
    const f = mockPageApi(['leave.self'], () => ({ items: [{ id: 'g1', entry_type: 'carry_out', days: -2.5, note: null, created_at: '2026-04-01T04:00:00Z', created_by_name: null }] }));
    renderPage(<LedgerDrawer employeeId="e1" leaveYear={2026} types={[{ id: 'cl', name: 'Casual', requires_balance: true } as LeaveBalance]} onClose={() => undefined} />);
    expect(await screen.findByText('Carried out to next year')).toBeTruthy();
    expect(screen.getByText('-2.5')).toBeTruthy();
    expect(f.mock.calls.some(([u]) => String(u).includes('/leave/ledger?employeeId=e1&leaveTypeId=cl&year=2026'))).toBe(true);
  });
});
