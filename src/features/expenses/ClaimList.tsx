import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, qs, type Paged } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { QueryState } from '../../components/QueryState';
import { Table, type Column } from '../../components/Table';
import { useSubmit } from '../../components/useSubmit';
import { fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { ClaimDetail } from './ClaimDetail';
import { CLAIMS_URL, type Claim, type ClaimRow, type ClaimScope } from './types';

export function ClaimList({ scope }: { scope: ClaimScope }) {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  // ?claim=<id> opens a claim directly, for example a trip's claim started from Travel.
  const [open, setOpen] = useState<string | null>(scope === 'mine' ? params.get('claim') : null);
  const [creating, setCreating] = useState(false);
  const query = useApiQuery<Paged<ClaimRow>>(`${CLAIMS_URL}${qs({ scope, page, pageSize: 20 })}`, { placeholderData: (p) => p });
  const close = () => {
    setOpen(null);
    if (params.has('claim')) setParams((p) => { const n = new URLSearchParams(p); n.delete('claim'); return n; }, { replace: true });
  };
  const columns: Column<ClaimRow>[] = [
    { key: 'claim', header: 'Claim', card: 'title', cell: (c) => <span className="cluster"><Button variant="link" onClick={() => setOpen(c.id)}>{c.title}</Button>{c.flagged > 0 && <Badge tone="warn">Possible duplicate</Badge>}</span> },
    ...(scope === 'team' ? [{ key: 'employee', header: 'Employee', card: 'subtitle', cell: (c) => c.employee_name } satisfies Column<ClaimRow>] : []),
    { key: 'items', header: 'Items', align: 'right', cell: (c) => c.items },
    { key: 'total', header: 'Total', align: 'right', cell: (c) => <Money value={c.total} /> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'updated', header: 'Updated', cell: (c) => <span className="text-2">{fmtDateTime(c.paid_at ?? c.approved_at ?? c.submitted_at ?? c.created_at)}</span> },
  ];
  return (
    <div className="stack-3">
      {scope === 'mine' && <div className="cluster-between"><span /><Button variant="primary" onClick={() => setCreating(true)}>New claim</Button></div>}
      <QueryState
        query={query}
        isEmpty={(d) => !d.items.length}
        empty={<EmptyState icon={<Receipt />} title={scope === 'mine' ? 'You have no expense claims yet' : 'No claims from your team'} description={scope === 'mine' ? 'Start a claim, then add each expense with its receipt.' : undefined} />}
      >
        {(d) => <Table label={scope === 'mine' ? 'My expense claims' : 'Team expense claims'} columns={columns} rows={d.items} rowKey={(c) => c.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {creating && <ClaimForm onClose={() => setCreating(false)} onSaved={(id) => setOpen(id)} />}
      {open && <ClaimDetail id={open} onClose={close} />}
    </div>
  );
}

export function ClaimForm({ claim, onClose, onSaved }: { claim?: Pick<Claim, 'id' | 'title' | 'purpose' | 'project'>; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ title: claim?.title ?? '', purpose: claim?.purpose ?? '', project: claim?.project ?? '' });
  const form = useSubmit(async () => {
    const body = { ...f, project: f.project || null };
    let id = claim?.id;
    if (id) await api.put(`${CLAIMS_URL}/${id}`, body);
    else id = (await api.post<{ id: string }>(CLAIMS_URL, body)).id;
    await invalidateApi(CLAIMS_URL);
    onSaved(id);
    onClose();
  });
  return (
    <Modal title={claim ? 'Edit claim' : 'New expense claim'} onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Input label="Title" hint="For example: Client visit, Pune" required minLength={3} error={form.errors['title']} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="Business purpose" required minLength={3} error={form.errors['purpose']} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        <Input label="Project / cost centre (optional)" error={form.errors['project']} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} />
        <FormActions error={form.error} busy={form.busy} onCancel={onClose} submitLabel={claim ? 'Save' : 'Create and add items'} />
      </form>
    </Modal>
  );
}
