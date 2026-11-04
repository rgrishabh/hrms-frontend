import { useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDateTime, todayLocal } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { CASES_URL, categoryLabel, GR_CAT, POSH_CAT, type CaseKind, type CaseRow } from './types';

export function MyCases({ onOpen }: { onOpen: (id: string) => void }) {
  const { hasFeature } = useAuth();
  const grievanceOn = hasFeature('FEATURE_GRIEVANCE');
  const poshOn = hasFeature('FEATURE_POSH');
  const [filing, setFiling] = useState<CaseKind | null>(null);
  const g = useApiQuery<{ items: CaseRow[] }>(grievanceOn ? `${CASES_URL}?kind=grievance&scope=mine` : null);
  const p = useApiQuery<{ items: CaseRow[] }>(poshOn ? `${CASES_URL}?kind=posh&scope=mine` : null);
  const failed = g.error ?? p.error;
  const loading = (grievanceOn && g.isPending) || (poshOn && p.isPending);
  const items = [...(g.data?.items ?? []), ...(p.data?.items ?? [])];
  const columns: Column<CaseRow>[] = [
    { key: 'reference', header: 'Reference', card: 'title', cell: (c) => <Button variant="link" onClick={() => onOpen(c.id)}>{c.reference}</Button> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'kind', header: 'Kind', cell: (c) => `${c.kind === 'posh' ? 'POSH' : 'Grievance'}${c.anonymous ? ' (anonymous)' : ''}` },
    { key: 'category', header: 'Category', cell: (c) => categoryLabel(c.kind, c.category) },
    { key: 'filed', header: 'Filed', cell: (c) => fmtDateTime(c.received_at) },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between">
        <span />
        <div className="cluster">
          {grievanceOn && <Button variant={poshOn ? 'secondary' : 'primary'} onClick={() => setFiling('grievance')}>Raise a grievance</Button>}
          {poshOn && <Button variant="primary" onClick={() => setFiling('posh')}>File a POSH complaint</Button>}
        </div>
      </div>
      {failed
        ? <ErrorState error={failed} onRetry={() => { if (g.isError) void g.refetch(); if (p.isError) void p.refetch(); }} />
        : loading
          ? <SkeletonRows />
          : items.length
            ? <Table label="My cases" columns={columns} rows={items} rowKey={(c) => c.id} />
            : <EmptyState icon={<MessageSquareWarning />} title="You have not raised any case" description="If something is wrong at work, you can raise it here in confidence." />}
      {filing && <FileCase kind={filing} onClose={() => setFiling(null)} onFiled={onOpen} />}
    </div>
  );
}

function FileCase({ kind, onClose, onFiled }: { kind: CaseKind; onClose: () => void; onFiled: (id: string) => void }) {
  const toast = useToast();
  const cats = kind === 'posh' ? POSH_CAT : GR_CAT;
  const [f, setF] = useState({ category: Object.keys(cats)[0]!, description: '', incidentDate: '', respondentText: '', anonymous: false, lateReason: '' });
  const [respondent, setRespondent] = useState<PickerItem | null>(null);
  const { busy, errors, error, submit } = useSubmit(async () => {
    const r = await api.post<{ id: string; reference: string }>(CASES_URL, {
      kind, category: f.category, description: f.description, incidentDate: f.incidentDate || null, respondentEmployeeId: respondent?.id ?? null,
      respondentText: f.respondentText || null, anonymous: kind === 'grievance' && f.anonymous, lateReason: f.lateReason || null,
    });
    toast(`Filed as ${r.reference}`);
    await invalidateApi(CASES_URL);
    onClose();
    onFiled(r.id);
  });
  return (
    <Modal title={kind === 'posh' ? 'File a POSH complaint' : 'Raise a grievance'} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        {kind === 'posh' && <Alert>Your complaint goes only to the Internal Committee. HR and administrators cannot see it. You will be updated here.</Alert>}
        <div className="columns-form">
          <Select label="Category" error={errors['category']} value={f.category} options={Object.entries(cats).map(([value, label]) => ({ value, label }))} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <DatePicker label="When did it happen?" max={todayLocal()} required={kind === 'posh'} error={errors['incidentDate']} value={f.incidentDate} onChange={(e) => setF({ ...f, incidentDate: e.target.value })} />
        </div>
        <Textarea label="What happened" hint="Facts: what, where, who was present. At least 20 characters." required minLength={20} maxLength={10000} rows={6} error={errors['description']} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <EmployeeField label={kind === 'posh' ? 'Respondent, the person complained against (optional)' : 'Person involved (optional)'} error={errors['respondentEmployeeId']} value={respondent} onChange={setRespondent} />
        <Input label="Or describe the person" hint="For example a visitor or contractor" maxLength={500} error={errors['respondentText']} value={f.respondentText} onChange={(e) => setF({ ...f, respondentText: e.target.value })} />
        {kind === 'posh' && <Textarea label="If this is more than three months after the incident, why?" hint="The Committee may extend the time limit for reasons recorded" error={errors['lateReason']} value={f.lateReason} onChange={(e) => setF({ ...f, lateReason: e.target.value })} />}
        {kind === 'grievance' && <Checkbox label="Raise anonymously" hint="HR will not see your name. You can still follow it here." checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />}
        <FormActions error={error} busy={busy} submitLabel="Submit" onCancel={onClose} />
      </form>
    </Modal>
  );
}
