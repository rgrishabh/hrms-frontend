import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { RevealToggle } from '../../components/RevealToggle';
import { Select } from '../../components/Select';
import { StatGrid, StatTile } from '../../components/StatTile';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit, type FieldErrors } from '../../components/useSubmit';
import { currencySymbol, fmtDateTime, fmtNumber } from '../../format';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { invalidateApi } from '../../lib/query';
import { FnfSuggestions } from './FnfSuggestions';
import { PayLines } from './PayLines';
import { RUNS_URL, type Adjustment, type Run, type RunItem } from './types';

/** A person's name in a sentence or label, which must always read as something. */
const who = (i: RunItem) => i.employee_name ?? i.employee_code;
const days = (n: string | null) => (n === null ? '—' : fmtNumber(n));

const ITEMS_PAGE_SIZE = 25;
/** Asked of the server at once. Searching and paging within it happen here, and the rest is a click away. */
const SERVER_PAGE_SIZE = 200;
type Dialog = 'finalize' | 'cancel' | 'reopen' | 'ack' | 'paid' | null;
interface AdjustTarget { employeeId: string; name: string }

export function RunDetail({ id, employeeName, onClose }: { id: string; employeeName: string | null; onClose: () => void }) {
  const [serverPage, setServerPage] = useState(1);
  const { query, revealed, setRevealed } = useRevealable<Run>(`${RUNS_URL}/${id}?page=${serverPage}&pageSize=${SERVER_PAGE_SIZE}`, { keepPrevious: true });
  const r = query.data;
  return (
    <Modal title={r ? `Payroll ${r.period} — ${r.legal_entity_name ?? '—'}` : 'Payroll run'} size="lg" onClose={onClose}>
      <QueryState query={query}>{(run) => <RunBody run={run} employeeName={employeeName} revealed={revealed} revealing={query.isFetching} setRevealed={setRevealed} serverPage={serverPage} setServerPage={setServerPage} />}</QueryState>
    </Modal>
  );
}

function RunBody({ run: r, employeeName, revealed, revealing, setRevealed, serverPage, setServerPage }: { run: Run; employeeName: string | null; revealed: boolean; revealing: boolean; setRevealed: (v: boolean) => void; serverPage: number; setServerPage: (p: number) => void }) {
  const { can, canAny, hasFeature, me } = useAuth();
  const toast = useToast();
  const action = useAction();
  const base = `${RUNS_URL}/${r.id}`;
  const reload = () => invalidateApi(RUNS_URL);
  const manage = can('payroll.manage');
  const editable = ['draft', 'computed'].includes(r.status);
  const closed = ['finalized', 'paid'].includes(r.status);
  const warnings = r.warnings ?? 0;
  const released = r.released_count ?? 0;
  const unacknowledged = warnings > 0 && !r.warnings_acknowledged;
  // A regular run needs its month's attendance locked; the server refuses otherwise.
  const needsLock = r.kind === 'regular' && !r.attendanceLocked;
  const statutory = hasFeature('FEATURE_PAYROLL_STATUTORY');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [lines, setLines] = useState<RunItem | null>(null);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [release, setRelease] = useState<RunItem | null>(null);
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);

  const post = (path: string, body: unknown = {}) => api.post(`${base}/${path}`, body).then(reload);
  const setHold = (i: RunItem, hold: boolean) => action.run(`hold-${i.employee_id}`, () => post('hold', { employeeId: i.employee_id, hold }), hold ? `${who(i)} is on hold` : `${who(i)} is off hold`, { label: 'Undo', onClick: () => void action.run(`hold-${i.employee_id}`, () => post('hold', { employeeId: i.employee_id, hold: !hold }), hold ? 'Hold undone' : 'Back on hold') });
  // A hidden amount and note cannot be put back from here, so there is no undo for them.
  const removeAdjustment = (a: Adjustment) => action.run(`adj-${a.id}`, async () => { await api.del(`${base}/adjustments/${a.id}`); await reload(); }, 'Removed. Recompute the run.', isMaskedField(a, 'amount') ? undefined : {
    label: 'Undo',
    onClick: () => void action.run(`adj-${a.id}`, () => post('adjustments', { employeeId: a.employee_id, kind: a.kind, label: a.label, amount: Number(a.amount), taxable: a.taxable, note: a.note }), 'Adjustment restored. Recompute the run.'),
  });
  // A hidden net says nothing either way, so the server decides.
  const notNegative = (i: RunItem) => i.net === null || Number(i.net) >= 0;
  const mayRelease = (i: RunItem) => can('payroll.approve') && closed && i.hold && !i.hold_released_at && notNegative(i) && r.computed_by !== me?.user.id && i.employee_id !== me?.user.employeeId;

  const nameOf = (employeeId: string) => r.items.find((i) => i.employee_id === employeeId)?.employee_name ?? employeeName ?? '—';
  const itemColumns: Column<RunItem>[] = [
    {
      key: 'employee', header: 'Employee', card: 'title', cell: (i) => (
        <>
          <span className="cluster">{who(i)}{i.hold && <Badge tone="danger">Hold</Badge>}</span>
          <div className="table__cell-sub mono">{i.employee_code}</div>
          {!!i.warnings?.length && (
            <details className="run-warnings">
              <summary>{i.warnings.length} warning{i.warnings.length === 1 ? '' : 's'}</summary>
              <ul className="list-plain stack-1">{i.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
        </>
      ),
    },
    { key: 'paid', header: 'Paid days', align: 'right', cell: (i) => <span className="tnum">{days(i.paid_days)}/{days(i.employed_days)}</span> },
    { key: 'lop', header: 'LOP', align: 'right', cell: (i) => (Number(i.lop_days) ? days(i.lop_days) : '—') },
    { key: 'gross', header: 'Gross', align: 'right', cell: (i) => <Money value={i.gross} masked={isMaskedField(i, 'gross')} /> },
    { key: 'deductions', header: 'Deductions', align: 'right', cell: (i) => <Money value={i.deductions} masked={isMaskedField(i, 'deductions')} /> },
    { key: 'net', header: 'Net', align: 'right', cell: (i) => <strong><Money value={i.net} masked={isMaskedField(i, 'net')} /></strong> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (i) => (
        <div className="table__actions">
          {i.lines && <Button size="sm" aria-label={`Lines for ${who(i)}`} onClick={() => setLines(i)}>Lines</Button>}
          {editable && manage && <Button size="sm" aria-label={`Adjust ${who(i)}`} onClick={() => setAdjust({ employeeId: i.employee_id, name: who(i) })}>Adjust</Button>}
          {r.status === 'computed' && manage && notNegative(i) && (
            <Button size="sm" loading={action.isBusy(`hold-${i.employee_id}`)} aria-label={i.hold ? `Take off hold: ${who(i)}` : `Hold pay for ${who(i)}`} onClick={() => void setHold(i, !i.hold)}>{i.hold ? 'Take off hold' : 'Hold'}</Button>
          )}
          {mayRelease(i) && <Button size="sm" variant="primary" aria-label={`Release held pay for ${who(i)}`} onClick={() => setRelease(i)}>Release</Button>}
        </div>
      ),
    },
  ];
  const adjustmentColumns: Column<Adjustment>[] = [
    { key: 'label', header: 'Label', card: 'title', cell: (a) => <>{a.label}{a.note && <div className="table__cell-sub">{a.note}</div>}</> },
    { key: 'employee', header: 'Employee', card: 'subtitle', cell: (a) => nameOf(a.employee_id) },
    { key: 'what', header: 'Kind', cell: (a) => (a.kind === 'lop_days' ? 'LOP days' : a.kind === 'earning' ? 'Earning' : 'Deduction') },
    { key: 'amount', header: 'Amount', align: 'right', cell: (a) => (isMaskedField(a, 'amount') ? <Money value={null} masked /> : a.kind === 'lop_days' ? fmtNumber(a.amount ?? 0) : <Money value={a.amount} />) },
    { key: 'by', header: 'By', cell: (a) => a.created_by_name },
    ...(editable && manage ? [{ key: 'actions', header: 'Actions', card: 'actions', cell: (a: Adjustment) => <div className="table__actions"><Button size="sm" variant="danger-ghost" loading={action.isBusy(`adj-${a.id}`)} aria-label={`Remove ${a.label ?? 'adjustment'}`} onClick={() => void removeAdjustment(a)}>Remove</Button></div> } as Column<Adjustment>] : []),
  ];

  const search = text.trim().toLowerCase();
  const shown = r.items.filter((i) => !search || `${i.employee_name ?? ''} ${i.employee_code}`.toLowerCase().includes(search));
  const download = (path: string, label: string) => <DownloadButton url={`${base}/${path}`} fileName={`payroll-${r.period}-${path}`}>{label}</DownloadButton>;
  return (
    <div className="stack-4">
      <div className="cluster">
        <StatusBadge status={r.status} />
        {r.kind === 'fnf' && <Badge tone="info">F&amp;F</Badge>}
        <span className="text-sm text-2">{r.computed_at ? `Computed ${fmtDateTime(r.computed_at)}` : 'Not computed'}</span>
      </div>
      {needsLock && !closed && <Alert tone="warn">Lock attendance for {r.period} before finalizing payroll.</Alert>}
      {manage && r.status === 'computed' && unacknowledged && <Alert tone="warn">Acknowledge the {warnings} warning(s) before submitting for approval.</Alert>}
      {(r.excluded ?? 0) > 0 && <Alert>{r.excluded} {r.excluded === 1 ? 'person is' : 'people are'} above your salary level, so they are left out of this list and these totals.</Alert>}
      {(r.totals?.employees != null || isMaskedField(r, 'totals')) && (
        <div className="run-totals"><StatGrid label="Totals">
          <StatTile label="Employees" value={r.totals?.employees != null ? fmtNumber(r.totals.employees) : fmtNumber(r.total)} />
          <StatTile label="Gross" value={<Money value={r.totals?.gross} masked={isMaskedField(r, 'totals')} />} />
          <StatTile label="Net" value={<Money value={r.totals?.net} masked={isMaskedField(r, 'totals')} />} />
          <StatTile label="Employer cost" value={<Money value={r.totals?.employerCost} masked={isMaskedField(r, 'totals')} />} />
        </StatGrid></div>
      )}
      <div className="cluster">
        {r.items.length > 0 && <RevealToggle revealed={revealed} loading={revealing} onChange={setRevealed} />}
        {manage && editable && <Button variant="primary" loading={action.isBusy('compute')} onClick={() => void action.run('compute', () => post('compute'), 'Computed')}>{r.status === 'draft' ? 'Compute' : 'Recompute'}</Button>}
        {manage && r.status === 'computed' && unacknowledged && <Button onClick={() => setDialog('ack')}>Acknowledge {warnings} warning(s)</Button>}
        {manage && r.status === 'computed' && !unacknowledged && <Button variant="primary" loading={action.isBusy('submit')} onClick={() => void action.run('submit', () => post('submit'), 'Sent for approval')}>Submit for approval</Button>}
        {r.status === 'pending' && can('payroll.approve') && <ButtonLink to="/approvals">Review in Approvals</ButtonLink>}
        {manage && r.status === 'approved' && !needsLock && <Button variant="primary" onClick={() => setDialog('finalize')}>Finalize</Button>}
        {manage && r.status === 'approved' && <Button onClick={() => setDialog('reopen')}>Reopen</Button>}
        {manage && r.status === 'finalized' && <Button variant="primary" onClick={() => setDialog('paid')}>Mark paid</Button>}
        {manage && editable && <Button variant="danger-ghost" onClick={() => setDialog('cancel')}>Cancel run</Button>}
      </div>
      {canAny('payroll.read', 'payroll.manage') && (
        <div className="cluster" role="group" aria-label="Downloads">
          {download('register.xlsx', 'Register Excel')}
          {download('register.csv', 'Register CSV')}
          {closed && download('bank.csv', 'Bank CSV')}
          {closed && released > 0 && download('bank-released.csv', `Bank file for released pay (${released})`)}
          {closed && statutory && download('pf.csv', 'PF CSV')}
          {closed && statutory && download('esi.csv', 'ESI CSV')}
        </div>
      )}
      {r.kind === 'fnf' && r.employee_id && manage && editable && (
        <Card title="Full and final inputs" headingLevel={3} actions={<Button size="sm" onClick={() => setAdjust({ employeeId: r.employee_id!, name: employeeName ?? 'the leaver' })}>Add adjustment</Button>}>
          <FnfSuggestions employeeId={r.employee_id} />
        </Card>
      )}
      <div className="stack-2">
        <h3>Employees</h3>
        {r.items.length > ITEMS_PAGE_SIZE && <FilterBar search={{ label: 'Search employees in this run', placeholder: 'Name or code', value: text, onChange: (v) => { setText(v); setPage(1); } }} />}
        {r.total > SERVER_PAGE_SIZE && (
          <div className="cluster">
            <span className="text-sm text-2 tnum">Showing {(serverPage - 1) * SERVER_PAGE_SIZE + 1} to {Math.min(serverPage * SERVER_PAGE_SIZE, r.total)} of {r.total} people.</span>
            {serverPage > 1 && <Button size="sm" onClick={() => { setServerPage(serverPage - 1); setPage(1); }}>Previous {SERVER_PAGE_SIZE}</Button>}
            {serverPage * SERVER_PAGE_SIZE < r.total && <Button size="sm" onClick={() => { setServerPage(serverPage + 1); setPage(1); }}>Next {SERVER_PAGE_SIZE}</Button>}
          </div>
        )}
        {!r.items.length
          ? <EmptyState compact title={r.status === 'draft' ? 'Compute the run to see employees' : 'No employees with an active salary in this entity'} />
          : <Table label="Employees in this run" columns={itemColumns} rows={shown.slice((page - 1) * ITEMS_PAGE_SIZE, page * ITEMS_PAGE_SIZE)} rowKey={(i) => i.id} pagination={{ page, pageSize: ITEMS_PAGE_SIZE, total: shown.length, onPage: setPage }} empty={<EmptyState compact title="No one matches" />} />}
      </div>
      {r.adjustments.length > 0 && (
        <div className="stack-2">
          <h3>Adjustments</h3>
          <Table label="Adjustments" columns={adjustmentColumns} rows={r.adjustments} rowKey={(a) => a.id} />
        </div>
      )}
      {lines && <Modal title={`${who(lines)} — lines`} onClose={() => setLines(null)}><PayLines lines={lines.lines ?? []} gross={lines.gross} deductions={lines.deductions} net={lines.net} /></Modal>}
      {adjust && <AdjustmentForm runId={r.id} target={adjust} onClose={() => setAdjust(null)} />}
      {dialog === 'finalize' && <ConfirmDialog title="Finalize payroll" confirmLabel="Finalize" danger message={`This locks ${r.period} for ${r.legal_entity_name ?? 'this entity'} and publishes payslips to employees. It cannot be undone.`} onClose={() => setDialog(null)} onConfirm={async () => { await post('finalize'); toast('Finalized; payslips published'); }} />}
      {dialog === 'cancel' && <ConfirmDialog title="Cancel payroll run" confirmLabel="Cancel run" danger message={`Cancel the ${r.period} run? Computed results are discarded.`} onClose={() => setDialog(null)} onConfirm={async () => { await post('cancel'); toast('Cancelled'); }} />}
      {dialog === 'reopen' && <ConfirmDialog title="Reopen payroll run" confirmLabel="Reopen run" message={`Send the ${r.period} run back to draft. It must be recomputed and approved again.`} onClose={() => setDialog(null)} onConfirm={async () => { await post('reopen'); toast('Reopened as a draft. Recompute it.'); }} />}
      {dialog === 'ack' && <ConfirmDialog title="Acknowledge warnings" requireComment minCommentLength={5} commentLabel="Why the run can proceed" confirmLabel="Acknowledge" message="This note is kept in the audit history." onClose={() => setDialog(null)} onConfirm={async (note) => { await post('acknowledge-warnings', { note }); toast('Acknowledged'); }} />}
      {dialog === 'paid' && <ConfirmDialog title="Record payment" requireComment minCommentLength={3} commentLabel="Bank batch reference" confirmLabel="Mark paid" message={`Record the ${r.period} run as paid.`} onClose={() => setDialog(null)} onConfirm={async (paymentReference) => { await post('paid', { paymentReference }); toast('Marked paid'); }} />}
      {release && (
        <ConfirmDialog
          title="Release held pay"
          requireComment
          minCommentLength={5}
          commentLabel="Reason"
          confirmLabel="Release pay"
          message={<>Release {release.net === null ? 'the held pay' : <Money value={release.net} />} to {who(release)}. Their payslip is published, and the amount goes out in the bank file for released pay. The run's own bank file does not change.</>}
          onClose={() => setRelease(null)}
          onConfirm={async (reason) => { await post(`items/${release.employee_id}/release`, { reason }); toast('Released. Download the bank file for released pay.'); }}
        />
      )}
    </div>
  );
}

function AdjustmentForm({ runId, target, onClose }: { runId: string; target: AdjustTarget; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: 'earning', label: '', amount: '', taxable: true, note: '' });
  const days = f.kind === 'lop_days';
  const form = useSubmit(async () => {
    await api.post(`${RUNS_URL}/${runId}/adjustments`, { employeeId: target.employeeId, kind: f.kind, label: f.label, amount: Number(f.amount), taxable: f.taxable, note: f.note || null });
    toast('Added. Recompute the run.');
    await invalidateApi(RUNS_URL);
    onClose();
  }, { validate: (): FieldErrors => (!Number(f.amount) ? { amount: days ? 'Enter the days to add or remove' : 'Enter an amount' } : !days && Number(f.amount) < 0 ? { amount: 'Amounts are positive. Choose earning or deduction.' } : {}) });
  return (
    <Modal title={`Adjustment — ${target.name}`} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Select label="Kind" value={f.kind} options={[{ value: 'earning', label: 'Earning' }, { value: 'deduction', label: 'Deduction' }, { value: 'lop_days', label: 'LOP days correction' }]} onChange={(e) => setF({ ...f, kind: e.target.value })} />
          <Input label={days ? 'Days (+ adds LOP, − removes)' : `Amount (${currencySymbol()})`} required type="number" inputMode="decimal" step={days ? 0.5 : 0.01} error={form.errors['amount']} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <Input label="Label" hint="Shown on the payslip, such as Arrears or Notice recovery" required minLength={2} maxLength={80} error={form.errors['label']} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        {f.kind === 'earning' && <Checkbox label="Taxable" checked={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.checked })} />}
        <Input label="Note" maxLength={500} error={form.errors['note']} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Add" onCancel={onClose} />
      </form>
    </Modal>
  );
}
