import { useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge, statusLabel, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Textarea } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { MaskableText } from '../../components/RevealToggle';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { addDays, fmtDate, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { isMaskedField } from '../../lib/masking';
import { useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { ChecklistDetail, reloadLifecycle } from './Checklist';
import { options, SEP_KIND, type Separation, type SeparationRow } from './types';

const URL_BASE = '/api/v1/lifecycle/separations';
const shortfall = (s: Pick<SeparationRow, 'shortfall_days' | 'waive_shortfall'>) => (s.shortfall_days ? `${s.shortfall_days} days${s.waive_shortfall ? ' (waived)' : ''}` : '—');

export function Separations() {
  const { can, canAny, me } = useAuth();
  const hr = canAny('lifecycle.manage', 'lifecycle.read');
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<'resign' | 'hr' | null>(null);
  const columns = useMemo<Column<SeparationRow>[]>(() => [
    { key: 'employee', header: 'Employee', required: true, card: 'title', cell: (s) => <><Button variant="link" onClick={() => setOpen(s.id)}>{s.employee_name}</Button><div className="table__cell-sub mono">{s.employee_code}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (s) => <StatusBadge status={s.status} /> },
    { key: 'kind', header: 'Kind', cell: (s) => SEP_KIND[s.kind] ?? s.kind },
    { key: 'notice', header: 'Notice', cell: (s) => fmtDate(s.notice_date) },
    { key: 'lwd', header: 'Last working day', cell: (s) => fmtDate(s.approved_lwd ?? s.requested_lwd) },
    { key: 'shortfall', header: 'Shortfall', cell: shortfall },
    { key: 'fnf', header: 'F&F', cell: (s) => statusLabel(s.fnf_status) },
  ], []);
  const initial = useMemo(() => ({ filters: { scope: hr ? 'all' : 'mine' } }), [hr]);
  const table = useTableState('lifecycle.separations', columns, initial);
  const scope = table.filters['scope'] ?? 'mine';
  const query = useApiQuery<ApiResponse<'/api/v1/lifecycle/separations'>>(`${URL_BASE}${qs({ scope, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-4">
      <FilterBar
        actions={(
          <>
            {me?.user.employeeId && can('lifecycle.self') && <Button onClick={() => setForm('resign')}>Resign</Button>}
            {can('lifecycle.manage') && <Button variant="primary" onClick={() => setForm('hr')}>Start separation</Button>}
          </>
        )}
      >
        <Select label="Show" hideLabel value={scope} options={[...(hr ? [{ value: 'all', label: 'All separations' }] : []), { value: 'mine', label: 'Mine' }, { value: 'team', label: 'My team' }]} onChange={(e) => table.setFilter('scope', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<LogOut />} title="No separations" />}>
        {(d) => <Table label="Separations" columns={columns} rows={d.items} rowKey={(s) => s.id} hidden={table.hidden} onToggleColumn={table.toggleColumn} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {form && <SeparationForm kind={form} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); setOpen(id); }} />}
      {open && <SeparationDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SeparationForm({ kind, onClose, onSaved }: { kind: 'resign' | 'hr'; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const today = todayLocal();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ kind: 'termination', reason: '', noticeDate: today, requestedLwd: addDays(today, 30) });
  const form = useSubmit(async () => {
    const r = kind === 'resign'
      ? await api.post<ApiResponse<'/api/v1/lifecycle/separations/resign', 'post'>>(`${URL_BASE}/resign`, { reason: f.reason, requestedLwd: f.requestedLwd })
      : await api.post<ApiResponse<'/api/v1/lifecycle/separations', 'post'>>(URL_BASE, { ...f, employeeId: employee!.id });
    toast(r.shortfallDays ? `Submitted. Notice short by ${r.shortfallDays} day(s) of the ${r.noticeDaysRequired} required.` : 'Submitted for approval');
    await reloadLifecycle();
    onSaved(r.id);
  }, { validate: (): Record<string, string> => (kind === 'hr' && !employee ? { employeeId: 'Choose an employee.' } : {}) });
  return (
    <Modal title={kind === 'resign' ? 'Resign' : 'Start separation'} onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        {kind === 'hr' && (
          <>
            <EmployeeField required error={form.errors['employeeId']} value={employee} onChange={setEmployee} />
            <div className="columns-form">
              <Select label="Kind" value={f.kind} options={options(SEP_KIND).filter((o) => o.value !== 'resignation')} onChange={(e) => setF({ ...f, kind: e.target.value })} />
              <DatePicker label="Notice date" required error={form.errors['noticeDate']} value={f.noticeDate} onChange={(e) => setF({ ...f, noticeDate: e.target.value })} />
            </div>
          </>
        )}
        <DatePicker label="Proposed last working day" required min={kind === 'resign' ? today : f.noticeDate} error={form.errors['requestedLwd']} value={f.requestedLwd} onChange={(e) => setF({ ...f, requestedLwd: e.target.value })} />
        <Textarea label="Reason" required minLength={3} error={form.errors['reason']} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <p className="text-xs text-3">{kind === 'resign' ? 'Your reporting manager and then HR approve. You can withdraw while it is pending.' : 'A second HR approver must approve HR-initiated separations.'}</p>
        <FormActions error={form.error} busy={form.busy} submitLabel="Submit" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/** Answers already on file, without the server's bookkeeping fields. The backend replaces all answers, so the form must start from these. */
const recordedAnswers = (saved: Record<string, unknown> | null | undefined) => Object.fromEntries(Object.entries(saved ?? {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, String(v ?? '')]));

/** The API withholds the answers from some readers and says only that they exist. */
const answersHidden = (d: Separation) => !!d.exit_interview_recorded && !d.exit_interview;

const EXIT_QUESTIONS = [['reasonForLeaving', 'Main reason for leaving'], ['whatWentWell', 'What worked well'], ['whatToImprove', 'What should we improve'], ['wouldRecommend', 'Would you recommend us as an employer? Why?']] as const;
const questionLabel = (key: string) => EXIT_QUESTIONS.find(([k]) => k === key)?.[1] ?? key;

function SeparationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const query = useApiQuery<Separation>(`${URL_BASE}/${id}`, { staleTime: 0 });
  const s = query.data;
  const manage = can('lifecycle.manage');
  const [panel, setPanel] = useState<'lwd' | 'exit' | 'fnf' | 'cancel' | 'complete' | 'withdraw' | null>(null);
  const [rehire, setRehire] = useState(true);
  const [checklistOpen, setChecklistOpen] = useState<string | null>(null);
  const close = () => setPanel(null);
  return (
    <Modal title={s ? `${SEP_KIND[s.kind] ?? s.kind} — ${s.employee.name}` : 'Separation'} size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster"><StatusBadge status={d.status} />{d.shortfall_days > 0 && <Badge tone="warn">Notice short by {shortfall(d)}</Badge>}</div>
            <KeyValue items={[
              { label: 'Notice date', value: fmtDate(d.notice_date) }, { label: 'Last working day', value: fmtDate(d.approved_lwd ?? d.requested_lwd) }, { label: 'Initiated by', value: d.initiated_by_name },
              { label: 'Notice required', value: `${d.notice_days_required} days` }, { label: 'F&F', value: isMaskedField(d, 'fnf_note') ? `${statusLabel(d.fnf_status)} · note hidden` : `${statusLabel(d.fnf_status)}${d.fnf_note ? `: ${d.fnf_note}` : ''}` },
            ]} />
            <p className="lifecycle-note"><MaskableText row={d} field="reason" reason="Only the person, HR above them and who decides it can see this." /></p>
            <div className="cluster">
              {d.status === 'pending' && d.initiated_by === me?.user.id && <Button size="sm" onClick={() => setPanel('withdraw')}>Withdraw request</Button>}
              {d.status === 'pending' && manage && <Button size="sm" onClick={() => setPanel('lwd')}>Set last working day</Button>}
              {/* Saving replaces every answer, so one who cannot see what is on file cannot save over it. */}
              {['approved', 'completed'].includes(d.status) && (d.employee.id === me?.user.employeeId || manage) && <Button size="sm" disabled={answersHidden(d)} title={answersHidden(d) ? 'Only HR above this person can change this' : undefined} onClick={() => setPanel('exit')}>Exit interview</Button>}
              {/* The form saves status and note together, so one built without a hidden note would erase it. */}
              {['approved', 'completed'].includes(d.status) && manage && <Button size="sm" disabled={isMaskedField(d, 'fnf_note')} title={isMaskedField(d, 'fnf_note') ? 'Only HR above this person can change this' : undefined} onClick={() => setPanel('fnf')}>Update F&amp;F</Button>}
              {d.status === 'approved' && manage && <Button size="sm" variant="danger-ghost" onClick={() => setPanel('cancel')}>Cancel separation</Button>}
              {d.status === 'approved' && manage && <Button size="sm" variant="primary" onClick={() => setPanel('complete')}>Complete exit</Button>}
            </div>
            {['approved', 'completed'].includes(d.status) && (d.employee.id === me?.user.employeeId || manage) && answersHidden(d) && <p className="text-sm text-2">The exit interview is already recorded. Only HR above this person can change it.</p>}
            {d.checklist && (
              <Card headingLevel={3} title={<span className="cluster">Exit clearance<StatusBadge status={d.checklist.status} /></span>} actions={<Button size="sm" onClick={() => setChecklistOpen(d.checklist!.id)}>Open checklist</Button>}>
                <p className="text-sm text-2">{d.checklist.tasks.filter((t) => t.status !== 'pending').length}/{d.checklist.tasks.length} cleared</p>
              </Card>
            )}
            {!!d.leaveBalances?.length && <p className="text-sm"><strong>Leave balance at exit:</strong> {d.leaveBalances.map((l) => `${l.code} ${l.balance}`).join(' · ')}</p>}
            {d.exit_interview && Object.keys(recordedAnswers(d.exit_interview)).length > 0 && (
              <Card headingLevel={3} title="Exit interview">
                <KeyValue columns="one" items={Object.entries(recordedAnswers(d.exit_interview)).map(([k, v]) => ({ label: questionLabel(k), value: v }))} />
              </Card>
            )}
          </div>
        )}
      </QueryState>
      {panel === 'lwd' && s && <LwdForm separation={s} onClose={close} />}
      {panel === 'exit' && s && <ExitInterviewForm separation={s} onClose={close} />}
      {panel === 'fnf' && s && <FnfForm separation={s} onClose={close} />}
      {panel === 'withdraw' && (
        <ConfirmDialog
          title={s?.kind === 'resignation' ? 'Withdraw resignation' : 'Withdraw separation'}
          confirmLabel="Withdraw"
          message="The approval request is cancelled."
          onClose={close}
          onConfirm={async () => { await api.post(`${URL_BASE}/${id}/withdraw`); toast('Withdrawn'); await reloadLifecycle(); }}
        />
      )}
      {panel === 'cancel' && (
        <ConfirmDialog
          title="Cancel separation"
          danger
          requireComment
          confirmLabel="Cancel separation"
          message="The employee returns to active and the exit clearance is cancelled."
          onClose={close}
          onConfirm={async (reason) => { await api.post(`${URL_BASE}/${id}/cancel`, { reason }); toast('Separation cancelled'); await reloadLifecycle(); }}
        />
      )}
      {panel === 'complete' && (
        <ConfirmDialog
          title="Complete exit"
          confirmLabel="Complete"
          message={(
            <div className="stack-3">
              <p>Marks the employee as exited and disables their login. The last working day must have passed and every clearance task must be done.</p>
              <Checkbox label="Eligible for rehire" checked={rehire} onChange={(e) => setRehire(e.target.checked)} />
            </div>
          )}
          onClose={close}
          onConfirm={async () => { await api.post(`${URL_BASE}/${id}/complete`, { rehireEligible: rehire }); toast('Exit completed'); await reloadLifecycle(); }}
        />
      )}
      {checklistOpen && <ChecklistDetail id={checklistOpen} onClose={() => setChecklistOpen(null)} />}
    </Modal>
  );
}

function LwdForm({ separation: s, onClose }: { separation: Separation; onClose: () => void }) {
  const toast = useToast();
  const [lwd, setLwd] = useState(s.approved_lwd ?? s.requested_lwd);
  const [waive, setWaive] = useState(s.waive_shortfall);
  const form = useSubmit(async () => {
    await api.put(`${URL_BASE}/${s.id}/lwd`, { approvedLwd: lwd, waiveShortfall: waive });
    toast('Saved');
    await reloadLifecycle();
    onClose();
  });
  return (
    <Modal title="Last working day" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <DatePicker label="Approved last working day" required error={form.errors['approvedLwd']} value={lwd} onChange={(e) => setLwd(e.target.value)} />
        <Checkbox label="Waive any notice shortfall" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function ExitInterviewForm({ separation: s, onClose }: { separation: Separation; onClose: () => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ reasonForLeaving: '', whatWentWell: '', whatToImprove: '', wouldRecommend: '', ...recordedAnswers(s.exit_interview) }));
  const form = useSubmit(async () => {
    await api.post(`${URL_BASE}/${s.id}/exit-interview`, { answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())) });
    toast('Exit interview recorded');
    await reloadLifecycle();
    onClose();
  });
  return (
    <Modal title="Exit interview" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        {EXIT_QUESTIONS.map(([k, label]) => <Textarea key={k} label={label} value={answers[k]} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />)}
        <p className="text-xs text-3">Visible to HR only.</p>
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function FnfForm({ separation: s, onClose }: { separation: Separation; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(s.fnf_status);
  const [note, setNote] = useState(s.fnf_note ?? '');
  const form = useSubmit(async () => {
    await api.post(`${URL_BASE}/${s.id}/fnf`, { status, note: note || null });
    toast('F&F status saved');
    await reloadLifecycle();
    onClose();
  });
  return (
    <Modal title="Full and final settlement" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Select label="Status" value={status} options={[{ value: 'not_started', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'settled', label: 'Settled' }]} onChange={(e) => setStatus(e.target.value)} />
        <Textarea label="Note" error={form.errors['note']} value={note} onChange={(e) => setNote(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
