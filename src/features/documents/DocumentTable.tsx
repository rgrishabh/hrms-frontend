import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { Badge } from '../../components/Badge';
import { Button, ButtonAnchor } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { FileUpload } from '../../components/FileUpload';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { addDays, fmtDate, fmtDateTime, todayLocal } from '../../format';

export interface DocumentRow {
  id: string; title: string; file_name: string; size_bytes: number; category_name: string; restricted: boolean; employee_name: string | null;
  expires_on: string | null; created_at: string; uploaded_by_name: string | null; status: string;
}
export interface DocumentCategory {
  id: string; code: string; name: string; scope: 'employee' | 'company'; status: string; restricted: boolean; requires_expiry: boolean; employee_visible: boolean; employee_upload: boolean; payroll_related?: boolean;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

function Expiry({ on }: { on: string | null }) {
  if (!on) return <>—</>;
  const today = todayLocal();
  const expired = on < today;
  const soon = !expired && on <= addDays(today, 30);
  return <Badge tone={expired ? 'danger' : soon ? 'warn' : 'neutral'}>{expired ? 'Expired ' : soon ? 'Expires ' : ''}{fmtDate(on)}</Badge>;
}

export function DocumentTable({ items, onArchive, pagination }: { items: readonly DocumentRow[]; onArchive?: (d: DocumentRow) => void; pagination?: { page: number; pageSize: number; total: number; onPage: (p: number) => void } }) {
  const columns: Column<DocumentRow>[] = [
    { key: 'title', header: 'Title', card: 'title', cell: (d) => <>{d.title}<div className="table__cell-sub">{d.file_name} · {kb(d.size_bytes)}</div></> },
    { key: 'category', header: 'Category', cell: (d) => <span className="cluster">{d.category_name}{d.restricted && <Badge tone="warn">Restricted</Badge>}</span> },
    { key: 'employee', header: 'Employee', cell: (d) => d.employee_name ?? 'Company' },
    { key: 'expires', header: 'Expires', cell: (d) => <Expiry on={d.expires_on} /> },
    { key: 'uploaded', header: 'Uploaded', cell: (d) => <span className="text-sm text-2">{fmtDateTime(d.created_at)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</span> },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (d) => (
        <div className="table__actions">
          <ButtonAnchor size="sm" href={`/api/v1/documents/${d.id}/download`}>Download</ButtonAnchor>
          {onArchive && d.status === 'active' && <Button size="sm" onClick={() => onArchive(d)}>Archive</Button>}
        </div>
      ),
    },
  ];
  return <Table label="Documents" columns={columns} rows={items} rowKey={(d) => d.id} pagination={pagination} empty={<EmptyState title="No documents" />} />;
}

export function UploadDialog({ categories, employeeId, onClose, onDone }: { categories: readonly DocumentCategory[]; employeeId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const usable = categories.filter((c) => c.status === 'active' && (employeeId ? c.scope === 'employee' : true));
  const [categoryId, setCategoryId] = useState(usable[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const cat = usable.find((c) => c.id === categoryId);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('categoryId', categoryId);
    form.append('title', title);
    if (employeeId && cat?.scope === 'employee') form.append('employeeId', employeeId);
    if (expiresOn) form.append('expiresOn', expiresOn);
    form.append('file', file);
    try {
      await api.upload('/api/v1/documents', form);
      toast('Document uploaded');
      onDone();
      onClose();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };
  return (
    <Modal title="Upload document" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        {!usable.length && <InlineError error="No document category allows uploads here. Ask HR to set one up." />}
        <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={usable.map((c) => ({ value: c.id, label: `${c.name}${c.restricted ? ' (restricted)' : ''}${c.scope === 'company' ? ', company' : ''}` }))} />
        <Input label="Title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        <DatePicker label={`Expiry date${cat?.requires_expiry ? ' (required)' : ' (optional)'}`} required={!!cat?.requires_expiry} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        <FileUpload label="File" hint="PDF, PNG, JPEG, WebP, DOCX or XLSX" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" required file={file} onChange={setFile} />
        <InlineError error={error} />
        <div className="cluster-between"><span /><div className="cluster"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!file || !categoryId} loading={busy} loadingText="Uploading…">Upload</Button></div></div>
      </form>
    </Modal>
  );
}
