import { useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { PolicyDetail } from './PolicyDetail';
import { CATEGORY, CATEGORY_OPTIONS, POLICIES_URL, type PolicyRow } from './types';

export function ManagePolicies({ onView }: { onView: (versionId: string) => void }) {
  const { can } = useAuth();
  const query = useApiQuery<{ items: PolicyRow[] }>(POLICIES_URL);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const columns: Column<PolicyRow>[] = [
    { key: 'policy', header: 'Policy', card: 'title', cell: (p) => <span className="cluster"><Button variant="link" onClick={() => setOpen(p.id)}>{p.title}</Button>{p.drafts > 0 && <Badge tone="warn">Draft</Badge>}</span> },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (p) => <span className="mono">{p.code}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'category', header: 'Category', cell: (p) => CATEGORY[p.category] ?? p.category },
    { key: 'published', header: 'Published', cell: (p) => (p.published_version ? `v${p.published_version} · ${fmtDate(p.effective_from)}` : '—') },
    { key: 'ack', header: 'Acknowledged', cell: (p) => (!p.published_version ? '—' : p.requires_ack ? `${p.acknowledged} / ${p.audience}` : 'Not required') },
  ];
  const add = can('policies.manage') ? <Button variant="primary" onClick={() => setCreating(true)}>New policy</Button> : undefined;
  return (
    <div className="stack-3">
      {add && <div className="cluster-between"><span />{add}</div>}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<BookOpenCheck />} title="No policies yet" description="Start with the code of conduct, POSH, leave and health & safety policies." />}>
        {(d) => <Table label="Policies" columns={columns} rows={d.items} rowKey={(p) => p.id} />}
      </QueryState>
      {creating && <NewPolicyForm onClose={() => setCreating(false)} onCreated={setOpen} />}
      {open && <PolicyDetail id={open} onView={onView} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NewPolicyForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: '', title: '', category: 'hr', owner: '' });
  const form = useSubmit(async () => {
    const r = await api.post<{ id: string }>(POLICIES_URL, { ...f, owner: f.owner || null });
    toast('Policy created. Add its first version.');
    await invalidateApi(POLICIES_URL);
    onClose();
    onCreated(r.id);
  });
  return (
    <Modal title="New policy" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Code" required value={f.code} error={form.errors['code']} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Select label="Category" value={f.category} options={CATEGORY_OPTIONS} error={form.errors['category']} onChange={(e) => setF({ ...f, category: e.target.value })} />
        </div>
        <Input label="Title" required minLength={3} value={f.title} error={form.errors['title']} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label="Owner (optional)" hint="The team responsible for it, such as HR" value={f.owner} error={form.errors['owner']} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Create" onCancel={onClose} />
      </form>
    </Modal>
  );
}
