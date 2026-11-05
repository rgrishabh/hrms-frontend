import { useState } from 'react';
import { ListTodo, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import type { ApiResponse } from '../../lib/api-types';
import { useApiQuery } from '../../lib/query';
import { reloadLifecycle } from './Checklist';
import { options, OWNER, type Template, type TemplateTask } from './types';

interface TemplateValues { id?: string; kind: string; name: string; isDefault: boolean; status: string; tasks: TemplateTask[] }

const BLANK_TASK: TemplateTask = { title: '', description: '', owner: 'hr', offsetDays: 0 };
const blank = (kind: string): TemplateValues => ({ kind, name: '', isDefault: true, status: 'active', tasks: [{ ...BLANK_TASK }] });
const toValues = (t: Template): TemplateValues => ({ id: t.id, kind: t.kind, name: t.name, isDefault: t.is_default, status: t.status, tasks: t.tasks.map((k) => ({ ...k, description: k.description ?? '' })) });

export function Templates() {
  const query = useApiQuery<ApiResponse<'/api/v1/lifecycle/templates'>>('/api/v1/lifecycle/templates');
  const [edit, setEdit] = useState<TemplateValues | null>(null);
  const columns: Column<Template>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (t) => <span className="cluster">{t.name}{t.is_default && <Badge tone="info">Default</Badge>}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'kind', header: 'Kind', cell: (t) => (t.kind === 'onboarding' ? 'Onboarding' : 'Exit') },
    { key: 'tasks', header: 'Tasks', align: 'right', cell: (t) => t.tasks.length },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (t) => <div className="table__actions"><Button size="sm" aria-label={`Edit ${t.name}`} onClick={() => setEdit(toValues(t))}>Edit</Button></div> },
  ];
  return (
    <div className="stack-4">
      <div className="cluster">
        <Button onClick={() => setEdit(blank('onboarding'))}>New onboarding template</Button>
        <Button onClick={() => setEdit(blank('offboarding'))}>New exit template</Button>
      </div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ListTodo />} title="No templates yet" description="Create one onboarding and one exit template and mark them default." />}>
        {(d) => <Table label="Checklist templates" columns={columns} rows={d.items} rowKey={(t) => t.id} />}
      </QueryState>
      {edit && <TemplateForm init={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TemplateForm({ init, onClose }: { init: TemplateValues; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(init);
  const setTask = (i: number, p: Partial<TemplateTask>) => setF((c) => ({ ...c, tasks: c.tasks.map((t, j) => (j === i ? { ...t, ...p } : t)) }));
  const form = useSubmit(async () => {
    const { id, ...b } = f;
    const body = { ...b, tasks: b.tasks.map((t) => ({ ...t, description: t.description || null, offsetDays: Number(t.offsetDays) })) };
    if (id) await api.put(`/api/v1/lifecycle/templates/${id}`, body); else await api.post('/api/v1/lifecycle/templates', body);
    toast('Saved');
    await reloadLifecycle();
    onClose();
  });
  return (
    <Modal title={init.id ? `Edit ${init.name}` : `New ${init.kind === 'onboarding' ? 'onboarding' : 'exit'} template`} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="columns-form">
          <Input label="Name" required error={form.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Status" value={f.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={(e) => setF({ ...f, status: e.target.value })} />
        </div>
        <Checkbox label="Default template (used automatically)" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} />
        <fieldset className="table-toolbar__group">
          <legend>Tasks</legend>
          <p className="text-xs text-3">Days are counted from the {f.kind === 'onboarding' ? 'joining date' : 'last working day'}. Negative means before.</p>
          {f.tasks.map((t, i) => (
            <div key={i} className="template-task">
              <Input label={`Task ${i + 1}`} required value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} />
              <Select label={`Owner of task ${i + 1}`} value={t.owner} options={options(OWNER)} onChange={(e) => setTask(i, { owner: e.target.value })} />
              <Input label={`Days, task ${i + 1}`} type="number" inputMode="numeric" min={-90} max={180} required value={t.offsetDays} onChange={(e) => setTask(i, { offsetDays: e.target.value })} />
              <Button variant="ghost" iconOnly aria-label={`Remove task ${i + 1}`} icon={<Trash2 aria-hidden="true" />} disabled={f.tasks.length === 1} onClick={() => setF({ ...f, tasks: f.tasks.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <div><Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => setF({ ...f, tasks: [...f.tasks, { ...BLANK_TASK }] })}>Add task</Button></div>
        </fieldset>
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
