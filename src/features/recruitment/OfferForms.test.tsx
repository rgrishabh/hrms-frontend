import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { mockPageApi, renderPage } from '../../test/page';
import { OfferForm } from './OfferForms';

afterEach(() => vi.restoreAllMocks());

it('what someone typed survives the requisition arriving late', async () => {
  let arrive: (v: unknown) => void = () => undefined;
  const late = new Promise((r) => { arrive = r; });
  mockPageApi(['recruitment.manage', 'recruitment.compensation'], (url) => {
    if (url.endsWith('/org')) return { legalEntities: [{ id: 'l1', name: 'Co' }], branches: [{ id: 'b1', name: 'Pune', legal_entity_id: 'l1' }], departments: [] };
    if (url.includes('/requisitions/')) return late;
    return {};
  });
  renderPage(<OfferForm applicationId="a1" requisitionId="r1" onClose={() => undefined} />);
  const designation = await screen.findByRole('textbox', { name: /Designation/ });
  await userEvent.type(designation, 'Analytical Chemist');
  await act(async () => { arrive({ designation: 'From the requisition', legal_entity_id: 'l1', branch_id: 'b1', department_id: null, employment_type: 'permanent' }); await late; });
  await waitFor(() => expect((screen.getByRole('combobox', { name: /Branch/ }) as HTMLSelectElement).value).toBe('b1'));
  expect((designation as HTMLInputElement).value).toBe('Analytical Chemist');
});
