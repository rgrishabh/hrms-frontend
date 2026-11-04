import { useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { api, qs, ApiError } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, StatusBadge, Pager, Empty, Modal, Field, useToast, errText, Tabs } from '../ui';
import { PersonalDetails } from './PersonalDetails';
import { AttendanceCalendar } from './MyAttendance';
import { EmployeeDocuments } from './Documents';

const EMPLOYMENT_TYPES = ['permanent', 'probation', 'contract', 'trainee', 'intern', 'consultant'];
const STATUSES = ['pre_joining', 'active', 'on_notice', 'exited', 'inactive'];
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const fullName = (e: any) => `${e.first_name} ${e.last_name ?? ''}`.trim();

export function Employees() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const url = `/api/v1/employees${qs({ search, branchId, departmentId, status, page, pageSize: 25 })}`;
  const { data, loading, error, reload } = useLoad(() => api.get(url), [url]);
  const full = data?.view === 'full';
  return (
    <div className="stack">
      <div className="row"><div><h1>Employees</h1><p className="sub" style={{ marginBottom: 0 }}>{full ? 'Employee master' : 'Directory of active colleagues'}</p></div><span className="spacer" />
        {can('employees.manage') && <><button className="btn" onClick={() => setImporting(true)}>Bulk import</button><button className="btn primary" onClick={() => setCreating(true)}>Add employee</button></>}</div>
      <div className="card row">
        <input placeholder="Search name, code or email" aria-label="Search employees" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ flex: '1 1 220px' }} />
        <select aria-label="Branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}><option value="">All branches</option>{org.data?.branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}><option value="">All departments</option>{org.data?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        {full && <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data?.items.length ? <Empty>No employees found.</Empty> : (
        <>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Branch</th>{full && <th>Joined</th>}<th>Status</th></tr></thead>
            <tbody>{data.items.map((e: any) => (
              <tr key={e.id} className="clickable" tabIndex={0} onClick={() => nav(`/employees/${e.id}`)} onKeyDown={(k) => k.key === 'Enter' && nav(`/employees/${e.id}`)}>
                <td className="mono">{e.employee_code}</td><td><div>{fullName(e)}</div><div className="muted">{e.work_email}</div></td><td>{e.designation ?? '—'}</td>
                <td>{e.department_name ?? '—'}</td><td>{e.branch_name}</td>{full && <td>{fmtDate(e.date_of_joining)}</td>}<td><StatusBadge status={e.status} /></td></tr>))}</tbody>
          </table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {creating && org.data && <EmployeeForm org={org.data} onClose={() => setCreating(false)} onSaved={(id) => nav(`/employees/${id}`)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={reload} />}
    </div>
  );
}

function ManagerPicker({ value, onChange, excludeId }: { value: string; onChange: (v: string) => void; excludeId?: string }) {
  const [q, setQ] = useState('');
  const { data } = useLoad(() => api.get(`/api/v1/employees${qs({ search: q, status: 'active', pageSize: 20 })}`), [q]);
  const current = useLoad(() => (value ? api.get(`/api/v1/employees/${value}`) : Promise.resolve(null)), [value]);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input placeholder="Search manager" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reporting manager" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Reporting manager">
        <option value="">No reporting manager</option>
        {current.data && !data?.items.some((x: any) => x.id === value) && <option value={value}>{fullName(current.data)} ({current.data.employee_code})</option>}
        {data?.items.filter((e: any) => e.id !== excludeId).map((e: any) => <option key={e.id} value={e.id}>{fullName(e)} ({e.employee_code})</option>)}
      </select>
    </div>
  );
}

function EmployeeForm({ org, existing, onClose, onSaved }: { org: any; existing?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const init = existing ?? {};
  const [f, setF] = useState<Record<string, string>>({
    employeeCode: init.employee_code ?? '', firstName: init.first_name ?? '', lastName: init.last_name ?? '', workEmail: init.work_email ?? '', phone: init.phone ?? '',
    dateOfBirth: init.date_of_birth ?? '', legalEntityId: init.legal_entity_id ?? org.legalEntities[0]?.id ?? '', branchId: init.branch_id ?? '', departmentId: init.department_id ?? '',
    designation: init.designation ?? '', grade: init.grade ?? '', employmentType: init.employment_type ?? 'permanent', status: init.status ?? 'active',
    reportingManagerId: init.reporting_manager_id ?? '', dateOfJoining: init.date_of_joining ?? '', probationEndDate: init.probation_end_date ?? '',
    confirmationDate: init.confirmation_date ?? '', contractEndDate: init.contract_end_date ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [dups, setDups] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const payload = () => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]).filter(([k, v]) => !(v === null && ['employmentType', 'status'].includes(k as string))));
  const submit = async (confirmDuplicate = false) => {
    setBusy(true); setError(null); setErrors({});
    try {
      if (existing) {
        const p = payload(); const changes: Record<string, unknown> = {};
        const map: Record<string, string> = { employeeCode: 'employee_code', firstName: 'first_name', lastName: 'last_name', workEmail: 'work_email', phone: 'phone', dateOfBirth: 'date_of_birth',
          legalEntityId: 'legal_entity_id', branchId: 'branch_id', departmentId: 'department_id', designation: 'designation', grade: 'grade', employmentType: 'employment_type', status: 'status',
          reportingManagerId: 'reporting_manager_id', dateOfJoining: 'date_of_joining', probationEndDate: 'probation_end_date', confirmationDate: 'confirmation_date', contractEndDate: 'contract_end_date' };
        for (const [k, col] of Object.entries(map)) if ((p[k] ?? null) !== (existing[col] ?? null)) changes[k] = p[k] ?? null;
        await api.patch(`/api/v1/employees/${existing.id}`, { changes, expectedVersion: existing.version });
        toast('Employee updated'); onSaved(existing.id); onClose();
      } else {
        const r = await api.post('/api/v1/employees', { employee: payload(), confirmDuplicate });
        toast('Employee created'); onSaved(r.id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.details?.confirmable) setDups(e.details.duplicates);
      else if (e instanceof ApiError && Array.isArray(e.details)) {
        setErrors(Object.fromEntries(e.details.map((d: any) => [String(d.path).replace(/^(employee|changes)\./, ''), d.message])));
        setError('Please correct the highlighted fields');
      } else setError(errText(e));
    } finally { setBusy(false); }
  };
  const branches = org.branches.filter((b: any) => b.legal_entity_id === f.legalEntityId);
  return (
    <Modal title={existing ? 'Edit employee' : 'Add employee'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="form-grid">
          <Field label="Employee code *" error={errors.employeeCode}><input required value={f.employeeCode} onChange={set('employeeCode')} /></Field>
          <Field label="First name *" error={errors.firstName}><input required value={f.firstName} onChange={set('firstName')} /></Field>
          <Field label="Last name"><input value={f.lastName} onChange={set('lastName')} /></Field>
          <Field label="Work email" error={errors.workEmail}><input type="email" value={f.workEmail} onChange={set('workEmail')} /></Field>
          <Field label="Phone" error={errors.phone}><input value={f.phone} onChange={set('phone')} placeholder="+91 98xxxxxxxx" /></Field>
          <Field label="Date of birth" error={errors.dateOfBirth}><input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field label="Legal entity *"><select required value={f.legalEntityId} onChange={(e) => setF({ ...f, legalEntityId: e.target.value, branchId: '' })}>{org.legalEntities.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Branch *" error={errors.branchId}><select required value={f.branchId} onChange={set('branchId')}><option value="">Select…</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Department"><select value={f.departmentId} onChange={set('departmentId')}><option value="">None</option>{org.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Designation"><input value={f.designation} onChange={set('designation')} /></Field>
          <Field label="Grade"><input value={f.grade} onChange={set('grade')} /></Field>
          <Field label="Employment type"><select value={f.employmentType} onChange={set('employmentType')}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}>{STATUSES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
          <Field label="Date of joining *" error={errors.dateOfJoining}><input required type="date" value={f.dateOfJoining} onChange={set('dateOfJoining')} /></Field>
          <Field label="Probation end" error={errors.probationEndDate}><input type="date" value={f.probationEndDate} onChange={set('probationEndDate')} /></Field>
          <Field label="Contract end" error={errors.contractEndDate}><input type="date" value={f.contractEndDate} onChange={set('contractEndDate')} /></Field>
        </div>
        <Field label="Reporting manager" error={errors.reportingManagerId}><ManagerPicker value={f.reportingManagerId!} onChange={(v) => setF({ ...f, reportingManagerId: v })} excludeId={existing?.id} /></Field>
        {dups && (
          <div className="alert warn stack">
            <strong>Possible duplicate</strong>
            {dups.map((d) => <div key={d.id}>{d.reason}: <Link to={`/employees/${d.id}`}>{d.name} ({d.employee_code})</Link></div>)}
            <div><button type="button" className="btn sm" onClick={() => submit(true)}>This is a different person — create anyway</button></div>
          </div>
        )}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

/** CSV with a header row; parsed client-side, validated server-side (dry run first). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let cur: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { cur.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(cell); cell = ''; if (cur.some((c) => c.trim())) rows.push(cur); cur = []; }
    else cell += ch;
  }
  cur.push(cell); if (cur.some((c) => c.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const TEMPLATE = 'employeeCode,firstName,lastName,workEmail,phone,dateOfBirth,branchCode,departmentCode,designation,grade,employmentType,dateOfJoining,probationEndDate,contractEndDate,reportingManagerCode\n';

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dryRun: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/api/v1/employees/import', { dryRun, rows });
      setResult(r);
      if (r.committed) { toast(`Imported ${r.summary.valid} employees`); onDone(); onClose(); }
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Bulk import employees" onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Upload a CSV. Every row is validated first; nothing is saved unless all rows are valid.
          {' '}<a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="employee-import-template.csv">Download template</a></p>
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => {
          const file = e.target.files?.[0]; setResult(null);
          if (file) { const parsed = parseCsv(await file.text()); setRows(parsed); if (!parsed.length) setError('The file has no data rows'); else setError(null); }
        }} />
        {rows && <div className="muted">{rows.length} row(s) read.</div>}
        {result && (
          <div className={`alert ${result.summary.errors ? 'error' : 'ok'}`}>
            {result.summary.errors ? `${result.summary.errors} row(s) have errors. Fix the file and validate again.` : `All ${result.summary.total} rows are valid${result.summary.warnings ? ` (${result.summary.warnings} with warnings)` : ''}.`}
          </div>
        )}
        {result?.report?.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}><table className="t"><thead><tr><th>Row</th><th>Code</th><th>Problems</th></tr></thead><tbody>
            {result.report.map((r: any) => <tr key={r.row}><td>{r.row}</td><td>{r.employeeCode}</td><td>{r.errors.map((x: string) => <div key={x} style={{ color: 'var(--danger)' }}>{x}</div>)}{r.warnings.map((x: string) => <div key={x} style={{ color: 'var(--warn)' }}>{x}</div>)}</td></tr>)}
          </tbody></table></div>
        )}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Close</button>
          <button className="btn" disabled={!rows?.length || busy} onClick={() => run(true)}>Validate</button>
          <button className="btn primary" disabled={!result || result.summary.errors > 0 || busy} onClick={() => run(false)}>Import {result ? result.summary.valid : ''} employees</button></div>
      </div>
    </Modal>
  );
}

function BankPanel({ employeeId }: { employeeId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ accountHolder: '', accountNumber: '', ifsc: '', bankName: '' });
  const [error, setError] = useState<string | null>(null);
  const bank = useLoad(() => (show ? api.get(`/api/v1/employees/${employeeId}/bank-account`) : Promise.resolve(undefined)), [show]);
  return (
    <div className="card stack">
      <div className="row"><h3 style={{ margin: 0 }}>Bank details</h3><span className="badge info">Restricted</span><span className="spacer" />
        {can('employees.bank.manage') && <button className="btn sm" onClick={() => setEdit(true)}>Update</button>}</div>
      {!show ? <div><button className="btn sm" onClick={() => setShow(true)}>Show masked details</button> <span className="muted">Viewing is recorded in the audit log.</span></div>
        : bank.loading ? <Loading /> : bank.error ? <ErrorBox error={bank.error} /> : !bank.data ? <div className="muted">No bank account on file.</div> : (
          <div className="grid grid-4">
            <div className="stat"><div className="l">Account holder</div><div>{bank.data.accountHolder}</div></div>
            <div className="stat"><div className="l">Account number</div><div className="mono">{bank.data.accountNumberMasked}</div></div>
            <div className="stat"><div className="l">IFSC</div><div className="mono">{bank.data.ifsc}</div></div>
            <div className="stat"><div className="l">Bank</div><div>{bank.data.bankName ?? '—'}</div></div>
          </div>)}
      {edit && (
        <Modal title="Update bank details" onClose={() => setEdit(false)}>
          <form className="stack" autoComplete="off" onSubmit={async (e) => {
            e.preventDefault(); setError(null);
            try { await api.put(`/api/v1/employees/${employeeId}/bank-account`, { ...f, bankName: f.bankName || null }); toast('Bank details updated'); setEdit(false); setShow(true); bank.reload(); }
            catch (err) { setError(errText(err)); }
          }}>
            <div className="alert info">The full account number is encrypted and can never be displayed again after saving — only the last 4 digits.</div>
            <Field label="Account holder"><input required value={f.accountHolder} onChange={(e) => setF({ ...f, accountHolder: e.target.value })} /></Field>
            <Field label="Account number" hint="9–18 digits"><input required inputMode="numeric" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="IFSC"><input required value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0001234" /></Field>
            <Field label="Bank name"><input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
            <ErrorBox error={error} />
            <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setEdit(false)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function EmployeeProfile() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { can, canAny, me, hasModule } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data: e, loading, error, reload } = useLoad(() => api.get(`/api/v1/employees/${id}`), [id]);
  const org = useLoad(() => api.get('/api/v1/org'), []);
  const tab = (params.get('tab') ?? 'overview') as string;
  const history = useLoad(() => (tab === 'history' ? api.get(`/api/v1/employees/${id}/history`) : Promise.resolve(null)), [tab, id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const self = me!.user.employeeId === id;
  const tabs = [{ key: 'overview', label: 'Overview' }];
  if (e.view === 'full' && (self || can('employees.read'))) tabs.push({ key: 'personal', label: 'Personal details' });
  if (hasModule('attendance') && (self || canAny('attendance.read', 'attendance.team.read'))) tabs.push({ key: 'attendance', label: 'Attendance' });
  if (hasModule('core.documents') && (self || canAny('documents.read', 'documents.manage'))) tabs.push({ key: 'documents', label: 'Documents' });
  if (can('employees.read')) tabs.push({ key: 'history', label: 'Change history' });
  const item = (l: string, v: any) => <div className="stat"><div className="l">{l}</div><div>{v ?? '—'}</div></div>;
  return (
    <div className="stack">
      <div className="row"><div><h1>{fullName(e)}</h1><p className="sub" style={{ marginBottom: 0 }}><span className="mono">{e.employee_code}</span> · {e.designation ?? 'No designation'} · <StatusBadge status={e.status} /></p></div>
        <span className="spacer" />{can('employees.manage') && e.view === 'full' && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}</div>
      <Tabs tabs={tabs as any} value={tab} onChange={(k) => setParams({ tab: k })} />
      {tab === 'overview' && (
        <>
          <div className="card grid grid-4">
            {item('Work email', e.work_email)}{item('Branch', e.branch_name)}{item('Department', e.department_name)}
            {e.view === 'full' && <>{item('Phone', e.phone)}{item('Date of birth', fmtDate(e.date_of_birth))}{item('Legal entity', e.legal_entity_name)}{item('Grade', e.grade)}
              {item('Employment type', label(e.employment_type))}{item('Reporting manager', e.reporting_manager_id ? <Link to={`/employees/${e.reporting_manager_id}`}>{e.reporting_manager_name}</Link> : null)}
              {item('Date of joining', fmtDate(e.date_of_joining))}{item('Probation end', fmtDate(e.probation_end_date))}{item('Contract end', fmtDate(e.contract_end_date))}{item('Exit date', fmtDate(e.exit_date))}</>}
          </div>
          {e.view === 'full' && (self || can('employees.bank.read')) && <BankPanel employeeId={id!} />}
        </>
      )}
      {tab === 'personal' && <PersonalDetails employeeId={id!} />}
      {tab === 'attendance' && <div className="card"><AttendanceCalendar employeeId={id!} self={false} /></div>}
      {tab === 'documents' && <EmployeeDocuments employeeId={id!} />}
      {tab === 'history' && (history.loading ? <Loading /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>
          {history.data?.items.map((h: any) => (
            <tr key={h.id}><td>{fmtDateTime(h.created_at)}</td><td>{h.actor_name ?? 'System'}</td><td>{h.action.replace('employee.', '').replace(/_/g, ' ')}</td>
              <td>{h.change_metadata?.changes ? Object.entries(h.change_metadata.changes).map(([k, v]: [string, any]) => <div key={k}><strong>{k}</strong>: {String(v.from ?? '—')} → {String(v.to ?? '—')}</div>)
                : h.change_metadata?.newLast4 ? `Account ending ${h.change_metadata.newLast4}` : ''}</td></tr>))}
        </tbody></table></div>
      ))}
      {editing && org.data && <EmployeeForm org={org.data} existing={e} onClose={() => setEditing(false)} onSaved={() => reload()} />}
    </div>
  );
}
