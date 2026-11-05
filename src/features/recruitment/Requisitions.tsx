import { useMemo, useState } from 'react';
import { BriefcaseBusiness, UserPlus } from 'lucide-react';
import { api, qs, type Paged } from '../../api';
import { useAuth } from '../../auth';
import { statusLabel, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { useDebouncedValue } from '../../components/hooks';
import { Input, Textarea } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { Money, formatMoney } from '../../components/Money';
import { RevealToggle } from '../../components/RevealToggle';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { currencySymbol, fmtDate } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { CandidateForm } from './Candidates';
import { OrgFields } from './OrgFields';
import { personName, REQ_STATUSES, SOURCES, STAGE_LABEL, years, type CandidateRow, type Requisition, type RequisitionApplication, type RequisitionRow, type RequisitionValues } from './types';

const REQ_URL = '/api/v1/recruitment/requisitions';
const BLANK: RequisitionValues = { title: '', legalEntityId: '', branchId: '', departmentId: null, designation: '', employmentType: 'permanent', positions: 1, justification: '', budgetCtcMax: '', hiringManagerId: null, targetDate: '' };

const toValues = (r: Requisition): RequisitionValues => ({
  id: r.id, code: r.code, version: r.version, title: r.title, legalEntityId: r.legal_entity_id, branchId: r.branch_id, departmentId: r.department_id, designation: r.designation ?? '', employmentType: r.employment_type,
  positions: r.positions, justification: r.justification, budgetCtcMax: r.budget_ctc_max ?? '', hiringManagerId: r.hiring_manager_id, hiringManagerName: r.hiring_manager_name, targetDate: r.target_date ?? '',
});

export function Requisitions({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const { canAny } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<RequisitionValues | null>(null);
  const columns = useMemo<Column<RequisitionRow>[]>(() => [
    { key: 'position', header: 'Position', required: true, card: 'title', cell: (r) => <><Button variant="link" onClick={() => setOpen(r.id)}>{r.title}</Button><div className="table__cell-sub"><span className="mono">{r.code}</span>{r.designation ? ` · ${r.designation}` : ''} · {statusLabel(r.employment_type)}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'branch', header: 'Branch', cell: (r) => `${r.branch_name}${r.department_name ? ` · ${r.department_name}` : ''}` },
    { key: 'manager', header: 'Hiring manager', cell: (r) => r.hiring_manager_name ?? '—' },
    { key: 'filled', header: 'Filled', align: 'right', cell: (r) => `${r.filled}/${r.positions}` },
    { key: 'pipeline', header: 'Pipeline', cell: (r) => <span className="text-sm">{Object.entries(r.pipeline ?? {}).map(([s, n]) => `${STAGE_LABEL[s] ?? s} ${n}`).join(' · ') || '—'}</span> },
  ], []);
  const table = useTableState('recruitment.requisitions', columns);
  const status = table.filters['status'] ?? '';
  const query = useApiQuery<Paged<RequisitionRow>>(`${REQ_URL}${qs({ status, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-4">
      <FilterBar
        activeCount={table.activeFilterCount}
        onClear={table.clearFilters}
        actions={canAny('recruitment.requisition', 'recruitment.manage') && <Button variant="primary" onClick={() => setEditing({ ...BLANK })}>New requisition</Button>}
      >
        <Select label="Status" hideLabel placeholder="Any status" value={status} options={REQ_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<BriefcaseBusiness />} title="No requisitions" description={status ? 'Try another status.' : 'Raise one to start hiring for a position.'} />}>
        {(d) => <Table label="Job requisitions" columns={columns} rows={d.items} rowKey={(r) => r.id} hidden={table.hidden} onToggleColumn={table.toggleColumn} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {editing && <RequisitionForm init={editing} onClose={() => { if (editing.id) setOpen(editing.id); setEditing(null); }} onSaved={(id) => { setEditing(null); setOpen(id); }} />}
      {open && !editing && <RequisitionDetail id={open} onClose={() => setOpen(null)} onEdit={(r) => { setEditing(toValues(r)); setOpen(null); }} onOpenApp={onOpenApp} />}
    </div>
  );
}

function RequisitionForm({ init, onClose, onSaved }: { init: RequisitionValues; onClose: () => void; onSaved: (id: string) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(init);
  const set = (p: Partial<RequisitionValues>) => setF((c) => ({ ...c, ...p }));
  const form = useSubmit(async () => {
    const body = {
      title: f.title, legalEntityId: f.legalEntityId, branchId: f.branchId, departmentId: f.departmentId, employmentType: f.employmentType, justification: f.justification, hiringManagerId: f.hiringManagerId,
      positions: Number(f.positions), designation: f.designation || null, targetDate: f.targetDate || null, budgetCtcMax: f.budgetCtcMax === '' ? null : Number(f.budgetCtcMax),
    };
    let id = f.id;
    if (id) await api.put(`${REQ_URL}/${id}`, { ...body, expectedVersion: f.version });
    else id = (await api.post<{ id: string }>(REQ_URL, body)).id;
    toast('Draft saved');
    await invalidateApi(REQ_URL);
    onSaved(id);
  });
  return (
    <Modal title={init.id ? `Edit ${init.code}` : 'New job requisition'} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <Input label="Position title" hint="For example, Senior Analyst" required minLength={3} error={form.errors['title']} value={f.title} onChange={(e) => set({ title: e.target.value })} />
        <OrgFields v={f} set={set} errors={form.errors} />
        <div className="columns-form">
          <Input label="Designation" error={form.errors['designation']} value={f.designation} onChange={(e) => set({ designation: e.target.value })} />
          <Input label="Positions" type="number" inputMode="numeric" min={1} max={100} required error={form.errors['positions']} value={f.positions} onChange={(e) => set({ positions: e.target.value })} />
          <DatePicker label="Target joining by" error={form.errors['targetDate']} value={f.targetDate} onChange={(e) => set({ targetDate: e.target.value })} />
          {can('recruitment.compensation') && <Input label={`Budget per position (annual CTC, ${currencySymbol()})`} type="number" inputMode="decimal" min={1} step="0.01" error={form.errors['budgetCtcMax']} value={f.budgetCtcMax} onChange={(e) => set({ budgetCtcMax: e.target.value })} />}
        </div>
        <EmployeeField label="Hiring manager" error={form.errors['hiringManagerId']} value={f.hiringManagerId ? { id: f.hiringManagerId, label: f.hiringManagerName ?? 'Selected' } : null} onChange={(p) => set({ hiringManagerId: p?.id ?? null, hiringManagerName: p?.label })} />
        <Textarea label="Justification" hint="Why the position is needed: backfill, new scope or workload" required minLength={3} error={form.errors['justification']} value={f.justification} onChange={(e) => set({ justification: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save draft" onCancel={onClose} />
      </form>
    </Modal>
  );
}

type ReqAction = 'hold' | 'reopen' | 'close' | 'cancel';
const REQ_ACTION: Record<ReqAction, { title: string; label: string; done: string }> = {
  hold: { title: 'Hold requisition', label: 'Put on hold', done: 'Requisition on hold' }, reopen: { title: 'Reopen requisition', label: 'Reopen', done: 'Requisition reopened' },
  close: { title: 'Close requisition', label: 'Close requisition', done: 'Requisition closed' }, cancel: { title: 'Cancel requisition', label: 'Cancel requisition', done: 'Requisition cancelled' },
};

function RequisitionDetail({ id, onClose, onEdit, onOpenApp }: { id: string; onClose: () => void; onEdit: (r: Requisition) => void; onOpenApp: (id: string) => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const { run, isBusy } = useAction();
  const { query, revealed, setRevealed } = useRevealable<Requisition>(`${REQ_URL}/${id}`);
  const r = query.data;
  const [confirm, setConfirm] = useState<ReqAction | null>(null);
  const [adding, setAdding] = useState(false);
  const manage = can('recruitment.manage');
  const appColumns: Column<RequisitionApplication>[] = [
    { key: 'candidate', header: 'Candidate', card: 'title', cell: (a) => <><Button variant="link" onClick={() => onOpenApp(a.id)}>{personName(a)}</Button>{a.current_company && <div className="table__cell-sub">{a.current_company}</div>}</> },
    { key: 'stage', header: 'Stage', card: 'status', cell: (a) => <StatusBadge status={a.stage} /> },
    { key: 'experience', header: 'Experience', cell: (a) => years(a.experience_months) },
    { key: 'source', header: 'Source', cell: (a) => SOURCES[a.source] ?? a.source },
    { key: 'rating', header: 'Rating', align: 'right', cell: (a) => a.avg_rating ?? '—' },
  ];
  return (
    <Modal title={r ? `${r.code} — ${r.title}` : 'Requisition'} size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(d) => (
          <div className="stack-4">
            <div className="cluster-between">
              <span className="cluster"><StatusBadge status={d.status} /><span className="text-sm text-2">{d.filled}/{d.positions} filled · {statusLabel(d.employment_type)}</span></span>
              <div className="cluster">
                {['draft', 'rejected'].includes(d.status) && (d.created_by === me?.user.id || manage) && (
                  <>
                    <Button size="sm" onClick={() => onEdit(d)}>Edit</Button>
                    <Button size="sm" variant="primary" loading={isBusy('submit')} onClick={() => void run('submit', async () => { await api.post(`${REQ_URL}/${id}/submit`, {}); await invalidateApi(REQ_URL); }, 'Sent for approval')}>Submit for approval</Button>
                  </>
                )}
                {manage && d.status === 'approved' && <Button size="sm" onClick={() => setConfirm('hold')}>Hold</Button>}
                {manage && ['on_hold', 'closed'].includes(d.status) && <Button size="sm" onClick={() => setConfirm('reopen')}>Reopen</Button>}
                {manage && ['approved', 'on_hold'].includes(d.status) && <Button size="sm" onClick={() => setConfirm('close')}>Close requisition</Button>}
                {manage && !['closed', 'cancelled'].includes(d.status) && <Button size="sm" variant="danger-ghost" onClick={() => setConfirm('cancel')}>Cancel requisition</Button>}
              </div>
            </div>
            <KeyValue items={[
              { label: 'Legal entity', value: d.legal_entity_name }, { label: 'Branch', value: `${d.branch_name}${d.department_name ? ` · ${d.department_name}` : ''}` }, { label: 'Hiring manager', value: d.hiring_manager_name },
              { label: 'Requested by', value: d.created_by_name }, { label: 'Target joining', value: d.target_date ? fmtDate(d.target_date) : null }, ...(d.budget_ctc_max || isMaskedField(d, 'budget_ctc_max') ? [{ label: 'Budget per position', value: <span className="cluster"><Money value={d.budget_ctc_max} masked={isMaskedField(d, 'budget_ctc_max')} /><RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="amount" /></span> }] : []),
            ]} />
            <p className="recruit-justification">{d.justification}</p>
            <div className="cluster-between">
              <h3>Candidates</h3>
              {manage && d.status === 'approved' && <Button size="sm" variant="primary" onClick={() => setAdding(true)}>Add candidate</Button>}
            </div>
            {d.applications.length
              ? <Table label="Candidates on this requisition" columns={appColumns} rows={d.applications} rowKey={(a) => a.id} />
              : <EmptyState compact icon={<UserPlus />} title="No candidates yet." />}
          </div>
        )}
      </QueryState>
      {adding && <AddToRequisition requisitionId={id} onClose={() => setAdding(false)} />}
      {confirm && (
        <ConfirmDialog
          title={REQ_ACTION[confirm].title}
          requireComment
          danger={confirm === 'cancel'}
          confirmLabel={REQ_ACTION[confirm].label}
          message="A reason is recorded in the audit history."
          onClose={() => setConfirm(null)}
          onConfirm={async (reason) => { await api.post(`${REQ_URL}/${id}/${confirm}`, { reason }); toast(REQ_ACTION[confirm].done); await invalidateApi(REQ_URL); }}
        />
      )}
    </Modal>
  );
}

function AddToRequisition({ requisitionId, onClose }: { requisitionId: string; onClose: () => void }) {
  const { run, isBusy } = useAction();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search.trim());
  const query = useApiQuery<Paged<CandidateRow>>(`/api/v1/recruitment/candidates${qs({ search: debounced, pageSize: 15 })}`, { placeholderData: (p) => p });
  const add = async (candidateId: string) => {
    const ok = await run(candidateId, async () => { await api.post('/api/v1/recruitment/applications', { requisitionId, candidateId }); await invalidateApi(REQ_URL, '/api/v1/recruitment/candidates'); }, 'Added to the pipeline');
    if (ok) onClose();
  };
  return (
    <Modal title="Add candidate" onClose={onClose}>
      <div className="stack-3">
        <FilterBar search={{ label: 'Search existing candidates', placeholder: 'Search existing candidates', value: search, onChange: setSearch }} actions={<Button onClick={() => setCreating(true)}>New candidate</Button>} />
        <QueryState query={query} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="No candidates found" description="Add them as a new candidate." />}>
          {(d) => (
            <ul className="list-plain recruit-candidate-list" aria-label="Candidates">
              {d.items.map((c) => (
                <li key={c.id}>
                  <span className="grow">{personName(c)}<div className="table__cell-sub">{[c.email ?? c.phone, years(c.experience_months)].filter(Boolean).join(' · ')}</div></span>
                  <Button size="sm" loading={isBusy(c.id)} aria-label={`Add ${personName(c)}`} onClick={() => void add(c.id)}>Add</Button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
      {creating && <CandidateForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); void add(id); }} />}
    </Modal>
  );
}
