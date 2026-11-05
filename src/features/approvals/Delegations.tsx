import { useState, type FormEvent } from 'react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Picker, type PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { addDays, fmtDate, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';

interface Delegation {
  id: string; delegator_id: string; delegator_name: string; delegate_id: string; delegate_name: string; starts_on: string; ends_on: string;
  note: string | null; state: 'scheduled' | 'active' | 'ended' | 'revoked'; set_up_by_hr: boolean; created_by_name: string;
}

const period = (d: Pick<Delegation, 'starts_on' | 'ends_on'>) => (d.starts_on === d.ends_on ? fmtDate(d.starts_on) : `${fmtDate(d.starts_on)} – ${fmtDate(d.ends_on)}`);
const isOpen = (d: Delegation) => d.state === 'active' || d.state === 'scheduled';

export async function searchDelegates(text: string): Promise<PickerItem[]> {
  const r = await api.get<{ items: { id: string; name: string; code: string | null; designation: string | null }[] }>(`/api/v1/approvals/delegates${qs({ q: text })}`);
  return r.items.map((x) => ({ id: x.id, label: x.name, description: [x.designation, x.code].filter(Boolean).join(' · ') }));
}

function HandOver({ onBehalf, onClose, onDone }: { onBehalf: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = todayLocal();
  const [delegator, setDelegator] = useState<PickerItem | null>(null);
  const [delegate, setDelegate] = useState<PickerItem | null>(null);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDays(today, 4));
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!delegate) return;
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/v1/approvals/delegations', { delegateId: delegate.id, startsOn, endsOn, note: note.trim() || undefined, delegatorId: onBehalf ? delegator?.id : undefined });
      toast(`Approvals handed to ${delegate.label}`);
      onDone();
      onClose();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Modal title={onBehalf ? 'Hand over approvals for someone' : 'Hand over my approvals'} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <p className="text-2 text-sm">Requests addressed to {onBehalf ? 'them' : 'you'} personally, such as a team member's leave, go to the colleague you choose for these days, including any already waiting. {onBehalf ? 'They' : 'You'} can still decide them. Requests for a group, such as HR or finance, stay with the group.</p>
        {onBehalf && <Picker label="Whose approvals" hint="Type at least two letters of a name or employee code" placeholder="Search people" queryKey="delegates" minChars={2} search={searchDelegates} required value={delegator} onChange={setDelegator} />}
        <Picker label="Approves instead" hint="Type at least two letters of a name or employee code" placeholder="Search people" queryKey="delegates" minChars={2} search={searchDelegates} required value={delegate} onChange={setDelegate} />
        <div className="columns-form">
          <DatePicker label="First day" required min={today} value={startsOn} onChange={(e) => { setStartsOn(e.target.value); if (e.target.value > endsOn) setEndsOn(e.target.value); }} />
          <DatePicker label="Last day" hint="At most 90 days" required min={startsOn} max={startsOn ? addDays(startsOn, 89) : undefined} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <Input label="Note for them (optional)" maxLength={300} placeholder="On leave; urgent items to Meera" value={note} onChange={(e) => setNote(e.target.value)} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!delegate || (onBehalf && !delegator)}>Hand over</Button></div></div>
      </form>
    </Modal>
  );
}

function HandoverTable({ label, rows, who, onEnd, endLabel }: { label: string; rows: Delegation[]; who: 'delegate' | 'delegator' | 'both'; onEnd: (d: Delegation) => void; endLabel: string }) {
  const columns: Column<Delegation>[] = [
    ...(who !== 'delegate' ? [{ key: 'delegator', header: 'Approver', card: 'title' as const, cell: (d: Delegation) => d.delegator_name }] : []),
    ...(who !== 'delegator' ? [{ key: 'delegate', header: 'Approves instead', card: who === 'delegate' ? 'title' as const : undefined, cell: (d: Delegation) => d.delegate_name }] : []),
    { key: 'status', header: 'Status', card: 'status', cell: (d) => <StatusBadge status={d.state} /> },
    { key: 'days', header: 'Days', cell: (d) => period(d) },
    { key: 'note', header: 'Note', cell: (d) => <>{d.note ?? '—'}{d.set_up_by_hr && <div className="table__cell-sub">Set up by {d.created_by_name}</div>}</> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (d) => (isOpen(d) ? <div className="table__actions"><Button size="sm" onClick={() => onEnd(d)}>{endLabel}</Button></div> : null) },
  ];
  return <Table label={label} columns={columns} rows={rows} rowKey={(d) => d.id} />;
}

/** "While I'm away": hand over my approvals, see whom I cover for, and (HR) everyone's handovers. */
export function Delegations() {
  const { can } = useAuth();
  const toast = useToast();
  const hr = can('approvals.delegations');
  const mine = useApiQuery<{ given: Delegation[]; received: Delegation[] }>('/api/v1/approvals/delegations');
  const all = useApiQuery<{ items: Delegation[] }>(hr ? '/api/v1/approvals/delegations?scope=all' : null);
  const [form, setForm] = useState<null | 'self' | 'other'>(null);
  const [ending, setEnding] = useState<{ d: Delegation; label: string; confirm: string } | null>(null);
  const reload = () => invalidateApi('/api/v1/approvals');
  return (
    <QueryState query={mine}>
      {({ given, received }) => {
        const current = given.find(isOpen);
        return (
          <div className="stack-4">
            {received.filter((d) => d.state === 'active').map((d) => <Alert key={d.id} tone="ok" live>You approve for <strong>{d.delegator_name}</strong> until {fmtDate(d.ends_on)}. Their requests are in “Awaiting me”.</Alert>)}
            <Card title="My approvals while I'm away" aria-label="My handover" actions={!current && <Button variant="primary" size="sm" onClick={() => setForm('self')}>Hand over my approvals</Button>}>
              <div className="stack-3">
                {current
                  ? <p>{current.state === 'active' ? 'Handed' : 'Will be handed'} to <strong>{current.delegate_name}</strong> for {period(current)}.</p>
                  : <p className="text-2">Going on leave or travelling? Choose a colleague to approve requests addressed to you for those days.</p>}
                {given.length > 0 && <HandoverTable label="My handovers" rows={given} who="delegate" endLabel="End now" onEnd={(d) => setEnding({ d, label: d.state === 'scheduled' ? 'Cancel this handover' : 'End this handover now', confirm: d.state === 'scheduled' ? 'Cancel handover' : 'End now' })} />}
              </div>
            </Card>
            {received.length > 0 && (
              <Card title="I approve for" aria-label="I approve for">
                <HandoverTable label="I approve for" rows={received} who="delegator" endLabel="Decline" onEnd={(d) => setEnding({ d, label: `Stop approving for ${d.delegator_name}`, confirm: 'Stop approving' })} />
              </Card>
            )}
            {hr && (
              <Card title="All handovers" aria-label="All handovers" actions={<Button size="sm" onClick={() => setForm('other')}>Hand over for someone</Button>}>
                <div className="stack-3">
                  <p className="text-2 text-sm">For an unplanned absence. Both people are told.</p>
                  <QueryState query={all} isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No handovers in the last 30 days." />}>
                    {(d) => <HandoverTable label="All handovers" rows={d.items} who="both" endLabel="End now" onEnd={(x) => setEnding({ d: x, label: `End ${x.delegator_name}'s handover now`, confirm: 'End now' })} />}
                  </QueryState>
                </div>
              </Card>
            )}
            {form && <HandOver onBehalf={form === 'other'} onClose={() => setForm(null)} onDone={() => void reload()} />}
            {ending && (
              <ConfirmDialog
                title={ending.label}
                message={`${ending.d.delegator_name} → ${ending.d.delegate_name}, ${period(ending.d)}. Requests waiting go back to ${ending.d.delegator_name}.`}
                confirmLabel={ending.confirm}
                danger
                onClose={() => setEnding(null)}
                onConfirm={async () => { await api.post(`/api/v1/approvals/delegations/${ending.d.id}/revoke`); toast('Handover ended'); await reload(); }}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
