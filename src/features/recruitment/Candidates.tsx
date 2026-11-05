import { useMemo, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { api, ApiError, qs } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FileUpload } from '../../components/FileUpload';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { useDebouncedValue } from '../../components/hooks';
import { Checkbox, Input } from '../../components/Input';
import { KeyValue } from '../../components/KeyValue';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { RevealToggle } from '../../components/RevealToggle';
import { isMaskedField, useRevealable } from '../../lib/masking';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { useTableState } from '../../components/useTableState';
import { currencySymbol, fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { options, personName, SOURCES, years, type Candidate, type CandidatePage, type CandidateRow } from './types';

const CANDIDATES = '/api/v1/recruitment/candidates';

export function Candidates({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const columns = useMemo<Column<CandidateRow>[]>(() => [
    { key: 'name', header: 'Name', required: true, card: 'title', cell: (c) => <span className="cluster"><Button variant="link" onClick={() => setOpen(c.id)}>{personName(c)}</Button>{c.employee_id && <Badge tone="ok">Hired</Badge>}</span> },
    { key: 'contact', header: 'Contact', cell: (c) => <span className="text-sm">{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'role', header: 'Current role', cell: (c) => [c.current_designation, c.current_company].filter(Boolean).join(', ') || '—' },
    { key: 'experience', header: 'Experience', cell: (c) => years(c.experience_months) },
    { key: 'source', header: 'Source', cell: (c) => SOURCES[c.source] ?? c.source },
    { key: 'applications', header: 'Applications', align: 'right', cell: (c) => c.applications },
    { key: 'retain', header: 'Keep until', cell: (c) => fmtDate(c.retain_until) },
  ], []);
  const table = useTableState('recruitment.candidates', columns);
  const query = useApiQuery<CandidatePage>(`${CANDIDATES}${qs({ search: debounced, page: table.page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <div className="stack-4">
      <FilterBar
        search={{ label: 'Search candidates', placeholder: 'Search name, email, phone, company', value: search, onChange: (v) => { setSearch(v); table.setPage(1); } }}
        actions={can('recruitment.manage') && <Button variant="primary" onClick={() => setCreating(true)}>New candidate</Button>}
      />
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Users />} title="No candidates" description={search ? 'Try a different search.' : undefined} />}>
        {(d) => <Table label="Candidates" columns={columns} rows={d.items} rowKey={(c) => c.id} hidden={table.hidden} onToggleColumn={table.toggleColumn} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {creating && <CandidateForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpen(id); }} />}
      {open && <CandidateDetail id={open} onClose={() => setOpen(null)} onOpenApp={onOpenApp} />}
    </div>
  );
}

const BLANK = { firstName: '', lastName: '', email: '', phone: '', source: 'job_portal', currentCompany: '', currentDesignation: '', experienceMonths: '', noticeDays: '', expectedCtc: '', location: '', qualification: '', consentNote: '' };
type CandidateValues = typeof BLANK;
interface Duplicate { name: string }

export function CandidateForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(BLANK);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dups, setDups] = useState<Duplicate[] | null>(null);
  const confirmDuplicate = useRef(false);
  const form = useSubmit(async () => {
    const body = new FormData();
    for (const [k, v] of Object.entries(f)) if (v) body.append(k, v);
    body.append('consent', String(consent));
    body.append('confirmDuplicate', String(confirmDuplicate.current));
    if (file) body.append('resume', file);
    try {
      const r = await api.upload<{ id: string }>(CANDIDATES, body);
      toast('Candidate added');
      await invalidateApi(CANDIDATES);
      onSaved(r.id);
    } catch (x) {
      const found = x instanceof ApiError ? x.problem['duplicates'] as Duplicate[] | undefined : undefined;
      if (!found) throw x;
      setDups(found);
    }
  }, { validate: (): Record<string, string> => (consent ? {} : { consent: 'Confirm that the candidate agreed before saving.' }) });
  const text = (k: keyof CandidateValues, label: string, props: { type?: string; required?: boolean; min?: number; step?: string; placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' } = {}) => (
    <Input label={label} error={form.errors[k]} value={f[k]} onChange={(e) => setF((c) => ({ ...c, [k]: e.target.value }))} {...props} />
  );
  return (
    <Modal title="New candidate" size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={(e) => { confirmDuplicate.current = false; void form.submit(e); }}>
        <div className="columns-form">
          {text('firstName', 'First name', { required: true })}
          {text('lastName', 'Last name')}
          {text('email', 'Email', { type: 'email', inputMode: 'email' })}
          {text('phone', 'Phone', { type: 'tel', inputMode: 'tel' })}
          <Select label="Source" value={f.source} options={options(SOURCES)} onChange={(e) => setF((c) => ({ ...c, source: e.target.value }))} />
          {text('qualification', 'Qualification', { placeholder: 'For example, M.Sc. Chemistry' })}
          {text('currentCompany', 'Current company')}
          {text('currentDesignation', 'Current designation')}
          {text('experienceMonths', 'Experience (months)', { type: 'number', min: 0, inputMode: 'numeric' })}
          {text('noticeDays', 'Notice period (days)', { type: 'number', min: 0, inputMode: 'numeric' })}
          {text('location', 'Location')}
          {can('recruitment.compensation') && text('expectedCtc', `Expected CTC (annual, ${currencySymbol()})`, { type: 'number', min: 1, step: '0.01', inputMode: 'decimal' })}
        </div>
        <FileUpload label="Resume" hint="PDF, Word (DOCX) or image" accept=".pdf,.docx,.png,.jpg,.jpeg" file={file} onChange={setFile} />
        <div className="stack-3 recruit-consent">
          <div className="stack-1">
            <Checkbox label="The candidate agreed to us processing their data for this recruitment." checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {form.errors['consent'] && <span role="alert" className="field__error">{form.errors['consent']}</span>}
          </div>
          <Input label="How consent was obtained" hint="For example, 'Applied on our careers page' or 'Email of 2 Nov 2026'" required minLength={3} error={form.errors['consentNote']} value={f.consentNote} onChange={(e) => setF((c) => ({ ...c, consentNote: e.target.value }))} />
          <p className="text-xs text-3">Data is anonymized and the resume deleted after the retention period unless the candidate is hired.</p>
        </div>
        {dups && (
          <Alert tone="warn">
            <div className="stack-2">
              <span>Possible duplicate: {dups.map((d) => d.name).join(', ')}. The same email is always the same person.</span>
              <div><Button size="sm" loading={form.busy} onClick={() => { confirmDuplicate.current = true; void form.submit(); }}>It's a different person, save</Button></div>
            </div>
          </Alert>
        )}
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function ResumeUpload({ id, replacing, onClose }: { id: string; replacing: boolean; onClose: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const form = useSubmit(async () => {
    const body = new FormData();
    if (file) body.append('resume', file);
    await api.upload(`${CANDIDATES}/${id}/resume`, body, 'PUT');
    toast(replacing ? 'Resume replaced' : 'Resume added');
    await invalidateApi(CANDIDATES);
    onClose();
  }, { validate: (): Record<string, string> => (file ? {} : { resume: 'Choose a file.' }) });
  return (
    <Modal title={replacing ? 'Replace resume' : 'Add resume'} size="sm" onClose={onClose}>
      <form noValidate onSubmit={(e) => void form.submit(e)} className="stack-3">
        {replacing && <p className="text-sm text-2">The current resume is deleted when you save.</p>}
        <FileUpload label="Resume" hint="PDF, Word (DOCX) or image" accept=".pdf,.docx,.png,.jpg,.jpeg" file={file} onChange={setFile} required error={form.errors.resume} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function CandidateDetail({ id, onClose, onOpenApp }: { id: string; onClose: () => void; onOpenApp: (id: string) => void }) {
  const { can, canAny } = useAuth();
  const toast = useToast();
  const { query, revealed, setRevealed } = useRevealable<Candidate>(`${CANDIDATES}/${id}`);
  const [erase, setErase] = useState(false);
  const [resume, setResume] = useState(false);
  type App = Candidate['applications'][number];
  const columns: Column<App>[] = [
    { key: 'requisition', header: 'Requisition', card: 'title', cell: (a) => <><Button variant="link" onClick={() => onOpenApp(a.id)}>{a.title}</Button><div className="table__cell-sub mono">{a.requisition_code}</div></> },
    { key: 'stage', header: 'Stage', card: 'status', cell: (a) => <StatusBadge status={a.stage} /> },
    { key: 'updated', header: 'Updated', cell: (a) => fmtDateTime(a.updated_at) },
  ];
  return (
    <Modal title={query.data ? personName(query.data) : 'Candidate'} size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(c) => (
          <div className="stack-4">
            <KeyValue items={[
              { label: 'Contact', value: [c.email, c.phone, c.location].filter(Boolean).join(' · ') || null },
              { label: 'Current', value: [c.current_designation, c.current_company].filter(Boolean).join(', ') || null },
              { label: 'Experience', value: `${years(c.experience_months)} · notice ${c.notice_days ?? '—'} days` },
              { label: 'Qualification', value: c.qualification },
              { label: 'Source', value: `${SOURCES[c.source] ?? c.source}${c.referred_by_name ? ` (${c.referred_by_name})` : ''}` },
              ...(c.expected_ctc || isMaskedField(c, 'expected_ctc') ? [{ label: 'Expected CTC', value: <span className="cluster"><Money value={c.expected_ctc} masked={isMaskedField(c, 'expected_ctc')} /><RevealToggle revealed={revealed} loading={query.isFetching} onChange={setRevealed} what="amount" /></span> }] : []),
              { label: 'Consent', value: [fmtDateTime(c.consent_at), c.consent_note].filter(Boolean).join(': ') },
              { label: 'Kept until', value: fmtDate(c.retain_until) },
            ]} />
            <div className="cluster">
              {c.has_resume && <DownloadButton url={`${CANDIDATES}/${id}/resume`} fileName="resume">Download resume</DownloadButton>}
              {can('recruitment.manage') && c.status === 'active' && <Button size="sm" onClick={() => setResume(true)}>{c.has_resume ? 'Replace resume' : 'Add resume'}</Button>}
              {canAny('recruitment.manage', 'data_rights.manage') && <DownloadButton url={`/api/v1/tenant/data-rights/candidates/${id}/export`} fileName="candidate-data.json">Export their data</DownloadButton>}
              {can('recruitment.manage') && c.status === 'active' && <Button size="sm" variant="danger-ghost" onClick={() => setErase(true)}>Erase personal data</Button>}
            </div>
            {c.applications.length > 0 && <Table label="Applications" columns={columns} rows={c.applications} rowKey={(a) => a.id} />}
          </div>
        )}
      </QueryState>
      {resume && <ResumeUpload id={id} replacing={query.data?.has_resume === true} onClose={() => setResume(false)} />}
      {erase && (
        <ConfirmDialog
          title="Erase candidate data"
          danger
          requireComment
          confirmLabel="Erase"
          message="Name, contact details and notes are cleared and the resume is deleted. This cannot be undone."
          onClose={() => setErase(false)}
          onConfirm={async (reason) => { await api.post(`${CANDIDATES}/${id}/anonymize`, { reason }); toast('Personal data erased'); await invalidateApi(CANDIDATES); onClose(); }}
        />
      )}
    </Modal>
  );
}
