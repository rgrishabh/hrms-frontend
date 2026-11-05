import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, renderPage, writes } from '../../test/page';
import { Payroll } from '../../pages/Payroll';

afterEach(() => vi.restoreAllMocks());

const HIDDEN = { uan: null, pf_member_id: null, pf_excluded: false, esi_ip_number: null, pan: null, tax_regime: 'new', pt_state: null, masked: true, maskedFields: ['uan', 'pf_member_id', 'esi_ip_number', 'pan'] };
const SHOWN = { uan: '100000000001', pf_member_id: 'PF1', pf_excluded: false, esi_ip_number: '1000000001', pan: 'XXXXXX234F', tax_regime: 'new', pt_state: null };

it('statutory details cannot be edited from masked values, and a save from revealed ones keeps them', async () => {
  const f = mockPageApi(['payroll.read', 'payroll.manage'], ['FEATURE_PAYROLL', 'FEATURE_PAYROLL_STATUTORY'], (url) => {
    if (url.includes('/statutory')) return url.includes('reveal=1') ? SHOWN : HIDDEN;
    if (url.includes('/salaries')) return { items: [] };
    if (url.includes('/employees?') || url.includes('/employees')) return { items: [{ id: 'e9', employee_code: 'E9', first_name: 'Rohan', last_name: 'Iyer' }], page: 1, pageSize: 20, total: 1 };
    return { items: [] };
  });
  renderPage(<Payroll />, '/payroll?tab=salaries');
  await userEvent.type(await screen.findByRole('combobox', { name: /Employee/ }), 'Ro');
  await userEvent.click(await screen.findByRole('option', { name: /Rohan/ }));
  const card = (await screen.findByRole('heading', { name: 'Statutory details' })).closest('section, div[class*=card]') as HTMLElement;
  const edit = await within(card).findByRole('button', { name: 'Edit' });
  expect((edit as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(within(card).getByRole('button', { name: 'Show details' }));
  await waitFor(() => expect((within(card).getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: /Statutory details/ });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes(f, '/statutory')).toHaveLength(1));
  expect(bodyOf(writes(f, '/statutory')[0]!)).toMatchObject({ uan: '100000000001', pfMemberId: 'PF1', esiIpNumber: '1000000001' });
});
