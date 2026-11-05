import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Textarea } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { Picker, type PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { searchPeople } from './searchPeople';
import { CASES_URL, categoryLabel, isClosed, STATUS, type CaseDetailData } from './types';

const BLANK = { text: '', share: false, toStatus: '', outcome: '' };

export function CaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const query = useApiQuery<CaseDetailData>(`${CASES_URL}/${id}`, { staleTime: 0, gcTime: 0 });
  const [draft, setDraft] = useState(BLANK);
  const [withdraw, setWithdraw] = useState(false);
  const [assign, setAssign] = useState(false);
  const c = query.data;
  const title = c ? `${c.reference}, ${c.kind === 'posh' ? 'POSH complaint' : 'grievance'}` : 'Case';
  return (
    <Modal title={title} size="lg" onClose={onClose} dirty={!!draft.text.trim() || !!draft.outcome.trim()}>
      <QueryState query={query}>
        {(d) => {
          const handler = d.role === 'handler';
          const closed = isClosed(d.status);
          return (
            <div className="stack-4">
              <div className="cluster">
                <StatusBadge status={d.status} />
                <span className="text-sm text-2">{categoryLabel(d.kind, d.category)}, filed {fmtDateTime(d.receivedAt)}</span>
                {d.kind === 'posh' && !closed && <Badge>{d.status === 'report_submitted' ? `Report due ${fmtDate(d.reportDue)}` : `Inquiry due ${fmtDate(d.inquiryDue)}`}</Badge>}
                {d.kind === 'grievance' && !closed && d.slaDue && <Badge>Response due {fmtDate(d.slaDue)}</Badge>}
              </div>
              {handler && <KeyValue items={[{ label: 'Complainant', value: d.anonymous ? 'Anonymous' : d.complainantName }, { label: 'Respondent', value: d.respondentName ?? d.respondentText }, ...(d.respondentName && d.respondentText ? [{ label: 'Also named', value: d.respondentText }] : []), { label: 'Handler', value: d.assigneeName }]} />}
              <div className="stack-1">
                <div className="case-text">{d.description}</div>
                {d.incidentDate && <p className="text-xs text-2">Incident date: {fmtDate(d.incidentDate)}</p>}
              </div>
              {d.lateReason && <Alert tone="warn">Filed late: {d.lateReason}</Alert>}
              {d.outcome && <Alert tone="ok">Outcome: {d.outcome}</Alert>}
              <div className="stack-2">
                <h3>Updates</h3>
                {d.events.length
                  ? (
                    <ul className="list-plain case-events">
                      {d.events.map((e, i) => (
                        <li key={i} className="case-event">
                          <div className="case-event__meta">
                            <span className="tnum">{fmtDateTime(e.at)}</span>
                            <span>{e.actor ?? '—'}</span>
                            {e.to_status && <span>{STATUS[e.from_status ?? ''] ?? ''} → {STATUS[e.to_status] ?? e.to_status}</span>}
                            {handler && !e.visible_to_complainant && <Badge>Internal</Badge>}
                          </div>
                          {e.text && <div className="case-event__text">{e.text}</div>}
                        </li>
                      ))}
                    </ul>
                  )
                  : <p className="text-sm text-2">None yet.</p>}
              </div>
              {!closed && <UpdateForm c={d} draft={draft} setDraft={setDraft} />}
              {!closed && (d.role === 'complainant' || (d.kind === 'grievance' && can('grievance.manage'))) && (
                <div className="cluster">
                  {d.role === 'complainant' && <Button variant="danger-ghost" onClick={() => setWithdraw(true)}>Withdraw</Button>}
                  {d.kind === 'grievance' && can('grievance.manage') && <Button onClick={() => setAssign(true)}>Assign handler</Button>}
                </div>
              )}
            </div>
          );
        }}
      </QueryState>
      {withdraw && (
        <ConfirmDialog
          title="Withdraw case"
          danger
          requireComment
          confirmLabel="Withdraw"
          message="This ends the case. Tell us why."
          onClose={() => setWithdraw(false)}
          onConfirm={async (reason) => { await api.post(`${CASES_URL}/${id}/withdraw`, { reason }); toast('Withdrawn'); await invalidateApi(CASES_URL); }}
        />
      )}
      {assign && c && <AssignForm id={id} onClose={() => setAssign(false)} />}
    </Modal>
  );
}

function UpdateForm({ c, draft, setDraft }: { c: CaseDetailData; draft: typeof BLANK; setDraft: (d: typeof BLANK) => void }) {
  const toast = useToast();
  const handler = c.role === 'handler';
  const { busy, errors, error, submit } = useSubmit(async () => {
    await api.post(`${CASES_URL}/${c.id}/events`, { text: draft.text, visibleToComplainant: handler ? draft.share : true, toStatus: draft.toStatus || undefined, outcome: draft.outcome || undefined, expectedVersion: c.version });
    toast('Saved');
    setDraft(BLANK);
    await invalidateApi(CASES_URL);
  });
  return (
    <form className="stack-3" onSubmit={submit}>
      <Textarea label={handler ? 'Add a note or update' : 'Add a comment'} required minLength={2} maxLength={10000} error={errors['text']} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      {handler && <Checkbox label="Share with the complainant" hint="A status change is always shared." checked={draft.share} onChange={(e) => setDraft({ ...draft, share: e.target.checked })} />}
      {handler && c.allowedMoves.length > 0 && <Select label="Status" placeholder="Keep status" error={errors['toStatus']} value={draft.toStatus} options={c.allowedMoves.map((s) => ({ value: s, label: `Move to ${STATUS[s] ?? s}` }))} onChange={(e) => setDraft({ ...draft, toStatus: e.target.value })} />}
      {!handler && c.kind === 'grievance' && c.status === 'resolved' && <Checkbox label="Not resolved: reopen" checked={draft.toStatus === 'reopened'} onChange={(e) => setDraft({ ...draft, toStatus: e.target.checked ? 'reopened' : '' })} />}
      {handler && draft.toStatus === 'closed' && <Textarea label="Outcome or recommendations" required={c.kind === 'posh'} maxLength={10000} error={errors['outcome']} value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} />}
      <FormActions error={error} busy={busy} submitLabel="Save" />
    </form>
  );
}

function AssignForm({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const [person, setPerson] = useState<PickerItem | null>(null);
  const { busy, errors, error, submit } = useSubmit(async () => {
    await api.post(`${CASES_URL}/${id}/assign`, { userId: person!.id });
    toast('Assigned');
    await invalidateApi(CASES_URL);
    onClose();
  }, { validate: () => (person ? ({} as Record<string, string>) : { userId: 'Choose a person' }) });
  return (
    <Modal title="Assign handler" size="sm" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <Picker label="Handler" hint="The complainant and the person named in the grievance cannot handle it." placeholder="Search people" queryKey="case-people" required search={searchPeople} error={errors['userId']} value={person} onChange={setPerson} />
        <FormActions error={error} busy={busy} submitLabel="Assign" onCancel={onClose} />
      </form>
    </Modal>
  );
}
