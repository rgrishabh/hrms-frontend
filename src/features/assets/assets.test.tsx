import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Assets } from '../../pages/Assets';
import { mockPageApi, problem, showPage } from '../../test/page';

const ASSET = { id: 'a1', tag: 'IT-05', name: 'Laptop', category: 'it', serial_number: 'S1', status: 'available', calibration_due: null, branch_id: null, branch_name: null, holder_id: null, holder_name: null, issued_at: null, due_back: null, acknowledged_at: null, purchase_date: null, notes: null };
const list = { items: [ASSET], page: 1, pageSize: 25, total: 1, today: '2026-03-02' };

afterEach(() => vi.restoreAllMocks());

describe('Assets', () => {
  it('a failed branch list is shown in the form, not silently left empty', async () => {
    mockPageApi(['assets.manage'], ['FEATURE_ASSET_MANAGEMENT'], (url) => (url.endsWith('/org') ? problem(500, 'Branches are down') : list));
    showPage(<Assets />, '/assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Add asset' }));
    const dlg = await screen.findByRole('dialog', { name: 'Add asset' });
    expect(await within(dlg).findByText(/Branches are down/)).toBeTruthy();
  });

  it('says nothing lab-specific unless the lab flag is on', async () => {
    mockPageApi(['assets.manage'], ['FEATURE_ASSET_MANAGEMENT'], (url) => (url.endsWith('/org') ? { branches: [], legalEntities: [], departments: [] } : list));
    showPage(<Assets />, '/assets');
    await screen.findByText('IT-05');
    await userEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/calibration|laborator|lab instrument|pH meter/i);
    expect(document.body.innerHTML).not.toMatch(/pH meter|INS-PH/);
  });

  it('keeps the calibration wording when the lab flag is on', async () => {
    mockPageApi(['assets.manage'], ['FEATURE_ASSET_MANAGEMENT', 'FEATURE_LAB_COMPETENCY'], () => list);
    showPage(<Assets />, '/assets');
    await screen.findByText('IT-05');
    expect(document.body.textContent).toMatch(/Calibration/);
  });

  it('a tab survives a reload through the URL', async () => {
    mockPageApi(['assets.manage', 'assets.self'], ['FEATURE_ASSET_MANAGEMENT'], (url) => (url.includes('/mine') ? { items: [] } : list));
    showPage(<Assets />, '/assets?tab=register');
    expect((await screen.findByRole('tab', { name: 'Asset register' })).getAttribute('aria-selected')).toBe('true');
  });
});
