import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cases } from '../../pages/Cases';
import { mockSession, posted, problem, showPage } from './testkit';

configure({ asyncUtilTimeout: 10000 });
afterEach(() => vi.restoreAllMocks());

const BOTH = ['FEATURE_GRIEVANCE', 'FEATURE_POSH'];
const NONE = { members: [], external: [], warnings: [] };
const CASE = { id: 'c1', kind: 'grievance', reference: 'GR-0001', category: 'pay', status: 'open', anonymous: false, role: 'complainant', version: 3, complainantName: 'A', incidentDate: null, description: 'Pay was short by two days this month.', lateReason: null, outcome: null, receivedAt: '2026-11-01T04:30:00Z', inquiryDue: null, reportDue: null, slaDue: '2026-11-20', closedAt: null, assigneeName: null, allowedMoves: [], events: [] };

describe('Cases', () => {
  it('a failed withdraw keeps the dialog open with the error and the typed reason', async () => {
    mockSession(['cases.self'], BOTH, (url, init) => {
      if (url.includes('/withdraw') && init.method === 'POST') return problem(500, 'Could not withdraw');
      if (url.includes('/cases/committee')) return NONE;
      if (url.includes('/cases/c1')) return CASE;
      return { items: [] };
    });
    showPage(<Cases />, '/cases?case=c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw case' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Sorted out directly');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    expect(await within(dialog).findByText('Could not withdraw')).toBeTruthy();
    expect(within(dialog).getByRole('textbox')).toHaveProperty('value', 'Sorted out directly');
  });

  it('a handler assigned a grievance, without grievance.manage, gets a list that opens by keyboard', async () => {
    mockSession(['cases.self'], ['FEATURE_GRIEVANCE'], (url) => {
      if (url.includes('scope=handling')) return { items: [{ ...CASE, id: 'c2', reference: 'GR-0002', received_at: '2026-11-01T04:30:00Z', complainant_name: 'Ravi', assignee_name: 'A', sla_due: '2026-11-20' }] };
      if (url.includes('/cases/c2')) return { ...CASE, id: 'c2', reference: 'GR-0002', role: 'handler', allowedMoves: ['in_progress'] };
      return { items: [] };
    });
    showPage(<Cases />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Assigned to me' }));
    const open = await screen.findByRole('button', { name: 'GR-0002' });
    open.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: /GR-0002/ })).toBeTruthy();
  });

  it('the respondent picked stays visible, and filing twice posts once', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const f = mockSession(['cases.self'], ['FEATURE_GRIEVANCE'], (url, init) => {
      if (url.includes('/employees')) return { items: [{ id: 'e9', first_name: 'Nina', last_name: 'Das', employee_code: 'E9' }] };
      if (url.endsWith('/api/v1/cases') && init.method === 'POST') return new Promise((r) => { finish = r; });
      return { items: [] };
    });
    showPage(<Cases />);
    await userEvent.click(await screen.findByRole('button', { name: 'Raise a grievance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Raise a grievance' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /What happened/ }), 'Facts of the matter, in twenty or more characters.');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Person involved/ }));
    await userEvent.click(await within(dialog).findByRole('option', { name: /Nina Das/ }));
    expect(within(dialog).getByText('Nina Das')).toBeTruthy();
    const submit = within(dialog).getByRole('button', { name: 'Submit' });
    await userEvent.click(submit);
    await userEvent.click(submit);
    expect(posted(f, '/api/v1/cases')).toHaveLength(1);
    expect(JSON.parse((posted(f, '/api/v1/cases')[0]![1] as RequestInit).body as string).respondentEmployeeId).toBe('e9');
    finish({ id: 'c1', reference: 'GR-0001' });
  });

  it('a failed annual report says so, and the committee does not read as loading', async () => {
    mockSession(['cases.self', 'posh.admin'], ['FEATURE_POSH'], (url) => {
      if (url.includes('/annual-report')) return problem(500, 'Report failed');
      if (url.includes('/cases/committee')) return { members: [{ user_id: 'u2', display_name: 'Priya', role: 'presiding_officer' }], external: [], warnings: ['No external member'] };
      return { items: [] };
    });
    showPage(<Cases />, '/cases?tab=committee');
    expect(await screen.findByText(/Priya/)).toBeTruthy();
    expect(await screen.findByText('Report failed')).toBeTruthy();
  });

  it('with POSH off the page asks nothing of it and does not mention it', async () => {
    const f = mockSession(['cases.self'], ['FEATURE_GRIEVANCE'], () => ({ items: [] }));
    showPage(<Cases />);
    await screen.findByRole('button', { name: 'Raise a grievance' });
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('kind=grievance'))).toBe(true));
    expect(f.mock.calls.some(([u]) => /posh|committee/.test(String(u)))).toBe(false);
    expect(document.body.textContent).not.toMatch(/POSH|Internal Committee/);
  });
});
