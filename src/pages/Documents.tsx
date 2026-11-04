import { useState, type FormEvent } from 'react';
import { api, qs, type Paged } from '../api';
import { useAuth } from '../auth';
import { StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/ErrorState';
import { Checkbox, Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { Select } from '../components/Select';
import { Table, type Column } from '../components/Table';
import { TabPanel, Tabs, useTabParam, type TabItem } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { DocumentTable, UploadDialog, type DocumentCategory, type DocumentRow } from '../features/documents/DocumentTable';
import { invalidateApi, useApiQuery } from '../lib/query';

type Tab = 'mine' | 'company' | 'all' | 'categories';
const CATEGORIES_URL = '/api/v1/documents/categories';

export function Documents() {
  const { can, canAny, me } = useAuth();
  const toast = useToast();
  const tabs: TabItem<Tab>[] = [];
  if (me?.user.employeeId) tabs.push({ key: 'mine', label: 'My documents' });
  tabs.push({ key: 'company', label: 'Company documents' });
  if (canAny('documents.read', 'documents.manage')) tabs.push({ key: 'all', label: 'All documents' });
  if (can('documents.manage')) tabs.push({ key: 'categories', label: 'Categories' });
  const [tab, setTabRaw] = useTabParam(tabs.map((t) => t.key));
  const [page, setPage] = useState(1);
  const [expiring, setExpiring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<DocumentRow | null>(null);
  // A page number or hidden filter from one tab must not narrow the next one.
  const setTab = (t: Tab) => { setTabRaw(t); setPage(1); setExpiring(false); };
  const cats = useApiQuery<{ items: DocumentCategory[] }>(CATEGORIES_URL);
  const url = tab === 'categories' ? null : `/api/v1/documents${qs({ scope: tab === 'all' ? undefined : tab, expiringWithinDays: expiring ? 30 : undefined, page, pageSize: 25 })}`;
  const docs = useApiQuery<Paged<DocumentRow>>(url, { placeholderData: (previous) => previous });
  const categories = cats.data?.items ?? [];
  const canUploadMine = categories.some((c) => c.employee_upload && c.status === 'active');
  const canUpload = (tab === 'mine' && canUploadMine) || (can('documents.manage') && tab === 'company');
  return (
    <div className="stack-4">
      <PageHeader
        title="Documents"
        description="Every download is recorded. Restricted documents are visible only to authorised HR staff and the employee."
        actions={canUpload && <Button variant="primary" onClick={() => setUploading(true)}>Upload</Button>}
      />
      <Tabs label="Documents" idBase="documents" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel idBase="documents" tab={tab}>
        {tab === 'categories' ? <Categories /> : (
          <div className="stack-3">
            {tab === 'all' && <Checkbox label="Expiring within 30 days, or expired" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); setPage(1); }} />}
            <QueryState query={docs}>
              {(d) => <DocumentTable items={d.items} onArchive={can('documents.manage') ? setArchive : undefined} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
            </QueryState>
          </div>
        )}
      </TabPanel>
      {uploading && (
        <UploadDialog
          categories={tab === 'mine' ? categories.filter((c) => c.employee_upload) : categories.filter((c) => c.scope === 'company')}
          employeeId={tab === 'mine' ? me?.user.employeeId ?? undefined : undefined}
          onClose={() => setUploading(false)}
          onDone={() => void invalidateApi('/api/v1/documents?')}
        />
      )}
      {archive && (
        <ConfirmDialog
          title="Archive document"
          message={`Archive “${archive.title}”? It stays in storage for retention but leaves active lists.`}
          confirmLabel="Archive"
          danger
          onClose={() => setArchive(null)}
          onConfirm={async () => { await api.post(`/api/v1/documents/${archive.id}/archive`); toast('Archived'); await invalidateApi('/api/v1/documents?'); }}
        />
      )}
    </div>
  );
}

interface CategoryForm { id?: string; code: string; name: string; scope: 'employee' | 'company'; employeeVisible: boolean; employeeUpload: boolean; restricted: boolean; requiresExpiry: boolean; status: string }
const BLANK: CategoryForm = { code: '', name: '', scope: 'employee', employeeVisible: true, employeeUpload: false, restricted: false, requiresExpiry: false, status: 'active' };

function Categories() {
  const query = useApiQuery<{ items: DocumentCategory[] }>(CATEGORIES_URL);
  const [edit, setEdit] = useState<CategoryForm | null>(null);
  const columns: Column<DocumentCategory>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (c) => c.name },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (c) => <span className="mono">{c.code}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'scope', header: 'Scope', cell: (c) => (c.scope === 'company' ? 'Company' : 'Employee') },
    { key: 'rules', header: 'Rules', cell: (c) => <span className="text-sm text-2">{[c.employee_visible ? 'Visible to employee' : 'HR only', c.employee_upload && 'employee can upload', c.restricted && 'restricted', c.requires_expiry && 'expiry required'].filter(Boolean).join(' · ')}</span> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (c) => <div className="table__actions"><Button size="sm" onClick={() => setEdit({ id: c.id, code: c.code, name: c.name, scope: c.scope, employeeVisible: c.employee_visible, employeeUpload: c.employee_upload, restricted: c.restricted, requiresExpiry: c.requires_expiry, status: c.status })}>Edit</Button></div> },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between"><span /><Button variant="primary" size="sm" onClick={() => setEdit({ ...BLANK })}>New category</Button></div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No categories yet" description="Create categories such as Contracts, Certifications, Medical (restricted) or Policies (company)." />}>
        {(d) => <Table label="Document categories" columns={columns} rows={d.items} rowKey={(c) => c.id} />}
      </QueryState>
      {edit && <CategoryDialog initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CategoryDialog({ initial, onClose }: { initial: CategoryForm; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { id, ...body } = f;
    setBusy(true);
    setError(null);
    try {
      if (id) await api.put(`${CATEGORIES_URL}/${id}`, body); else await api.post(CATEGORIES_URL, body);
      toast('Saved');
      await invalidateApi(CATEGORIES_URL);
      onClose();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.id ? `Edit ${f.code}` : 'New category'} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <div className="columns-form">
          <Input label="Code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Scope" disabled={!!f.id} value={f.scope} options={[{ value: 'employee', label: 'Employee documents' }, { value: 'company', label: 'Company documents' }]} onChange={(e) => { const scope = e.target.value as CategoryForm['scope']; setF({ ...f, scope, employeeUpload: scope === 'company' ? false : f.employeeUpload }); }} />
          <Select label="Status" value={f.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={(e) => setF({ ...f, status: e.target.value })} />
        </div>
        <Checkbox label={f.scope === 'company' ? 'Visible to all employees' : 'Employee can see their own'} checked={f.employeeVisible} onChange={(e) => setF({ ...f, employeeVisible: e.target.checked })} />
        <Checkbox label="Employee can upload their own" disabled={f.scope === 'company'} checked={f.employeeUpload} onChange={(e) => setF({ ...f, employeeUpload: e.target.checked })} />
        <Checkbox label="Restricted, such as medical or identity: only HR with restricted access" checked={f.restricted} onChange={(e) => setF({ ...f, restricted: e.target.checked })} />
        <Checkbox label="Expiry date required, with reminders at 30 and 7 days" checked={f.requiresExpiry} onChange={(e) => setF({ ...f, requiresExpiry: e.target.checked })} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div></div>
      </form>
    </Modal>
  );
}
