import { useState } from 'react';
import { Trash2, Users } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Picker } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StatGrid, StatTile } from '../../components/StatTile';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { searchPeople } from './searchPeople';
import { CASES_URL, type AnnualReport, type CommitteeData, type CommitteeMember } from './types';

const ROLE_OPTIONS = [{ value: 'presiding_officer', label: 'Presiding officer' }, { value: 'member', label: 'Member' }];

export function Committee({ onCommittee }: { onCommittee: boolean }) {
  const { can } = useAuth();
  const query = useApiQuery<CommitteeData>(`${CASES_URL}/committee`);
  const [editing, setEditing] = useState(false);
  const mayReport = onCommittee || can('posh.admin');
  return (
    <div className="stack-4">
      <Card title="Internal Committee" actions={can('posh.admin') && query.data && <Button size="sm" onClick={() => setEditing(true)}>Edit membership</Button>}>
        <QueryState query={query} isEmpty={(d) => !d.members.length && !d.external.length} empty={<EmptyState compact icon={<Users />} title="No committee has been set up" description={can('posh.admin') ? undefined : 'Contact HR.'} action={can('posh.admin') ? <Button onClick={() => setEditing(true)}>Set up the committee</Button> : undefined} />}>
          {(d) => (
            <div className="stack-3">
              {d.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
              <ul className="list-plain committee-list" aria-label="Committee members">
                {d.members.map((m) => <li key={m.user_id} data-record>{m.display_name}, {m.role === 'presiding_officer' ? 'presiding officer' : 'member'}</li>)}
                {d.external.map((x) => <li key={x.id} data-record>{x.name}, external member ({x.organization})</li>)}
              </ul>
              <p className="text-xs text-2">Under the POSH Act the presiding officer is a senior woman employee, at least half the members are women, and one member is from an NGO or association. Maintaining membership does not give access to complaints.</p>
            </div>
          )}
        </QueryState>
      </Card>
      {mayReport && <AnnualReportCard />}
      {editing && <MembershipForm current={query.data ?? { members: [], external: [], warnings: [] }} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AnnualReportCard() {
  const thisYear = Number(todayLocal().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const query = useApiQuery<AnnualReport>(`${CASES_URL}/posh/annual-report?year=${year}`);
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  return (
    <Card title="Annual report" actions={<Select label="Year" hideLabel value={String(year)} options={years.map((y) => ({ value: String(y), label: String(y) }))} onChange={(e) => setYear(Number(e.target.value))} />}>
      <QueryState query={query} compact loading={<StatGrid>{[1, 2, 3, 4].map((i) => <Skeleton key={i} height="tile" />)}</StatGrid>}>
        {(r) => (
          <StatGrid label={`Complaints in ${r.year}`}>
            <StatTile label="Received" value={r.received} />
            <StatTile label="Disposed" value={r.disposed} />
            <StatTile label="Pending" value={r.pending} />
            <StatTile label="Pending beyond 90 days" value={r.pending_over_90} tone={r.pending_over_90 > 0 ? 'bad' : 'neutral'} />
          </StatGrid>
        )}
      </QueryState>
    </Card>
  );
}

interface EditMember { userId: string; name: string; role: CommitteeMember['role'] }
interface EditExternal { key: number; name: string; organization: string; since: string }

function MembershipForm({ current, onClose }: { current: CommitteeData; onClose: () => void }) {
  const toast = useToast();
  const [members, setMembers] = useState<EditMember[]>(current.members.map((m) => ({ userId: m.user_id, name: m.display_name, role: m.role })));
  const [external, setExternal] = useState<EditExternal[]>(current.external.map((x, key) => ({ key, name: x.name, organization: x.organization, since: x.since })));
  const [nextKey, setNextKey] = useState(current.external.length);
  const setMember = (i: number, m: Partial<EditMember>) => setMembers(members.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const setExt = (key: number, x: Partial<EditExternal>) => setExternal(external.map((e) => (e.key === key ? { ...e, ...x } : e)));
  const { busy, errors, error, submit } = useSubmit(async () => {
    await api.put(`${CASES_URL}/committee`, { members: members.map((m) => ({ userId: m.userId, role: m.role })), external: external.map(({ name, organization, since }) => ({ name, organization, since })) });
    toast('Saved');
    await invalidateApi(`${CASES_URL}/committee`);
    onClose();
  }, { validate: () => (members.filter((m) => m.role === 'presiding_officer').length === 1 ? {} as Record<string, string> : { members: 'Choose exactly one presiding officer' }) });
  return (
    <Modal title="Internal Committee membership" size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={submit}>
        <fieldset className="table-toolbar__group">
          <legend>Members</legend>
          {members.map((m, i) => (
            <div key={m.userId} className="committee-row">
              <span className="committee-row__name">{m.name}</span>
              <Select label={`Role of ${m.name}`} hideLabel value={m.role} options={ROLE_OPTIONS} onChange={(e) => setMember(i, { role: e.target.value as EditMember['role'] })} />
              <Button variant="ghost" iconOnly aria-label={`Remove ${m.name}`} icon={<Trash2 aria-hidden="true" />} onClick={() => setMembers(members.filter((_, j) => j !== i))} />
            </div>
          ))}
          {errors['members'] && <span className="field__error" role="alert">{errors['members']}</span>}
          <Picker label="Add a member" placeholder="Search people" queryKey={`case-people:${members.map((m) => m.userId).join()}`} search={async (t) => (await searchPeople(t)).filter((u) => !members.some((m) => m.userId === u.id))} value={null} onChange={(u) => { if (u) setMembers([...members, { userId: u.id, name: u.label, role: 'member' }]); }} />
        </fieldset>
        <fieldset className="table-toolbar__group">
          <legend>External members</legend>
          {external.map((x, i) => (
            <div key={x.key} className="committee-row">
              <Input fieldClassName="committee-row__field" label={`External member ${i + 1}: name`} required minLength={2} maxLength={120} value={x.name} onChange={(e) => setExt(x.key, { name: e.target.value })} />
              <Input fieldClassName="committee-row__field" label="NGO or association" required minLength={2} maxLength={200} value={x.organization} onChange={(e) => setExt(x.key, { organization: e.target.value })} />
              <DatePicker fieldClassName="committee-row__field" label="Since" required value={x.since} onChange={(e) => setExt(x.key, { since: e.target.value })} />
              <Button variant="ghost" iconOnly aria-label={`Remove external member ${i + 1}`} icon={<Trash2 aria-hidden="true" />} onClick={() => setExternal(external.filter((e) => e.key !== x.key))} />
            </div>
          ))}
          {external.length < 5 && <div><Button onClick={() => { setExternal([...external, { key: nextKey, name: '', organization: '', since: todayLocal() }]); setNextKey(nextKey + 1); }}>Add external member</Button></div>}
        </fieldset>
        <FormActions error={error} busy={busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
