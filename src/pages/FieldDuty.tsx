import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DatePicker } from '../components/DatePicker';
import { EmptyState } from '../components/EmptyState';
import { FilterBar } from '../components/FilterBar';
import { FormActions } from '../components/FormActions';
import { Input, Textarea } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { MaskableText } from '../components/RevealToggle';
import type { PickerItem } from '../components/Picker';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { useSubmit, type FieldErrors } from '../components/useSubmit';
import { useTableState } from '../components/useTableState';
import { EmployeeField } from '../features/employees/EmployeeField';
import { fmtDate, todayLocal } from '../format';
import type { ApiItem, ApiResponse } from '../lib/api-types';
import { invalidateApi, useApiQuery } from '../lib/query';
import '../features/attendance/Roster.css';

type Tab = 'mine' | 'team' | 'all';

const STATUSES = ['pending', 'approved', 'returned', 'rejected', 'cancelled'];
const OUTCOME: Record<string, string> = { completed: 'Completed', partly_completed: 'Partly completed', not_done: 'Not done' };
const PART: Record<string, string> = { full: 'Full day', first_half: 'First half', second_half: 'Second half' };
const reload = () => invalidateApi('/api/v1/field-duty');

/** The API's purpose codes. `field_sampling` reads as generic field work unless the installation is a laboratory. */
const usePurposes = (): Record<string, string> => {
  const { hasFeature } = useAuth();
  return { client_visit: 'Client visit', field_sampling: hasFeature('FEATURE_LAB_COMPETENCY') ? 'Field sampling' : 'Field work', site_audit: 'Site audit', training: 'Training', official_work: 'Official work', other: 'Other' };
};

type Duty = ApiItem<'/api/v1/field-duty/requests'>;
type DutyPage = ApiResponse<'/api/v1/field-duty/requests'>;

const when = (d: Duty) => (d.start_date === d.end_date
  ? `${fmtDate(d.start_date)}${d.day_part === 'full' ? '' : ` · ${PART[d.day_part]!.toLowerCase()}`}`
  : `${fmtDate(d.start_date)} – ${fmtDate(d.end_date)}`);

const Place = ({ d }: { d: Duty }) => <div className="cell-wrap">{d.place}{d.client_name && <div className="table__cell-sub">{d.client_name}{d.reference ? ` · ${d.reference}` : ''}</div>}</div>;

function ReportCell({ d }: { d: Duty }) {
  if (d.status === 'cancelled' && d.cancel_reason) return <div className="text-sm text-2 cell-wrap">Cancelled: {d.cancel_reason}</div>;
  if (!d.outcome) return <>—</>;
  return <div className={d.outcome_note ? 'cell-wrap' : undefined}><StatusBadge status={d.outcome} />{d.outcome_note && <div className="table__cell-sub">{d.outcome_note}</div>}</div>;
}

export function FieldDuty() {
  const { canAny, can, me } = useAuth();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId && can('field_duty.self')) tabs.push({ key: 'mine', label: 'My field duty' });
  if (can('field_duty.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('field_duty.read', 'field_duty.approve', 'field_duty.manage')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useTabParam<Tab>(tabs.length ? tabs.map((t) => t.key) : ['mine']);
  return (
    <div className="stack-4">
      <PageHeader title="Field duty" description="Work away from the workplace: client sites, audits, training. Approved days count as on duty in attendance, without office punches." />
      {!tabs.length ? <EmptyState title="You do not have access to field duty." /> : (
        <>
          {tabs.length > 1 && <Tabs label="Field duty" idBase="field-duty" tabs={tabs} value={tab} onChange={setTab} />}
          <TabPanel idBase="field-duty" tab={tab}>
            {tab === 'mine' ? <Mine /> : <Everyone key={tab} scope={tab} />}
          </TabPanel>
        </>
      )}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const purposes = usePurposes();
  const [page, setPage] = useState(1);
  const query = useApiQuery<DutyPage>(`/api/v1/field-duty/requests${qs({ scope: 'mine', page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [form, setForm] = useState(false);
  const [withdraw, setWithdraw] = useState<Duty | null>(null);
  const [cancel, setCancel] = useState<Duty | null>(null);
  const [report, setReport] = useState<Duty | null>(null);
  const today = query.data?.today ?? todayLocal();
  const columns: Column<Duty>[] = [
    { key: 'when', header: 'When', card: 'title', cell: (d) => <span className="tnum">{when(d)}</span> },
    { key: 'purpose', header: 'Purpose', cell: (d) => purposes[d.purpose] ?? d.purpose },
    { key: 'place', header: 'Place', cell: (d) => <Place d={d} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (d) => <><StatusBadge status={d.status} />{d.recorded_by_other && <div className="table__cell-sub">Recorded by HR</div>}</> },
    { key: 'report', header: 'Report', cell: (d) => <ReportCell d={d} /> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (d) => {
        const buttons = [
          d.status === 'pending' && <Button key="w" size="sm" onClick={() => setWithdraw(d)}>Withdraw</Button>,
          d.status === 'approved' && d.start_date > today && <Button key="c" size="sm" onClick={() => setCancel(d)}>Cancel</Button>,
          d.status === 'approved' && d.start_date <= today && <Button key="r" size="sm" variant="primary" onClick={() => setReport(d)}>{d.outcome ? 'Edit report' : 'Report'}</Button>,
        ].filter(Boolean);
        return buttons.length ? <div className="table__actions">{buttons}</div> : null;
      },
    },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between"><h2>My field duty</h2><Button variant="primary" onClick={() => setForm(true)}>Request field duty</Button></div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<MapPin />} title="No field duty yet." />}>
        {(d) => <Table label="My field duty" columns={columns} rows={d.items} rowKey={(x) => x.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {form && <RequestForm onClose={() => setForm(false)} onSaved={() => toast('Field duty requested; sent for approval')} />}
      {withdraw && (
        <ConfirmDialog
          title="Withdraw field duty request"
          message={`Withdraw your field duty for ${when(withdraw)}?`}
          confirmLabel="Withdraw"
          onClose={() => setWithdraw(null)}
          onConfirm={async () => { await api.post(`/api/v1/field-duty/requests/${withdraw.id}/withdraw`); toast('Request withdrawn'); await reload(); }}
        />
      )}
      {cancel && (
        <ConfirmDialog
          title="Cancel field duty"
          requireComment
          danger
          confirmLabel="Cancel field duty"
          message={`Cancel your approved field duty for ${when(cancel)}?`}
          onClose={() => setCancel(null)}
          onConfirm={async (reason) => { await api.post(`/api/v1/field-duty/requests/${cancel.id}/cancel`, { reason }); toast('Field duty cancelled'); await reload(); }}
        />
      )}
      {report && <ReportForm duty={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function RequestForm({ forOthers, onClose, onSaved }: { forOthers?: boolean; onClose: () => void; onSaved: () => void }) {
  const today = todayLocal();
  const purposes = usePurposes();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ startDate: today, endDate: today, dayPart: 'full', purpose: 'client_visit', place: '', clientName: '', reference: '', reason: '' });
  const set = (p: Partial<typeof f>) => setF((x) => {
    const n = { ...x, ...p };
    if (p.startDate && n.endDate < p.startDate) n.endDate = p.startDate;
    if (n.startDate !== n.endDate) n.dayPart = 'full';
    return n;
  });
  const single = f.startDate === f.endDate;
  const s = useSubmit(async () => {
    await api.post('/api/v1/field-duty/requests', { ...f, employeeId: forOthers ? employee?.id : undefined, clientName: f.clientName || undefined, reference: f.reference || undefined });
    onSaved();
    await reload();
    onClose();
  }, { validate: (): FieldErrors => (forOthers && !employee ? { employeeId: 'Choose an employee' } : {}) });
  return (
    <Modal title={forOthers ? 'Record field duty for an employee' : 'Request field duty'} onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        {forOthers && <EmployeeField required error={s.errors['employeeId']} value={employee} onChange={(e) => { setEmployee(e); s.clearError('employeeId'); }} />}
        <div className="columns-form">
          <DatePicker label="From" required error={s.errors['startDate']} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <DatePicker label="To" required min={f.startDate} error={s.errors['endDate']} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          <Select label="Day" hint={single ? undefined : 'Half days are for a single date'} disabled={!single} value={f.dayPart} options={Object.entries(PART).map(([value, label]) => ({ value, label }))} onChange={(e) => set({ dayPart: e.target.value })} />
        </div>
        <Select label="Purpose" value={f.purpose} options={Object.entries(purposes).map(([value, label]) => ({ value, label }))} onChange={(e) => set({ purpose: e.target.value })} />
        <Input label="Place" hint="Site, client premises or town" required minLength={2} maxLength={200} error={s.errors['place']} value={f.place} onChange={(e) => set({ place: e.target.value })} />
        <div className="columns-form">
          <Input label="Client (optional)" maxLength={200} value={f.clientName} onChange={(e) => set({ clientName: e.target.value })} />
          <Input label="Work order / reference (optional)" maxLength={100} value={f.reference} onChange={(e) => set({ reference: e.target.value })} />
        </div>
        <Textarea label="Reason" required minLength={3} maxLength={1000} error={s.errors['reason']} value={f.reason} placeholder="What the duty is for" onChange={(e) => set({ reason: e.target.value })} />
        <FormActions error={s.error} busy={s.busy} busyLabel="Sending…" submitLabel="Submit for approval" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function ReportForm({ duty, onClose }: { duty: Duty; onClose: () => void }) {
  const toast = useToast();
  const purposes = usePurposes();
  const [outcome, setOutcome] = useState(duty.outcome ?? 'completed');
  const [note, setNote] = useState(duty.outcome_note ?? '');
  const s = useSubmit(async () => {
    await api.post(`/api/v1/field-duty/requests/${duty.id}/report`, { outcome, note: note || undefined });
    toast('Report saved');
    await reload();
    onClose();
  });
  return (
    <Modal title={`Field duty report — ${when(duty)}`} onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        <p className="text-2">{purposes[duty.purpose] ?? duty.purpose} at {duty.place}</p>
        <Select label="Outcome" value={outcome} options={Object.entries(OUTCOME).map(([value, label]) => ({ value, label }))} onChange={(e) => setOutcome(e.target.value)} />
        <Textarea label={outcome === 'completed' ? 'Notes (optional)' : 'What was not done, and why'} required={outcome !== 'completed'} maxLength={2000} error={s.errors['note']} value={note} onChange={(e) => setNote(e.target.value)} />
        <FormActions error={s.error} busy={s.busy} busyLabel="Saving…" submitLabel="Save report" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function Everyone({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me } = useAuth();
  const purposes = usePurposes();
  const [record, setRecord] = useState(false);
  const [cancel, setCancel] = useState<Duty | null>(null);
  const manage = scope === 'all' && can('field_duty.manage');
  const columns: Column<Duty>[] = [
    { key: 'employee', header: 'Employee', card: 'title', required: true, cell: (d) => <>{d.name}<div className="table__cell-sub">{d.employee_code}{d.department ? ` · ${d.department}` : ''}</div></> },
    { key: 'when', header: 'When', card: 'subtitle', cell: (d) => <span className="tnum">{when(d)}</span> },
    { key: 'purpose', header: 'Purpose', cell: (d) => purposes[d.purpose] ?? d.purpose },
    { key: 'place', header: 'Place', cell: (d) => <Place d={d} /> },
    { key: 'reason', header: 'Reason', cell: (d) => <div className="cell-wrap"><MaskableText row={d} field="reason" /></div> },
    { key: 'status', header: 'Status', card: 'status', cell: (d) => <StatusBadge status={d.status} /> },
    { key: 'report', header: 'Report', cell: (d) => <ReportCell d={d} /> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (d) => (manage && d.status === 'approved' && d.employee_id !== me?.user.employeeId ? <div className="table__actions"><Button size="sm" variant="danger-ghost" onClick={() => setCancel(d)}>Cancel</Button></div> : null) },
  ];
  const table = useTableState(`field-duty.${scope}`, columns, { filters: { on: '', status: '' } });
  const { on, status } = table.filters;
  const query = useApiQuery<DutyPage>(`/api/v1/field-duty/requests${qs({ scope, on, status, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-3">
      <div className="filters-labelled">
        <FilterBar
          activeCount={table.activeFilterCount}
          onClear={table.clearFilters}
          actions={manage && <Button variant="primary" onClick={() => setRecord(true)}>Record field duty</Button>}
        >
          <DatePicker label="On date" value={on} onChange={(e) => table.setFilter('on', e.target.value)} />
          <Select label="Status" placeholder="All" value={status} options={STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} onChange={(e) => table.setFilter('status', e.target.value)} />
          <Button onClick={() => table.setFilter('on', query.data?.today ?? todayLocal())}>Out today</Button>
        </FilterBar>
      </div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<MapPin />} title="No field duty matches." />}>
        {(d) => <Table label="Field duty" columns={columns} rows={d.items} rowKey={(x) => x.id} refreshing={query.isPlaceholderData} hidden={table.hidden} onToggleColumn={table.toggleColumn} views={table.views} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {record && <RequestForm forOthers onClose={() => setRecord(false)} onSaved={() => toast('Field duty recorded; sent to the manager for approval')} />}
      {cancel && (
        <ConfirmDialog
          title="Cancel approved field duty"
          danger
          requireComment
          confirmLabel="Cancel field duty"
          message={`Cancel ${cancel.name}'s field duty for ${when(cancel)}? Attendance for those days is recalculated.`}
          onClose={() => setCancel(null)}
          onConfirm={async (reason) => { await api.post(`/api/v1/field-duty/requests/${cancel.id}/cancel`, { reason }); toast('Field duty cancelled'); await reload(); }}
        />
      )}
    </div>
  );
}
