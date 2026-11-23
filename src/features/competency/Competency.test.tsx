import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Competency } from '../../pages/Competency';
import { mockSession, posted, problem, showPage } from '../cases/testkit';

afterEach(() => { vi.restoreAllMocks(); window.__testViewportWidth = undefined; });

const LAB = ['FEATURE_TRAINING', 'FEATURE_LAB_COMPETENCY'];
const RECORD = { id: 't1', employee_id: 'e2', employee_code: 'E2', employee_name: 'Ravi', course_code: 'SAFE', course_name: 'Safety', completed_on: '2026-01-01', expires_on: null, validity: 'valid', status: 'active', trainer: null, provider: null };
const AUTH = { id: 'a1', employee_id: 'e2', employee_name: 'Ravi', employee_code: 'E2', method_id: 'm1', method_code: 'M-1', method_name: 'Assay', activity: 'perform', status: 'pending', valid_from: null, review_due: null, missing_training: 0, requested_by: 'u1' };

describe('Competency', () => {
  it('training only: no laboratory wording anywhere, and no lab endpoint is called', async () => {
    const f = mockSession(['competency.self', 'training.manage'], ['FEATURE_TRAINING'], (url) => (url.includes('/me') ? { authorizations: [], training: [] } : { items: [], page: 1, pageSize: 25, total: 0 }));
    showPage(<Competency />);
    await screen.findByRole('tab', { name: 'My training' });
    for (const tab of screen.getAllByRole('tab')) await userEvent.click(tab);
    await screen.findByRole('button', { name: 'New course' });
    expect(document.body.textContent).not.toMatch(/laborator|competenc|quality|\bmethods?\b|instrument|\blab\b/i);
    expect(f.mock.calls.some(([u]) => /methods|matrix|authorizations|assessments/.test(String(u)))).toBe(false);
  });

  it('the tab is in the URL', async () => {
    mockSession(['competency.self', 'training.manage'], ['FEATURE_TRAINING'], (url) => (url.includes('/me') ? { authorizations: [], training: [] } : { items: [RECORD], page: 1, pageSize: 25, total: 1 }));
    showPage(<Competency />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Training records' }));
    expect(screen.getByTestId('where').textContent).toContain('tab=training');
  });

  it('revoke asks in a dialog that stays open on failure, never window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('x');
    mockSession(['training.manage'], ['FEATURE_TRAINING'], (url, init) => {
      if (url.includes('/revoke') && init.method === 'POST') return problem(500, 'Could not revoke');
      return { items: [RECORD], page: 1, pageSize: 25, total: 1 };
    });
    showPage(<Competency />, '/competency?tab=training');
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(prompt).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Revoke training record' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Recorded by mistake');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke record' }));
    expect(await within(dialog).findByText('Could not revoke')).toBeTruthy();
    expect(within(dialog).getByRole('textbox')).toHaveProperty('value', 'Recorded by mistake');
  });

  it('the person who asked can cancel a pending authorization', async () => {
    const f = mockSession(['competency.read', 'competency.assess'], LAB, (url, init) => {
      if (url.endsWith('/authorizations/a1/cancel') && init.method === 'POST') return { ok: true };
      if (url.includes('/authorizations/a1')) return { ...AUTH, events: [], assessment: null, check: null };
      return { items: [AUTH], page: 1, pageSize: 25, total: 1 };
    });
    showPage(<Competency />, '/competency?tab=authorizations');
    await userEvent.click(await screen.findByRole('button', { name: 'Ravi' }));
    const detail = await screen.findByRole('dialog', { name: 'Technical authorization' });
    await userEvent.click(await within(detail).findByRole('button', { name: 'Cancel request' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancel authorization request' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel request' }));
    expect(await screen.findByText('Request cancelled')).toBeTruthy();
    expect(posted(f, '/authorizations/a1/cancel')).toHaveLength(1);
  });

  it('someone else cannot see Cancel request', async () => {
    mockSession(['competency.read', 'competency.assess'], LAB, (url) => {
      if (url.includes('/authorizations/a1')) return { ...AUTH, requested_by: 'u9', events: [], assessment: null, check: null };
      return { items: [AUTH], page: 1, pageSize: 25, total: 1 };
    });
    showPage(<Competency />, '/competency?tab=authorizations');
    await userEvent.click(await screen.findByRole('button', { name: 'Ravi' }));
    const detail = await screen.findByRole('dialog', { name: 'Technical authorization' });
    await within(detail).findByText('Assay');
    expect(within(detail).queryByRole('button', { name: 'Cancel request' })).toBeNull();
  });

  it('the matrix is a list per person on a phone, with no table', async () => {
    window.__testViewportWidth = 360;
    mockSession(['competency.read'], LAB, (url) => {
      if (url.includes('/matrix')) return { methods: [{ id: 'm1', code: 'M-1', name: 'Assay', discipline: 'Chem' }, { id: 'm2', code: 'M-2', name: 'Unused', discipline: 'Chem' }], rows: [{ employeeId: 'e2', employeeCode: 'E2', name: 'Ravi', cells: { m1: { perform: { status: 'authorized', reviewDue: '2027-01-01', inForce: true } } } }] };
      return { items: [] };
    });
    showPage(<Competency />, '/competency?tab=matrix');
    const list = await screen.findByRole('list', { name: 'Competence matrix' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(list).getByText(/M-1/)).toBeTruthy();
    expect(within(list).queryByText(/M-2/)).toBeNull();
    expect(within(list).getByText(/Perform test: in force/)).toBeTruthy();
  });
});
