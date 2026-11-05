import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyProfile } from '../../pages/PersonalDetails';
import { bodyOf, mockPageApi, problem, reads, renderPage, writes } from '../../test/page';
import { PersonalDetails, ProfileChangeView } from './PersonalDetails';

// The default one-second wait is too short when the machine is busy.
configure({ asyncUtilTimeout: 15000 });

afterEach(() => vi.restoreAllMocks());

const CONTACT = { name: 'Meera', relationship: 'Sister', phone: '98200', altPhone: null };
const EMPTY = { contacts: [], addresses: [], nominees: [], education: [], experience: [] };
const DIRECT = { contacts: 'direct', addresses: 'direct', nominees: 'approval', education: 'approval', experience: 'approval' };
const profile = (over = {}) => ({ missing: [], sections: EMPTY, edit: DIRECT, pending: [], ...over });
const api = (data: unknown, extra: (url: string, init: RequestInit) => unknown = () => undefined) => (url: string, init: RequestInit) => {
  const x = extra(url, init);
  if (x !== undefined) return x;
  return init.method && init.method !== 'GET' ? { applied: true } : data;
};
const section = (name: string) => screen.findByRole('region', { name });
const entry = (dlg: HTMLElement, name: string) => within(within(dlg).getByRole('region', { name }));
const show = () => renderPage(<PersonalDetails employeeId="e2" />);

describe('reading personal details', () => {
  it('summarises each section, with optional parts only when present, and what is still missing', async () => {
    mockPageApi(['employees.read'], api(profile({
      missing: ['nominees', 'education'],
      edit: { contacts: null, addresses: null, nominees: null, education: null, experience: null },
      sections: {
        contacts: [CONTACT, { ...CONTACT, name: 'Ravi', altPhone: '98300' }],
        addresses: [{ kind: 'current', line1: '1 High St', line2: null, city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' }, { kind: 'permanent', line1: '2 Low St', line2: 'Flat 3', city: 'Dubai', state: 'DU', postalCode: '1', country: 'UAE' }],
        nominees: [{ purpose: 'pf', name: 'Asha', relationship: 'Mother', sharePercent: 60, dateOfBirth: '1960-05-01', guardianName: 'Ravi' }, { purpose: 'odd', name: 'Bo', relationship: 'Son', sharePercent: 40, dateOfBirth: null, guardianName: null }],
        education: [{ level: 'graduate', qualification: 'BSc', institution: 'COEP', university: 'Pune', yearOfPassing: 2010, score: '8.1' }, { level: 'other', qualification: 'MA', institution: 'IIT', university: null, yearOfPassing: null, score: null }],
        experience: [{ employer: 'Beta', designation: 'Analyst', fromDate: '2015-01-01', toDate: '2016-01-01', reasonForLeaving: 'Moved' }, { employer: 'Gamma', designation: 'Lead', fromDate: '2016-01-02', toDate: '2017-01-01', reasonForLeaving: null }],
      },
    })));
    show();
    expect(await screen.findByText('Still to fill in: nominees, education.')).toBeTruthy();
    expect(screen.getByText('Meera (Sister) · 98200')).toBeTruthy();
    expect(screen.getByText('Ravi (Sister) · 98200 · 98300')).toBeTruthy();
    expect(screen.getByText('Current: 1 High St, Pune, MH 411001')).toBeTruthy();
    expect(screen.getByText('Permanent: 2 Low St, Flat 3, Dubai, DU 1, UAE')).toBeTruthy();
    expect(screen.getByText(/^Provident fund: Asha \(Mother\) · 60% · born .* · guardian Ravi$/)).toBeTruthy();
    expect(screen.getByText('odd: Bo (Son) · 40%')).toBeTruthy();
    expect(screen.getByText('BSc, COEP, Pune (2010) · 8.1')).toBeTruthy();
    expect(screen.getByText('MA, IIT')).toBeTruthy();
    expect(screen.getByText(/^Analyst, Beta · .* – .* · Moved$/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });
  it('an empty section says so and offers Add', async () => {
    mockPageApi(['employees.read'], api(profile()));
    show();
    const s = within(await section('Emergency contacts'));
    expect(s.getByText('No emergency contact yet.')).toBeTruthy();
    expect(s.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
  it('a pending change shows what is proposed, blocks editing and can be withdrawn after asking', async () => {
    const pending = [{ id: 'c1', section: 'nominees', created_at: '2026-10-01T04:30:00Z', requested_by_name: 'Asha', items: [{ purpose: 'gratuity', name: 'Bo', relationship: 'Son', sharePercent: 100 }], note: 'New baby' }];
    const f = mockPageApi(['employees.read'], api(profile({ pending })));
    show();
    const s = within(await section('Nominees'));
    expect(s.getByText('Change awaiting HR approval')).toBeTruthy();
    expect(s.getByText('Gratuity: Bo (Son) · 100%')).toBeTruthy();
    expect(s.getByText('“New baby”')).toBeTruthy();
    expect(s.queryByRole('button', { name: 'Add' })).toBeNull();
    await userEvent.click(s.getByRole('button', { name: 'Withdraw' }));
    const dlg = await screen.findByRole('dialog', { name: 'Withdraw change' });
    expect(writes(f, '/withdraw')).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(writes(f, '/api/v1/employees/profile-changes/c1/withdraw')).toHaveLength(1));
    expect(await screen.findByText('Change withdrawn')).toBeTruthy();
  });
  it('a pending removal says so, and HR who edit directly get no Withdraw', async () => {
    mockPageApi(['employees.read'], api(profile({ pending: [{ id: 'c1', section: 'contacts', created_at: '2026-10-01T04:30:00Z', requested_by_name: 'Asha', items: [], note: null }] })));
    show();
    const s = within(await section('Emergency contacts'));
    expect(s.getByText('Remove all entries.')).toBeTruthy();
    expect(s.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
  it('a failed load shows the reason', async () => {
    mockPageApi(['employees.read'], () => problem(500, 'Profile service is down'));
    show();
    expect((await screen.findByRole('alert')).textContent).toContain('Profile service is down');
  });
});

describe('editing personal details', () => {
  it('direct contacts: edits, reorders, removes and sends trimmed values with null for blanks', async () => {
    const f = mockPageApi(['employees.read'], api(profile({ sections: { ...EMPTY, contacts: [CONTACT, { ...CONTACT, name: 'Ravi', phone: '98300' }] } })));
    show();
    await userEvent.click(within(await section('Emergency contacts')).getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit emergency contacts' });
    expect(within(dlg).getByText('Contact 1 (call first)')).toBeTruthy();
    expect(within(dlg).queryByRole('textbox', { name: /Note for HR/ })).toBeNull();
    await userEvent.click(entry(dlg, 'Emergency contacts entry 2').getByRole('button', { name: 'Move up' }));
    expect((entry(dlg, 'Emergency contacts entry 1').getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ravi');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add entry' }));
    const third = entry(dlg, 'Emergency contacts entry 3');
    await userEvent.type(third.getByLabelText(/^Name/), ' Zed ');
    await userEvent.type(third.getByLabelText(/^Relationship/), 'Friend');
    await userEvent.type(third.getByLabelText(/^Phone/), '555');
    await userEvent.click(entry(dlg, 'Emergency contacts entry 2').getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/api/v1/employees/e2/profile/contacts')).toHaveLength(1));
    expect(bodyOf(writes(f, '/profile/contacts')[0]!)).toEqual({ items: [{ name: 'Ravi', relationship: 'Sister', phone: '98300', altPhone: null }, { name: 'Zed', relationship: 'Friend', phone: '555', altPhone: null }] });
    expect(await screen.findByText('Emergency contacts saved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('a second address defaults to the kind not yet used', async () => {
    const f = mockPageApi(['employees.read'], api(profile()));
    show();
    await userEvent.click(within(await section('Addresses')).getByRole('button', { name: 'Add' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit addresses' });
    const first = entry(dlg, 'Addresses entry 1');
    expect((first.getByLabelText(/^Address$|^Address \*/) as HTMLSelectElement).value).toBe('current');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add address' }));
    expect((entry(dlg, 'Addresses entry 2').getByLabelText(/^Address$|^Address \*/) as HTMLSelectElement).value).toBe('permanent');
    expect(within(dlg).queryByRole('button', { name: 'Add address' })).toBeNull();
    await userEvent.click(entry(dlg, 'Addresses entry 2').getByRole('button', { name: 'Remove' }));
    await userEvent.selectOptions(first.getByLabelText(/^Address$|^Address \*/), 'permanent');
    await userEvent.type(first.getByLabelText(/Address line 1/), '1 High St');
    await userEvent.type(first.getByLabelText(/^City/), 'Pune');
    await userEvent.type(first.getByLabelText(/^State/), 'MH');
    await userEvent.type(first.getByLabelText(/PIN code/), '411001');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add address' }));
    expect((entry(dlg, 'Addresses entry 2').getByLabelText(/^Address$|^Address \*/) as HTMLSelectElement).value).toBe('current');
    await userEvent.click(entry(dlg, 'Addresses entry 2').getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(f, '/profile/addresses')).toHaveLength(1));
    expect(bodyOf(writes(f, '/profile/addresses')[0]!)['items']).toEqual([{ kind: 'permanent', line1: '1 High St', line2: null, city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' }]);
  });
  it('nominees go for approval with a note and numbers as numbers, and the toast says so', async () => {
    const f = mockPageApi(['employees.read'], api(profile(), (url, init) => (init.method === 'PUT' ? { applied: false } : undefined)));
    show();
    await userEvent.click(within(await section('Nominees')).getByRole('button', { name: 'Add' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit nominees' });
    expect(within(dlg).getByText(/HR checks changes to nominees/)).toBeTruthy();
    const e = entry(dlg, 'Nominees entry 1');
    await userEvent.selectOptions(e.getByLabelText(/^For/), 'insurance');
    await userEvent.type(e.getByLabelText(/^Name/), 'Asha');
    await userEvent.type(e.getByLabelText(/^Relationship/), 'Mother');
    await userEvent.type(e.getByLabelText(/Date of birth/), '1960-05-01');
    const share = e.getByLabelText(/Share %/);
    await userEvent.clear(share);
    await userEvent.type(share, '50.5');
    await userEvent.type(within(dlg).getByLabelText(/Note for HR/), 'Updated');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(writes(f, '/profile/nominees')).toHaveLength(1));
    expect(bodyOf(writes(f, '/profile/nominees')[0]!)).toEqual({ items: [{ purpose: 'insurance', name: 'Asha', relationship: 'Mother', dateOfBirth: '1960-05-01', sharePercent: 50.5, guardianName: null, address: null }], note: 'Updated' });
    expect(await screen.findByText('Nominees sent to HR for approval')).toBeTruthy();
  });
  it('removing every entry sends an empty list; a refusal keeps the dialog open with the reason', async () => {
    let refuse = true;
    const f = mockPageApi(['employees.read'], api(profile({ sections: { ...EMPTY, education: [{ level: 'graduate', qualification: 'BSc', institution: 'COEP', university: null, yearOfPassing: 2010, score: null }] } }), (url, init) => (init.method === 'PUT' && refuse ? problem(409, 'A change is already waiting') : undefined)));
    show();
    await userEvent.click(within(await section('Education')).getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit education' });
    await userEvent.click(entry(dlg, 'Education entry 1').getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send for approval' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('A change is already waiting');
    expect(bodyOf(writes(f, '/profile/education')[0]!)['items']).toEqual([]);
    refuse = false;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(writes(f, '/profile/education')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('previous employment keeps dates and takes a cancel without saving', async () => {
    const f = mockPageApi(['employees.read'], api(profile({ sections: { ...EMPTY, experience: [{ employer: 'Beta', designation: 'Analyst', fromDate: '2015-01-01', toDate: '2016-01-01', reasonForLeaving: null }] } })));
    show();
    await userEvent.click(within(await section('Previous employment')).getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit previous employment' });
    expect((entry(dlg, 'Previous employment entry 1').getByLabelText(/^From/) as HTMLInputElement).value).toBe('2015-01-01');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(f, '/profile/experience')).toHaveLength(0);
  });
});

describe('proposed change for an approver', () => {
  it('shows the proposal beside what is recorded, and None when one side is empty', async () => {
    const f = mockPageApi(['profile.approve'], () => ({ section: 'contacts', items: [CONTACT], current: [], note: 'Moved' }));
    renderPage(<ProfileChangeView changeId="c1" />);
    expect(await screen.findByText('Proposed emergency contacts')).toBeTruthy();
    expect(screen.getByText('Meera (Sister) · 98200')).toBeTruthy();
    expect(screen.getByText('“Moved”')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
    expect(reads(f, '/api/v1/employees/profile-changes/c1')).toHaveLength(1);
  });
});

describe('my profile', () => {
  it('shows my own details with a link to my record', async () => {
    const f = mockPageApi([], api(profile()), {}, 'e5');
    renderPage(<MyProfile />);
    expect((await screen.findByRole('link', { name: 'your employee record' })).getAttribute('href')).toBe('/employees/e5');
    await section('Nominees');
    expect(reads(f, '/api/v1/employees/e5/profile')).toHaveLength(1);
  });
  it('an account with no employee record is told so and asks for nothing', async () => {
    const f = mockPageApi([], api(profile()), {}, null);
    renderPage(<MyProfile />);
    expect(await screen.findByText('Your account is not linked to an employee record.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(reads(f, '/profile')).toHaveLength(0);
  });
});
