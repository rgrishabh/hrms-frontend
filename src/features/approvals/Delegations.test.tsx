import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { Delegations } from './Delegations';

afterEach(() => vi.restoreAllMocks());

const D = { id: 'd1', delegator_id: 'e1', delegator_name: 'Asha Rao', delegate_id: 'e2', delegate_name: 'Bo Das', starts_on: '2026-11-10', ends_on: '2026-11-14', note: null, state: 'active', set_up_by_hr: false, created_by_name: 'Asha Rao' };
const api = (mine: { given?: unknown[]; received?: unknown[] }, all: unknown[] = [], extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  if (init.method && init.method !== 'GET') return { ok: true };
  if (url.includes('/delegates')) return { items: [{ id: 'e2', name: 'Bo Das', code: 'E2', designation: 'Lead' }, { id: 'e3', name: 'Cy Roy', code: null, designation: null }] };
  if (url.includes('scope=all')) return { items: all };
  return { given: [], received: [], ...mine };
};
const pick = async (dlg: HTMLElement, label: RegExp, text: string, option: RegExp) => {
  await userEvent.type(within(dlg).getByRole('combobox', { name: label }), text);
  await userEvent.click(await within(dlg).findByRole('option', { name: option }));
};

describe('my handover', () => {
  it('with nothing handed over, explains and offers it; HR sections stay away', async () => {
    const f = mockPageApi([], api({}));
    renderPage(<Delegations />);
    expect(await screen.findByText(/Going on leave or travelling/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hand over my approvals' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'All handovers' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'I approve for' })).toBeNull();
    expect(reads(f, 'scope=all')).toHaveLength(0);
  });
  it('an active handover names the colleague and the days, and ending it asks first', async () => {
    const f = mockPageApi([], api({ given: [{ ...D, note: 'Back Monday' }, { ...D, id: 'd0', state: 'ended' }] }));
    renderPage(<Delegations />);
    const card = within(await screen.findByRole('region', { name: 'My handover' }));
    expect(card.getByText('Back Monday')).toBeTruthy();
    expect(card.getByText(/^Handed/).textContent).toMatch(/Handed to Bo Das for .* – /);
    expect(card.queryByRole('button', { name: 'Hand over my approvals' })).toBeNull();
    expect(card.getAllByRole('button', { name: 'End now' })).toHaveLength(1);
    await userEvent.click(card.getByRole('button', { name: 'End now' }));
    const dlg = await screen.findByRole('dialog', { name: 'End this handover now' });
    expect(within(dlg).getByText(/Requests waiting go back to Asha Rao/)).toBeTruthy();
    expect(writes(f, '/revoke')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(writes(f, '/api/v1/approvals/delegations/d1/revoke')).toHaveLength(1));
    expect(await screen.findByText('Handover ended')).toBeTruthy();
  });
  it('a scheduled single day reads as future and is cancelled, not ended', async () => {
    mockPageApi([], api({ given: [{ ...D, state: 'scheduled', ends_on: D.starts_on }] }));
    renderPage(<Delegations />);
    const card = within(await screen.findByRole('region', { name: 'My handover' }));
    expect(card.getByText(/^Will be handed/).textContent).not.toContain('–');
    await userEvent.click(card.getByRole('button', { name: 'End now' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel this handover' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a refused end stays in the dialog with the reason', async () => {
    mockPageApi([], api({ given: [D] }, [], (url, init) => (init.method === 'POST' ? problem(409, 'Already ended') : undefined)));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'End now' }));
    const dlg = await screen.findByRole('dialog', { name: 'End this handover now' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'End now' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('Already ended');
  });
});

describe('handing over', () => {
  it('needs a colleague, then posts the days and trimmed note, without a delegator for oneself', async () => {
    const f = mockPageApi([], api({}));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over my approvals' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hand over my approvals' });
    expect(within(dlg).queryByRole('combobox', { name: /Whose approvals/ })).toBeNull();
    const submit = within(dlg).getByRole('button', { name: 'Hand over' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await pick(dlg, /Approves instead/, 'bo', /Bo Das.*Lead · E2/);
    expect(reads(f, '/api/v1/approvals/delegates?q=bo').length).toBeGreaterThan(0);
    await userEvent.type(within(dlg).getByLabelText(/Note for them/), '  Back Monday ');
    const first = within(dlg).getByLabelText(/First day/) as HTMLInputElement;
    const last = within(dlg).getByLabelText(/Last day/) as HTMLInputElement;
    await userEvent.clear(last);
    await userEvent.type(last, first.value);
    await userEvent.click(submit);
    await waitFor(() => expect(writes(f, '/api/v1/approvals/delegations')).toHaveLength(1));
    expect(bodyOf(writes(f, '/delegations')[0]!)).toEqual({ delegateId: 'e2', startsOn: first.value, endsOn: first.value, note: 'Back Monday' });
    expect(await screen.findByText('Approvals handed to Bo Das')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('moving the first day past the last pulls the last day along', async () => {
    mockPageApi([], api({}));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over my approvals' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hand over my approvals' });
    const first = within(dlg).getByLabelText(/First day/);
    await userEvent.clear(first);
    await userEvent.type(first, '2099-03-20');
    expect((within(dlg).getByLabelText(/Last day/) as HTMLInputElement).value).toBe('2099-03-20');
  });
  it('clearing the first day keeps the form on screen, and it waits for a date', async () => {
    const f = mockPageApi([], api({}));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over my approvals' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hand over my approvals' });
    await pick(dlg, /Approves instead/, 'bo', /Bo Das/);
    await userEvent.clear(within(dlg).getByLabelText(/First day/));
    expect(screen.getByRole('dialog', { name: 'Hand over my approvals' })).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Hand over' }));
    expect(writes(f, '/api/v1/approvals/delegations')).toHaveLength(0);
  });
  it('a refused handover stays open with the reason and the choice', async () => {
    mockPageApi([], api({}, [], (url, init) => (init.method === 'POST' ? problem(409, 'They are on leave too') : undefined)));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over my approvals' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hand over my approvals' });
    await pick(dlg, /Approves instead/, 'cy', /Cy Roy/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Hand over' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('They are on leave too');
    expect(within(dlg).getByText('Cy Roy')).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('covering for someone', () => {
  it('an active cover is announced, and declining asks first', async () => {
    const f = mockPageApi([], api({ received: [D, { ...D, id: 'd9', state: 'scheduled', delegator_name: 'Cy Roy' }] }));
    renderPage(<Delegations />);
    const notice = await screen.findByText(/You approve for/);
    expect(notice.textContent).toContain('Asha Rao');
    expect(screen.queryByText(/You approve for.*Cy Roy/)).toBeNull();
    const card = within(screen.getByRole('region', { name: 'I approve for' }));
    await userEvent.click(card.getAllByRole('button', { name: 'Decline' })[0]!);
    const dlg = await screen.findByRole('dialog', { name: 'Stop approving for Asha Rao' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Stop approving' }));
    await waitFor(() => expect(writes(f, '/delegations/d1/revoke')).toHaveLength(1));
  });
});

describe('HR view', () => {
  it('lists everyone with who set it up, and ends one', async () => {
    const f = mockPageApi(['approvals.delegations'], api({}, [{ ...D, set_up_by_hr: true, created_by_name: 'Kavita' }]));
    renderPage(<Delegations />);
    const table = within(await screen.findByRole('table', { name: 'All handovers' }));
    expect(table.getByText('Asha Rao')).toBeTruthy();
    expect(table.getByText('Bo Das')).toBeTruthy();
    expect(table.getByText('Set up by Kavita')).toBeTruthy();
    expect(reads(f, '/api/v1/approvals/delegations?scope=all').length).toBeGreaterThan(0);
    await userEvent.click(table.getByRole('button', { name: 'End now' }));
    await screen.findByRole('dialog', { name: "End Asha Rao's handover now" });
  });
  it('says when there are none', async () => {
    mockPageApi(['approvals.delegations'], api({}));
    renderPage(<Delegations />);
    expect(await screen.findByText('No handovers in the last 30 days.')).toBeTruthy();
  });
  it('handing over for someone needs both people and sends the delegator', async () => {
    const f = mockPageApi(['approvals.delegations'], api({}));
    renderPage(<Delegations />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over for someone' }));
    const dlg = await screen.findByRole('dialog', { name: 'Hand over approvals for someone' });
    const submit = within(dlg).getByRole('button', { name: 'Hand over' }) as HTMLButtonElement;
    await pick(dlg, /Approves instead/, 'bo', /Bo Das/);
    expect(submit.disabled).toBe(true);
    await pick(dlg, /Whose approvals/, 'cy', /Cy Roy/);
    expect(submit.disabled).toBe(false);
    await userEvent.click(submit);
    await waitFor(() => expect(writes(f, '/api/v1/approvals/delegations')).toHaveLength(1));
    expect(bodyOf(writes(f, '/delegations')[0]!)).toMatchObject({ delegateId: 'e2', delegatorId: 'e3' });
  });
});
