import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, statusLabel, StatusBadge } from '../../components/Badge';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { RevealToggle } from '../../components/RevealToggle';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { QueryState } from '../../components/QueryState';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useAction } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { FeedbackForm, ScheduleInterview } from './InterviewForms';
import { HireForm, OfferForm } from './OfferForms';
import { KINDS, personName, RECOMMENDATION, STAGE_LABEL, years, type Application, type Interview, type Offer, type PanelMember } from './types';

const reload = () => invalidateApi('/api/v1/recruitment');

function Feedback({ p }: { p: PanelMember }) {
  if (!p.submitted_at) return <p className="recruit-feedback"><strong>{p.name}</strong>: <span className="text-2">pending</span></p>;
  if (p.hidden) return <p className="recruit-feedback"><strong>{p.name}</strong>: <span className="text-2">submitted (hidden until you submit yours)</span></p>;
  return (
    <div className="recruit-feedback">
      <strong>{p.name}</strong>: {p.rating} of 5 · {RECOMMENDATION[p.recommendation ?? ''] ?? p.recommendation}
      {p.notes && <p className="text-2 pre-wrap">{p.notes}</p>}
    </div>
  );
}

function InterviewCard({ iv, manage, onFeedback, onCancel }: { iv: Interview; manage: boolean; onFeedback: () => void; onCancel: () => void }) {
  const { me } = useAuth();
  const mine = iv.panel.find((p) => p.user_id === me?.user.id);
  return (
    <Card
      headingLevel={3}
      title={<span className="cluster">Round {iv.round} · {KINDS[iv.kind] ?? iv.kind}<StatusBadge status={iv.status} /></span>}
      actions={(
        <>
          {mine && !mine.submitted_at && iv.status !== 'cancelled' && <Button size="sm" variant="primary" onClick={onFeedback}>Give feedback</Button>}
          {manage && iv.status === 'scheduled' && <Button size="sm" onClick={onCancel}>Cancel interview</Button>}
        </>
      )}
    >
      <div className="stack-2">
        <p className="text-sm text-2">{fmtDateTime(iv.scheduled_at)}{iv.location ? ` · ${iv.location}` : ''}</p>
        {iv.panel.map((p) => <Feedback key={p.user_id} p={p} />)}
      </div>
    </Card>
  );
}

function OfferCard({ o, canEdit, onEdit, onHire, onConfirm }: { o: Offer; canEdit: boolean; onEdit: () => void; onHire: () => void; onConfirm: (kind: 'declined' | 'withdraw') => void }) {
  const { can } = useAuth();
  const { run, isBusy } = useAction();
  const act = (action: string, done: string) => void run(action, async () => { await api.post(`/api/v1/recruitment/offers/${o.id}/${action}`, {}); await reload(); }, done);
  return (
    <Card headingLevel={3} title={<span className="cluster">{o.designation}<StatusBadge status={o.status} />{o.above_budget && <Badge tone="warn">Above budget</Badge>}</span>} actions={(o.annual_ctc !== null || isMaskedField(o, 'annual_ctc')) && <strong><Money value={o.annual_ctc} masked={isMaskedField(o, 'annual_ctc')} /> / yr</strong>}>
      <div className="stack-3">
        <p className="text-sm text-2">{o.branch_name} · {statusLabel(o.employment_type)} · joins {fmtDate(o.joining_date)}{o.probation_months ? ` · ${o.probation_months} months probation` : ''}</p>
        {o.notes && <p className="text-sm pre-wrap">{o.notes}</p>}
        {can('recruitment.manage') && (
          <div className="cluster">
            {['draft', 'rejected'].includes(o.status) && canEdit && <Button size="sm" onClick={onEdit}>Edit offer</Button>}
            {['draft', 'rejected'].includes(o.status) && <Button size="sm" variant="primary" loading={isBusy('submit')} onClick={() => act('submit', 'Sent for approval')}>Submit for approval</Button>}
            {o.status === 'approved' && <Button size="sm" variant="primary" loading={isBusy('sent')} onClick={() => act('sent', 'Marked as sent')}>Mark sent</Button>}
            {o.status === 'sent' && <Button size="sm" variant="primary" loading={isBusy('accepted')} onClick={() => act('accepted', 'Accepted')}>Accepted</Button>}
            {o.status === 'sent' && <Button size="sm" onClick={() => onConfirm('declined')}>Declined</Button>}
            {o.status === 'accepted' && !o.employee_id && can('employees.manage') && <Button size="sm" variant="primary" onClick={onHire}>Hire → create employee</Button>}
            {o.employee_id && <ButtonLink size="sm" to={`/employees/${o.employee_id}`}>Open employee</ButtonLink>}
            {['draft', 'approved', 'sent', 'rejected'].includes(o.status) && <Button size="sm" variant="danger-ghost" onClick={() => onConfirm('withdraw')}>Withdraw</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

const LIVE_OFFER = ['draft', 'pending', 'approved', 'sent', 'accepted'];

export function ApplicationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { query, revealed, setRevealed } = useRevealable<Application>(`/api/v1/recruitment/applications/${id}`);
  const a = query.data;
  const [moving, setMoving] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [feedback, setFeedback] = useState<Interview | null>(null);
  const [cancelInterview, setCancelInterview] = useState<Interview | null>(null);
  const [offerForm, setOfferForm] = useState<{ offer?: Offer } | null>(null);
  const [hiring, setHiring] = useState<Offer | null>(null);
  const [offerConfirm, setOfferConfirm] = useState<{ offer: Offer; kind: 'declined' | 'withdraw' } | null>(null);
  const manage = can('recruitment.manage');
  const compensation = manage && can('recruitment.compensation');
  return (
    <Modal title={a ? `${personName(a.candidate)} — ${a.requisition.code}` : 'Application'} size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster-between">
              <span className="cluster"><StatusBadge status={d.stage} /><span className="text-sm text-2">{d.requisition.title}</span></span>
              {d.candidate.has_resume && <DownloadButton url={`/api/v1/recruitment/candidates/${d.candidate.id}/resume`} fileName="resume">Resume</DownloadButton>}
            </div>
            <p className="text-sm text-2">{[d.candidate.current_designation, d.candidate.current_company, years(d.candidate.experience_months), d.candidate.qualification].filter(Boolean).join(' · ')}</p>
            {d.allowedMoves.length > 0 && <div className="cluster">{d.allowedMoves.map((s) => <Button key={s} size="sm" variant={s === 'rejected' ? 'danger-ghost' : 'secondary'} onClick={() => setMoving(s)}>→ {STAGE_LABEL[s]}</Button>)}</div>}
            <section className="stack-3" aria-label="Interviews">
              <div className="cluster-between"><h3>Interviews</h3>{manage && d.stage === 'interview' && <Button size="sm" variant="primary" onClick={() => setScheduling(true)}>Schedule interview</Button>}</div>
              {d.interviews.length ? d.interviews.map((iv) => <InterviewCard key={iv.id} iv={iv} manage={manage} onFeedback={() => setFeedback(iv)} onCancel={() => setCancelInterview(iv)} />) : <EmptyState compact title="No interviews yet." />}
            </section>
            {d.access !== 'panel' && (
              <section className="stack-3" aria-label="Offer">
                <div className="cluster-between">
                  <span className="cluster"><h3>Offer</h3>{d.offers.some((o) => isMaskedField(o, 'annual_ctc')) || revealed ? <RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} /> : null}</span>
                  {compensation && d.stage === 'offer' && !d.offers.some((o) => LIVE_OFFER.includes(o.status)) && <Button size="sm" variant="primary" onClick={() => setOfferForm({})}>Draft offer</Button>}
                </div>
                {d.offers.length
                  ? d.offers.map((o) => <OfferCard key={o.id} o={o} canEdit={compensation} onEdit={() => setOfferForm({ offer: o })} onHire={() => setHiring(o)} onConfirm={(kind) => setOfferConfirm({ offer: o, kind })} />)
                  : <EmptyState compact title="No offer yet." />}
                {d.events.length > 0 && (
                  <div className="stack-2">
                    <h3>History</h3>
                    <ul className="list-plain recruit-history">
                      {d.events.map((e, i) => <li key={i}><span className="text-2">{fmtDateTime(e.at)}</span> · {e.from_stage ? `${STAGE_LABEL[e.from_stage]} → ` : ''}{STAGE_LABEL[e.to_stage]} · {e.actor_name ?? 'System'}{e.note ? `: ${e.note}` : ''}</li>)}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </QueryState>
      {moving && a && (
        <ConfirmDialog
          title={`Move to ${STAGE_LABEL[moving]}`}
          danger={moving === 'rejected'}
          requireComment={moving === 'rejected'}
          confirmLabel="Move"
          message={moving === 'rejected' ? 'Give the reason for rejecting. It is kept in the history.' : 'Add an optional note to the history.'}
          onClose={() => setMoving(null)}
          onConfirm={async (comment) => {
            await api.post(`/api/v1/recruitment/applications/${id}/move`, { stage: moving, expectedVersion: a.version, ...(moving === 'rejected' ? { reason: comment } : { note: comment || null }) });
            toast(`Moved to ${STAGE_LABEL[moving]}`);
            await reload();
          }}
        />
      )}
      {cancelInterview && (
        <ConfirmDialog
          title="Cancel interview"
          danger
          confirmLabel="Cancel interview"
          message={`Cancel round ${cancelInterview.round}, ${fmtDateTime(cancelInterview.scheduled_at)}? The panel is told.`}
          onClose={() => setCancelInterview(null)}
          onConfirm={async () => { await api.post(`/api/v1/recruitment/interviews/${cancelInterview.id}/cancel`, {}); toast('Interview cancelled'); await reload(); }}
        />
      )}
      {offerConfirm && (
        <ConfirmDialog
          title={offerConfirm.kind === 'withdraw' ? 'Withdraw offer' : 'Candidate declined'}
          danger={offerConfirm.kind === 'withdraw'}
          confirmLabel={offerConfirm.kind === 'withdraw' ? 'Withdraw offer' : 'Mark declined'}
          message={offerConfirm.kind === 'withdraw' ? `Withdraw the offer for ${offerConfirm.offer.designation}? This cannot be undone.` : `Record that the candidate declined the offer for ${offerConfirm.offer.designation}?`}
          onClose={() => setOfferConfirm(null)}
          onConfirm={async () => { await api.post(`/api/v1/recruitment/offers/${offerConfirm.offer.id}/${offerConfirm.kind}`, {}); toast(offerConfirm.kind === 'withdraw' ? 'Offer withdrawn' : 'Declined'); await reload(); }}
        />
      )}
      {scheduling && <ScheduleInterview applicationId={id} nextRound={(a?.interviews.length ?? 0) + 1} onClose={() => setScheduling(false)} />}
      {feedback && <FeedbackForm interview={feedback} onClose={() => setFeedback(null)} />}
      {offerForm && a && <OfferForm applicationId={id} requisitionId={a.requisition.id} offer={offerForm.offer} onClose={() => setOfferForm(null)} />}
      {hiring && <HireForm offer={hiring} onClose={() => setHiring(null)} />}
    </Modal>
  );
}
