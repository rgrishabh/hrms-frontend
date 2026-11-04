import { useState } from 'react';
import { api, qs } from '../api';
import { fmtDate, todayLocal, addDays } from '../format';
import { useAuth } from '../auth';
import { useLoad, Loading, ErrorBox, StatusBadge, Empty, Confirm, Modal, Field, useToast, errText } from '../ui';

type Delegation = { id: string; delegator_id: string; delegator_name: string; delegate_id: string; delegate_name: string; starts_on: string; ends_on: string;
  note: string | null; state: 'scheduled' | 'active' | 'ended' | 'revoked'; set_up_by_hr: boolean; created_by_name: string };

const period = (d: { starts_on: string; ends_on: string }) => (d.starts_on === d.ends_on ? fmtDate(d.starts_on) : `${fmtDate(d.starts_on)} – ${fmtDate(d.ends_on)}`);
const open = (d: Delegation) => d.state === 'active' || d.state === 'scheduled';

function PersonPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string, name: string) => void }) {
  const [search, setSearch] = useState('');
  const people = useLoad(() => (search.trim().length >= 2 ? api.get(`/api/v1/approvals/delegates${qs({ q: search.trim() })}`) : Promise.resolve({ items: [] })), [search]);
  const items: { id: string; name: string; code: string | null; designation: string | null }[] = people.data?.items ?? [];
  return (
    <Field label={label} hint="Type at least two letters of a name or employee code">
      <div className="stack" style={{ gap: 4 }}>
        <input aria-label={`Search for ${label.toLowerCase()}`} placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={label} required value={value} onChange={(e) => onChange(e.target.value, items.find((x) => x.id === e.target.value)?.name ?? '')}>
          <option value="">{search.trim().length >= 2 ? (items.length ? 'Choose…' : 'No one found') : '—'}</option>
          {items.map((x) => <option key={x.id} value={x.id}>{x.name}{x.designation ? ` — ${x.designation}` : ''}{x.code ? ` (${x.code})` : ''}</option>)}
        </select>
      </div>
    </Field>
  );
}

function HandOver({ onBehalf, onClose, onDone }: { onBehalf: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = todayLocal();
  const [f, setF] = useState({ delegatorId: '', delegateId: '', delegateName: '', startsOn: today, endsOn: addDays(today, 4), note: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={onBehalf ? 'Hand over approvals for someone' : 'Hand over my approvals'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null); setBusy(true);
        try {
          await api.post('/api/v1/approvals/delegations', { delegateId: f.delegateId, startsOn: f.startsOn, endsOn: f.endsOn, note: f.note.trim() || undefined,
            delegatorId: onBehalf ? f.delegatorId : undefined });
          toast(`Approvals handed to ${f.delegateName}`); onDone(); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <p className="hint">Requests addressed to {onBehalf ? 'them' : 'you'} personally, such as a team member's leave, go to the colleague you choose for these days, including any already waiting. {onBehalf ? 'They' : 'You'} can still decide them. Requests for a group (HR, finance) stay with the group.</p>
        {onBehalf && <PersonPicker label="Whose approvals" value={f.delegatorId} onChange={(id) => setF({ ...f, delegatorId: id })} />}
        <PersonPicker label="Approves instead" value={f.delegateId} onChange={(id, name) => setF({ ...f, delegateId: id, delegateName: name })} />
        <div className="grid-2">
          <Field label="First day"><input type="date" required min={today} value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value, endsOn: e.target.value > f.endsOn ? e.target.value : f.endsOn })} /></Field>
          <Field label="Last day" hint="At most 90 days"><input type="date" required min={f.startsOn} max={addDays(f.startsOn, 89)} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></Field>
        </div>
        <Field label="Note for them (optional)"><input maxLength={300} placeholder="e.g. On leave; urgent items to Meera" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Hand over</button></div>
      </form>
    </Modal>
  );
}

function Table({ rows, who, onEnd, endLabel }: { rows: Delegation[]; who: 'delegate' | 'delegator' | 'both'; onEnd: (d: Delegation) => void; endLabel: string }) {
  return (
    <div className="table-wrap"><table className="t"><thead><tr>
      {who !== 'delegate' && <th>Approver</th>}{who !== 'delegator' && <th>Approves instead</th>}<th>Days</th><th>Note</th><th>Status</th><th />
    </tr></thead><tbody>
      {rows.map((d) => (
        <tr key={d.id}>
          {who !== 'delegate' && <td>{d.delegator_name}</td>}{who !== 'delegator' && <td>{d.delegate_name}</td>}
          <td>{period(d)}</td><td>{d.note ?? '—'}{d.set_up_by_hr && <div className="muted">Set up by {d.created_by_name}</div>}</td>
          <td><StatusBadge status={d.state} /></td>
          <td>{open(d) && <button className="btn sm" onClick={() => onEnd(d)}>{endLabel}</button>}</td>
        </tr>
      ))}
    </tbody></table></div>
  );
}

/** "While I'm away": hand over my approvals, see whom I cover for, and (HR) everyone's handovers. */
export function Delegations({ onChange }: { onChange?: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const hr = can('approvals.delegations');
  const mine = useLoad(() => api.get('/api/v1/approvals/delegations'), []);
  const all = useLoad(() => (hr ? api.get('/api/v1/approvals/delegations?scope=all') : Promise.resolve(null)), [hr]);
  const [form, setForm] = useState<null | 'self' | 'other'>(null);
  const [ending, setEnding] = useState<{ d: Delegation; label: string } | null>(null);
  const reload = () => { mine.reload(); all.reload(); onChange?.(); };
  if (mine.loading) return <Loading />;
  if (mine.error) return <ErrorBox error={mine.error} />;
  const given: Delegation[] = mine.data.given; const received: Delegation[] = mine.data.received;
  const current = given.find(open);
  const covering = received.filter((d) => d.state === 'active');
  return (
    <div className="stack">
      {covering.map((d) => <div key={d.id} className="alert ok" role="status">You approve for <strong>{d.delegator_name}</strong> until {fmtDate(d.ends_on)}. Their requests are in “Awaiting me”.</div>)}
      <section className="card stack" aria-label="My handover">
        <div className="row"><h2 style={{ margin: 0 }}>My approvals while I'm away</h2><span className="spacer" />
          {!current && <button className="btn primary" onClick={() => setForm('self')}>Hand over my approvals</button>}</div>
        {current
          ? <p>{current.state === 'active' ? 'Handed' : 'Will be handed'} to <strong>{current.delegate_name}</strong> for {period(current)}.</p>
          : <p className="muted">Going on leave or travelling? Choose a colleague to approve requests addressed to you for those days.</p>}
        {given.length > 0 && <Table rows={given} who="delegate" endLabel="End now" onEnd={(d) => setEnding({ d, label: d.state === 'scheduled' ? 'Cancel this handover' : 'End this handover now' })} />}
      </section>
      {received.length > 0 && (
        <section className="card stack" aria-label="I approve for">
          <h2 style={{ margin: 0 }}>I approve for</h2>
          <Table rows={received} who="delegator" endLabel="Decline" onEnd={(d) => setEnding({ d, label: `Stop approving for ${d.delegator_name}` })} />
        </section>
      )}
      {hr && (
        <section className="card stack" aria-label="All handovers">
          <div className="row"><h2 style={{ margin: 0 }}>All handovers</h2><span className="spacer" /><button className="btn" onClick={() => setForm('other')}>Hand over for someone</button></div>
          <p className="hint">For an unplanned absence. Both people are told.</p>
          {all.loading ? <Loading /> : all.error ? <ErrorBox error={all.error} /> : !all.data?.items.length ? <Empty>No handovers in the last 30 days.</Empty>
            : <Table rows={all.data.items} who="both" endLabel="End now" onEnd={(d) => setEnding({ d, label: `End ${d.delegator_name}'s handover now` })} />}
        </section>
      )}
      {form && <HandOver onBehalf={form === 'other'} onClose={() => setForm(null)} onDone={reload} />}
      {ending && <Confirm title={ending.label} message={`${ending.d.delegator_name} → ${ending.d.delegate_name}, ${period(ending.d)}. Requests waiting go back to ${ending.d.delegator_name}.`}
        confirmLabel={ending.label.startsWith('Stop') ? 'Stop approving' : ending.label.startsWith('Cancel') ? 'Cancel handover' : 'End now'} danger onClose={() => setEnding(null)}
        onConfirm={async () => { await api.post(`/api/v1/approvals/delegations/${ending.d.id}/revoke`); toast('Handover ended'); reload(); }} />}
    </div>
  );
}
