import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api, ApiError, qs, type Paged } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Badge, StatusBadge } from '../components/Badge';
import { Button, ButtonAnchor } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/ErrorState';
import { FileUpload } from '../components/FileUpload';
import { FilterBar } from '../components/FilterBar';
import { useDebouncedValue } from '../components/hooks';
import { Input } from '../components/Input';
import { KeyValue } from '../components/KeyValue';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Picker, type PickerItem } from '../components/Picker';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { SkeletonPage, SkeletonRows } from '../components/Skeleton';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { useTableState } from '../components/useTableState';
import { AttendanceCalendar } from '../features/attendance/AttendanceCalendar';
import { EmployeeDocuments } from '../features/documents/EmployeeDocuments';
import { employeeName, searchEmployees } from '../features/employees/searchEmployees';
import { PersonalDetails } from '../features/profile/PersonalDetails';
import { fmtDate, fmtDateTime } from '../format';
import { invalidateApi, useApiQuery } from '../lib/query';

const EMPLOYMENT_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];
const STATUSES = ['pre_joining', 'active', 'on_notice', 'exited', 'inactive'];
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: label(v) }));

interface OrgUnit { id: string; name: string; legal_entity_id?: string }
interface Org { branches: OrgUnit[]; departments: OrgUnit[]; legalEntities: OrgUnit[] }
interface EmployeeRow {
  id: string; employee_code: string; first_name: string; last_name: string | null; work_email: string | null; designation: string | null;
  department_name: string | null; branch_name: string; date_of_joining: string; status: string;
}
interface Employee extends EmployeeRow {
  view: 'full' | 'directory'; version: number; phone: string | null; date_of_birth: string | null; legal_entity_id: string; legal_entity_name: string; branch_id: string; department_id: string | null;
  grade: string | null; employment_type: string; reporting_manager_id: string | null; reporting_manager_name: string | null; probation_end_date: string | null; confirmation_date: string | null; contract_end_date: string | null; exit_date: string | null;
}
type EmployeeList = Paged<EmployeeRow> & { view: 'full' | 'directory' };

export function Employees() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const org = useApiQuery<Org>('/api/v1/org');

  const baseColumns = useMemo<Column<EmployeeRow>[]>(() => [
    { key: 'name', header: 'Name', required: true, sortable: true, card: 'title', cell: (e) => <span className="emp-cell"><Avatar name={employeeName(e)} size="sm" /><span><Link to={`/employees/${e.id}`}>{employeeName(e)}</Link><div className="table__cell-sub">{e.work_email}</div></span></span> },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (e) => <span className="mono">{e.employee_code}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (e) => <StatusBadge status={e.status} /> },
    { key: 'designation', header: 'Designation', cell: (e) => e.designation ?? '—' },
    { key: 'department', header: 'Department', cell: (e) => e.department_name ?? '—' },
    { key: 'branch', header: 'Branch', cell: (e) => e.branch_name },
    { key: 'joined', header: 'Joined', cell: (e) => fmtDate(e.date_of_joining) },
  ], []);
  const table = useTableState('employees', baseColumns);
  const { branchId = '', departmentId = '', status = '' } = table.filters;
  const url = `/api/v1/employees${qs({ search: debounced, branchId, departmentId, status, page: table.page, pageSize: 25 })}`;
  const query = useApiQuery<EmployeeList>(url, { placeholderData: (previous) => previous });
  const full = query.data?.view === 'full';
  const columns = full ? baseColumns : baseColumns.filter((c) => c.key !== 'joined');
  const onSearch = (v: string) => { setSearch(v); table.setPage(1); };

  return (
    <div className="stack-4">
      <PageHeader
        title="Employees"
        description={full ? 'Employee master' : 'Directory of active colleagues'}
        actions={can('employees.manage') && <><Button onClick={() => setImporting(true)}>Bulk import</Button><Button variant="primary" onClick={() => setCreating(true)}>Add employee</Button></>}
      />
      <FilterBar
        search={{ label: 'Search employees', placeholder: 'Search name, code or email', value: search, onChange: onSearch }}
        activeCount={table.activeFilterCount}
        onClear={table.clearFilters}
      >
        <Select label="Branch" hideLabel placeholder="All branches" value={branchId} options={org.data?.branches.map((b) => ({ value: b.id, label: b.name }))} onChange={(e) => table.setFilter('branchId', e.target.value)} />
        <Select label="Department" hideLabel placeholder="All departments" value={departmentId} options={org.data?.departments.map((d) => ({ value: d.id, label: d.name }))} onChange={(e) => table.setFilter('departmentId', e.target.value)} />
        {full && <Select label="Status" hideLabel placeholder="Any status" value={status} options={asOptions(STATUSES)} onChange={(e) => table.setFilter('status', e.target.value)} />}
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Users />} title="No employees found" description={search || table.activeFilterCount ? 'Try a different search or clear the filters.' : undefined} />}>
        {(d) => (
          <Table
            label="Employees"
            columns={columns}
            rows={d.items}
            rowKey={(e) => e.id}
            hidden={table.hidden}
            onToggleColumn={table.toggleColumn}
            views={table.views}
            refreshing={query.isPlaceholderData}
            pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }}
          />
        )}
      </QueryState>
      {creating && org.data && <EmployeeForm org={org.data} onClose={() => setCreating(false)} onSaved={(id) => nav(`/employees/${id}`)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

interface Duplicate { id: string; reason: string; name: string; employee_code: string }

const FIELD_COLUMNS: Record<string, keyof Employee> = {
  employeeCode: 'employee_code', firstName: 'first_name', lastName: 'last_name', workEmail: 'work_email', phone: 'phone', dateOfBirth: 'date_of_birth', legalEntityId: 'legal_entity_id', branchId: 'branch_id', departmentId: 'department_id',
  designation: 'designation', grade: 'grade', employmentType: 'employment_type', status: 'status', reportingManagerId: 'reporting_manager_id', dateOfJoining: 'date_of_joining', probationEndDate: 'probation_end_date', confirmationDate: 'confirmation_date', contractEndDate: 'contract_end_date',
};

function EmployeeForm({ org, existing, onClose, onSaved }: { org: Org; existing?: Employee; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const [k, col] of Object.entries(FIELD_COLUMNS)) start[k] = existing ? String(existing[col] ?? '') : '';
    if (!existing) { start['legalEntityId'] = org.legalEntities[0]?.id ?? ''; start['employmentType'] = 'permanent'; start['status'] = 'active'; }
    return start;
  });
  const [manager, setManager] = useState<PickerItem | null>(existing?.reporting_manager_id ? { id: existing.reporting_manager_id, label: existing.reporting_manager_name ?? 'Current manager' } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [dups, setDups] = useState<Duplicate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const v = (k: string) => f[k] ?? '';
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const payload = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const [k, val] of Object.entries({ ...f, reportingManagerId: manager?.id ?? '' })) {
      if (val === '' && (k === 'employmentType' || k === 'status')) continue;
      out[k] = val === '' ? null : val;
    }
    return out;
  };
  const submit = async (confirmDuplicate = false) => {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      if (existing) {
        const p = payload();
        const changes: Record<string, string | null> = {};
        for (const [k, col] of Object.entries(FIELD_COLUMNS)) if ((p[k] ?? null) !== (existing[col] ?? null)) changes[k] = p[k] ?? null;
        await api.patch(`/api/v1/employees/${existing.id}`, { changes, expectedVersion: existing.version });
        toast('Employee updated');
        await invalidateApi('/api/v1/employees');
        onSaved(existing.id);
        onClose();
      } else {
        const r = await api.post<{ id: string }>('/api/v1/employees', { employee: payload(), confirmDuplicate });
        toast('Employee created');
        await invalidateApi('/api/v1/employees');
        onSaved(r.id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.problem['confirmable']) setDups((e.problem['duplicates'] as Duplicate[] | undefined) ?? []);
      else if (e instanceof ApiError && e.errors.length) { setErrors(e.fieldErrors()); setError('Please correct the highlighted fields'); }
      else setError(e);
    } finally { setBusy(false); }
  };
  const branches = org.branches.filter((b) => b.legal_entity_id === v('legalEntityId'));
  return (
    <Modal title={existing ? 'Edit employee' : 'Add employee'} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }}>
        <div className="columns-form">
          <Input label="Employee code" required error={errors['employeeCode']} value={v('employeeCode')} onChange={set('employeeCode')} />
          <Input label="First name" required error={errors['firstName']} autoComplete="off" value={v('firstName')} onChange={set('firstName')} />
          <Input label="Last name" value={v('lastName')} autoComplete="off" onChange={set('lastName')} />
          <Input label="Work email" type="email" inputMode="email" error={errors['workEmail']} value={v('workEmail')} onChange={set('workEmail')} />
          <Input label="Phone" type="tel" inputMode="tel" error={errors['phone']} value={v('phone')} onChange={set('phone')} />
          <DatePicker label="Date of birth" error={errors['dateOfBirth']} value={v('dateOfBirth')} onChange={set('dateOfBirth')} />
          <Select label="Legal entity" required value={v('legalEntityId')} options={org.legalEntities.map((l) => ({ value: l.id, label: l.name }))} onChange={(e) => setF({ ...f, legalEntityId: e.target.value, branchId: '' })} />
          <Select label="Branch" required placeholder="Select…" error={errors['branchId']} value={v('branchId')} options={branches.map((b) => ({ value: b.id, label: b.name }))} onChange={set('branchId')} />
          <Select label="Department" placeholder="None" value={v('departmentId')} options={org.departments.map((d) => ({ value: d.id, label: d.name }))} onChange={set('departmentId')} />
          <Input label="Designation" value={v('designation')} onChange={set('designation')} />
          <Input label="Grade" value={v('grade')} onChange={set('grade')} />
          <Select label="Employment type" value={v('employmentType')} options={asOptions(EMPLOYMENT_TYPES)} onChange={set('employmentType')} />
          <Select label="Status" value={v('status')} options={asOptions(STATUSES)} onChange={set('status')} />
          <DatePicker label="Date of joining" required error={errors['dateOfJoining']} value={v('dateOfJoining')} onChange={set('dateOfJoining')} />
          <DatePicker label="Probation end" error={errors['probationEndDate']} value={v('probationEndDate')} onChange={set('probationEndDate')} />
          <DatePicker label="Confirmation date" error={errors['confirmationDate']} value={v('confirmationDate')} onChange={set('confirmationDate')} />
          <DatePicker label="Contract end" error={errors['contractEndDate']} value={v('contractEndDate')} onChange={set('contractEndDate')} />
        </div>
        <Picker
          label="Reporting manager"
          placeholder="Search manager"
          queryKey="active-employees"
          error={errors['reportingManagerId']}
          search={async (t) => (await searchEmployees(t, 'active')).filter((x) => x.id !== existing?.id)}
          value={manager}
          onChange={setManager}
        />
        {dups && (
          <Alert tone="warn">
            <div className="stack-2">
              <strong>Possible duplicate</strong>
              {dups.map((d) => <div key={d.id}>{d.reason}: <Link to={`/employees/${d.id}`}>{d.name} ({d.employee_code})</Link></div>)}
              <div><Button size="sm" onClick={() => void submit(true)}>This is a different person, create anyway</Button></div>
            </div>
          </Alert>
        )}
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} loadingText="Saving…">Save</Button></div></div>
      </form>
    </Modal>
  );
}

/** CSV with a header row; parsed in the browser, validated on the server (dry run first). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cur.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(cell);
      cell = '';
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
    } else cell += ch;
  }
  cur.push(cell);
  if (cur.some((c) => c.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const TEMPLATE = 'employeeCode,firstName,lastName,workEmail,phone,dateOfBirth,branchCode,departmentCode,designation,grade,employmentType,dateOfJoining,probationEndDate,contractEndDate,reportingManagerCode\n';

interface ImportResult { committed?: boolean; summary: { total: number; valid: number; errors: number; warnings: number }; report?: { row: number; employeeCode: string; errors: string[]; warnings: string[] }[] }

function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setRows(null);
    setError(null);
    if (!f) return;
    const parsed = parseCsv(await f.text());
    setRows(parsed);
    if (!parsed.length) setError('The file has no data rows');
  };
  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ImportResult>('/api/v1/employees/import', { dryRun, rows });
      setResult(r);
      if (r.committed) { toast(`Imported ${r.summary.valid} employees`); await invalidateApi('/api/v1/employees'); onClose(); }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const reportColumns: Column<NonNullable<ImportResult['report']>[number]>[] = [
    { key: 'row', header: 'Row', card: 'title', cell: (r) => `Row ${r.row}` },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (r) => r.employeeCode },
    { key: 'problems', header: 'Problems', cell: (r) => <div className="stack-1">{r.errors.map((x) => <Badge key={x} tone="danger">{x}</Badge>)}{r.warnings.map((x) => <Badge key={x} tone="warn">{x}</Badge>)}</div> },
  ];
  return (
    <Modal
      title="Bulk import employees"
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button disabled={!rows?.length} loading={busy} onClick={() => void run(true)}>Validate</Button>
          <Button variant="primary" disabled={!result || result.summary.errors > 0} loading={busy} onClick={() => void run(false)}>Import {result ? result.summary.valid : ''} employees</Button>
        </>
      )}
    >
      <div className="stack-3">
        <p className="text-2 text-sm">Upload a CSV. Every row is validated first; nothing is saved unless all rows are valid.</p>
        <div><ButtonAnchor size="sm" variant="ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="employee-import-template.csv">Download template</ButtonAnchor></div>
        <FileUpload label="CSV file" accept=".csv,text/csv" file={file} onChange={(f) => void choose(f)} />
        {rows && <p className="text-sm text-2">{rows.length} row(s) read.</p>}
        {result && (result.summary.errors
          ? <InlineError error={`${result.summary.errors} row(s) have errors. Fix the file and validate again.`} />
          : <Alert tone="ok">All {result.summary.total} rows are valid{result.summary.warnings ? ` (${result.summary.warnings} with warnings)` : ''}.</Alert>)}
        {!!result?.report?.length && <Table label="Import report" columns={reportColumns} rows={result.report} rowKey={(r) => String(r.row)} />}
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

const BLANK_BANK = { accountHolder: '', accountNumber: '', ifsc: '', bankName: '' };

function BankPanel({ employeeId }: { employeeId: string }) {
  const { can } = useAuth();
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(false);
  const bank = useApiQuery<{ accountHolder: string; accountNumberMasked: string; ifsc: string; bankName: string | null } | null>(show ? `/api/v1/employees/${employeeId}/bank-account` : null, { gcTime: 0, staleTime: 0 });
  return (
    <Card title={<span className="cluster">Bank details<Badge tone="info">Restricted</Badge></span>} actions={can('employees.bank.manage') && <Button size="sm" onClick={() => setEdit(true)}>Update</Button>}>
      {!show
        ? <div className="cluster"><Button size="sm" onClick={() => setShow(true)}>Show masked details</Button><span className="text-sm text-2">Viewing is recorded in the audit log.</span></div>
        : (
          <QueryState query={bank} loading={<SkeletonRows rows={2} />} isEmpty={(d) => !d} empty={<EmptyState compact title="No bank account on file." />}>
            {(d) => d && <KeyValue items={[{ label: 'Account holder', value: d.accountHolder }, { label: 'Account number', value: <span className="mono">{d.accountNumberMasked}</span> }, { label: 'IFSC', value: <span className="mono">{d.ifsc}</span> }, { label: 'Bank', value: d.bankName }]} />}
          </QueryState>
        )}
      {/* Mounted only while open, so the typed account number leaves memory when the dialog closes. */}
      {edit && <BankForm employeeId={employeeId} onClose={() => setEdit(false)} onSaved={() => { setShow(true); void invalidateApi(`/api/v1/employees/${employeeId}/bank-account`); }} />}
    </Card>
  );
}

function BankForm({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(BLANK_BANK);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.put(`/api/v1/employees/${employeeId}/bank-account`, { ...f, bankName: f.bankName || null });
      toast('Bank details updated');
      onSaved();
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Update bank details" onClose={onClose}>
      <form className="stack-3" autoComplete="off" onSubmit={submit}>
        <Alert>The full account number is encrypted and can never be displayed again after saving, only the last 4 digits.</Alert>
        <Input label="Account holder" required value={f.accountHolder} onChange={(e) => setF({ ...f, accountHolder: e.target.value })} />
        <Input label="Account number" hint="9 to 18 digits" required inputMode="numeric" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '') })} />
        <Input label="IFSC" required placeholder="SBIN0001234" value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} />
        <Input label="Bank name" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div></div>
      </form>
    </Modal>
  );
}

interface HistoryItem { id: string; created_at: string; actor_name: string | null; action: string; change_metadata: { changes?: Record<string, { from: unknown; to: unknown }>; newLast4?: string } | null }

const historyColumns: Column<HistoryItem>[] = [
  { key: 'when', header: 'When', card: 'title', cell: (h) => fmtDateTime(h.created_at) },
  { key: 'who', header: 'Who', cell: (h) => h.actor_name ?? 'System' },
  { key: 'action', header: 'Action', cell: (h) => h.action.replace('employee.', '').replace(/_/g, ' ') },
  {
    key: 'details', header: 'Details', cell: (h) => {
      const changes = h.change_metadata?.changes;
      if (changes) return <div className="stack-1">{Object.entries(changes).map(([k, v]) => <div key={k}><strong>{k}</strong>: {String(v.from ?? '—')} → {String(v.to ?? '—')}</div>)}</div>;
      return h.change_metadata?.newLast4 ? `Account ending ${h.change_metadata.newLast4}` : '';
    },
  },
];

function EmployeeHistory({ id }: { id: string }) {
  const query = useApiQuery<{ items: HistoryItem[] }>(`/api/v1/employees/${id}/history`);
  return (
    <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No changes recorded" />}>
      {(d) => <Table label="Change history" columns={historyColumns} rows={d.items} rowKey={(h) => h.id} />}
    </QueryState>
  );
}

type ProfileTab = 'overview' | 'personal' | 'attendance' | 'documents' | 'history';

export function EmployeeProfile() {
  const { id = '' } = useParams();
  const query = useApiQuery<Employee>(`/api/v1/employees/${id}`);
  return <QueryState query={query} loading={<SkeletonPage />}>{(e) => <ProfileBody employee={e} id={id} />}</QueryState>;
}

function ProfileBody({ employee: e, id }: { employee: Employee; id: string }) {
  const { can, canAny, me, hasFeature } = useAuth();
  const [editing, setEditing] = useState(false);
  const org = useApiQuery<Org>(can('employees.manage') ? '/api/v1/org' : null);
  const self = me?.user.employeeId === id;
  const tabs: TabItem<ProfileTab>[] = [{ key: 'overview', label: 'Overview' }];
  if (e.view === 'full' && (self || can('employees.read'))) tabs.push({ key: 'personal', label: 'Personal details' });
  if (hasFeature('FEATURE_ATTENDANCE') && (self || canAny('attendance.read', 'attendance.team.read'))) tabs.push({ key: 'attendance', label: 'Attendance' });
  if (hasFeature('FEATURE_DOCUMENTS') && (self || canAny('documents.read', 'documents.manage'))) tabs.push({ key: 'documents', label: 'Documents' });
  if (can('employees.read')) tabs.push({ key: 'history', label: 'Change history' });
  const [tab, setTab] = useTabParam(tabs.map((t) => t.key));
  const full = e.view === 'full';
  return (
    <div className="stack-4">
      <PageHeader
        title={employeeName(e)}
        meta={<><span className="mono">{e.employee_code}</span><span>{e.designation ?? 'No designation'}</span><StatusBadge status={e.status} /></>}
        actions={can('employees.manage') && full && <Button onClick={() => setEditing(true)}>Edit</Button>}
      />
      <Tabs label="Employee record" idBase="employee" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel idBase="employee" tab={tab}>
        {tab === 'overview' && (
          <div className="stack-4">
            <Card>
              <KeyValue items={[
                { label: 'Work email', value: e.work_email }, { label: 'Branch', value: e.branch_name }, { label: 'Department', value: e.department_name },
                ...(full ? [
                  { label: 'Phone', value: e.phone }, { label: 'Date of birth', value: fmtDate(e.date_of_birth) }, { label: 'Legal entity', value: e.legal_entity_name }, { label: 'Grade', value: e.grade },
                  { label: 'Employment type', value: label(e.employment_type) },
                  { label: 'Reporting manager', value: e.reporting_manager_id ? <Link to={`/employees/${e.reporting_manager_id}`}>{e.reporting_manager_name}</Link> : null },
                  { label: 'Date of joining', value: fmtDate(e.date_of_joining) }, { label: 'Probation end', value: fmtDate(e.probation_end_date) }, { label: 'Confirmation date', value: fmtDate(e.confirmation_date) },
                  { label: 'Contract end', value: fmtDate(e.contract_end_date) }, { label: 'Exit date', value: fmtDate(e.exit_date) },
                ] : []),
              ]} />
            </Card>
            {full && (self || can('employees.bank.read')) && <BankPanel employeeId={id} />}
          </div>
        )}
        {tab === 'personal' && <PersonalDetails employeeId={id} />}
        {tab === 'attendance' && <AttendanceCalendar employeeId={id} self={false} />}
        {tab === 'documents' && <EmployeeDocuments employeeId={id} />}
        {tab === 'history' && <EmployeeHistory id={id} />}
      </TabPanel>
      {editing && org.data && <EmployeeForm org={org.data} existing={e} onClose={() => setEditing(false)} onSaved={() => undefined} />}
    </div>
  );
}
