import { useState } from 'react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FileUpload } from '../../components/FileUpload';
import { DatePicker } from '../../components/DatePicker';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, fmtDateTime, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { useOrg, type OrgItem } from '../org/useOrg';
import { CATEGORY, CATEGORY_OPTIONS, POLICIES_URL, type AckPage, type AckRow, type PolicyDetailData, type PolicyVersion } from './types';

type ConfirmKind = 'publish' | 'discard' | 'withdraw' | 'retire';
const CONFIRM: Record<ConfirmKind, { title: string; label: string; message: string; done: string; danger: boolean; reason: boolean }> = {
  publish: { title: 'Publish version', label: 'Publish', message: 'Publishing replaces the current version and notifies everyone in the audience.', done: 'Published', danger: false, reason: false },
  discard: { title: 'Discard draft', label: 'Discard', message: 'Discard this draft?', done: 'Draft discarded', danger: true, reason: false },
  withdraw: { title: 'Withdraw version', label: 'Withdraw', message: 'Staff will no longer see this version. Acknowledgements already given are kept.', done: 'Withdrawn', danger: true, reason: true },
  retire: { title: 'Retire policy', label: 'Retire', message: 'The policy and its current version are withdrawn. History and acknowledgements are kept.', done: 'Policy retired', danger: true, reason: true },
};

export function PolicyDetail({ id, onView, onClose }: { id: string; onView: (versionId: string) => void; onClose: () => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const query = useApiQuery<PolicyDetailData>(`${POLICIES_URL}/${id}`, { staleTime: 0 });
  const [drafting, setDrafting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<PolicyVersion | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; versionId?: string } | null>(null);
  const p = query.data;
  const columns: Column<PolicyVersion>[] = [
    { key: 'version', header: 'Version', card: 'title', cell: (v) => <>v{v.version_no}<div className="table__cell-sub">Effective {fmtDate(v.effective_from)}</div></> },
    { key: 'status', header: 'Status', card: 'status', cell: (v) => <StatusBadge status={v.status} /> },
    { key: 'change', header: 'Change', cell: (v) => <>{v.change_summary}{(v.audience_branch_ids.length > 0 || v.audience_department_ids.length > 0) && <div className="table__cell-sub">Limited audience</div>}</> },
    { key: 'by', header: 'Drafted / published by', cell: (v) => <span className="text-sm text-2">{v.created_by_name}{v.published_by_name ? ` → ${v.published_by_name}` : ''}</span> },
    { key: 'acks', header: 'Acks', align: 'right', cell: (v) => (v.requires_ack ? v.acknowledgements : '—') },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (v) => (
        <div className="table__actions">
          <Button size="sm" onClick={() => onView(v.id)}>View</Button>
          {v.status === 'draft' && can('policies.publish') && v.created_by !== me?.user.id && <Button size="sm" variant="primary" onClick={() => setConfirm({ kind: 'publish', versionId: v.id })}>Publish</Button>}
          {v.status === 'draft' && v.created_by === me?.user.id && <span className="text-xs text-2">Needs another publisher</span>}
          {v.status === 'draft' && can('policies.manage') && <Button size="sm" onClick={() => setConfirm({ kind: 'discard', versionId: v.id })}>Discard</Button>}
          {v.status === 'published' && can('policies.publish') && <Button size="sm" onClick={() => setConfirm({ kind: 'withdraw', versionId: v.id })}>Withdraw</Button>}
          {v.requires_ack && v.status !== 'draft' && <Button size="sm" onClick={() => setReport(v)}>Report</Button>}
        </div>
      ),
    },
  ];
  const act = async (c: { kind: ConfirmKind; versionId?: string }, comment: string) => {
    const url = c.kind === 'retire' ? `${POLICIES_URL}/${id}/retire` : `${POLICIES_URL}/versions/${c.versionId}/${c.kind}`;
    const r = await api.post<ApiResponse<'/api/v1/policies/versions/{id}/publish', 'post'> | ApiResponse<'/api/v1/policies/{id}/retire', 'post'> | ApiResponse<'/api/v1/policies/versions/{id}/discard', 'post'> | ApiResponse<'/api/v1/policies/versions/{id}/withdraw', 'post'>>(url, CONFIRM[c.kind].reason ? { reason: comment } : {});
    toast('notified' in r ? `${CONFIRM[c.kind].done}; ${r.notified} people notified` : CONFIRM[c.kind].done);
    await invalidateApi(POLICIES_URL);
  };
  return (
    <Modal title={p ? `${p.code} — ${p.title}` : 'Policy'} size="lg" onClose={onClose}>
      <QueryState query={query}>
        {(d) => (
          <div className="stack-3">
            <div className="cluster-between">
              <span className="cluster"><StatusBadge status={d.status} /><span className="text-2">{CATEGORY[d.category] ?? d.category}{d.owner ? ` · ${d.owner}` : ''}</span></span>
              {d.status === 'active' && (
                <span className="cluster">
                  {can('policies.manage') && <Button size="sm" onClick={() => setEditing(true)}>Edit details</Button>}
                  {can('policies.manage') && !d.versions.some((v) => v.status === 'draft') && <Button size="sm" variant="primary" onClick={() => setDrafting(true)}>New version</Button>}
                  {can('policies.publish') && <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ kind: 'retire' })}>Retire</Button>}
                </span>
              )}
            </div>
            <Table label="Versions" columns={columns} rows={d.versions} rowKey={(v) => v.id} empty={<EmptyState compact title="No versions yet." />} />
            {editing && <DetailsForm policy={d} onClose={() => setEditing(false)} />}
          </div>
        )}
      </QueryState>
      {drafting && <VersionForm policyId={id} onClose={() => setDrafting(false)} />}
      {report && <AckReport version={report} onClose={() => setReport(null)} />}
      {confirm && (
        <ConfirmDialog
          title={CONFIRM[confirm.kind].title}
          danger={CONFIRM[confirm.kind].danger}
          requireComment={CONFIRM[confirm.kind].reason ? true : undefined}
          confirmLabel={CONFIRM[confirm.kind].label}
          message={CONFIRM[confirm.kind].message}
          onClose={() => setConfirm(null)}
          onConfirm={(comment) => act(confirm, comment)}
        />
      )}
    </Modal>
  );
}

function DetailsForm({ policy, onClose }: { policy: PolicyDetailData; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: policy.title, category: policy.category, owner: policy.owner ?? '' });
  const form = useSubmit(async () => {
    await api.put(`${POLICIES_URL}/${policy.id}`, { ...f, owner: f.owner || null });
    toast('Policy saved');
    await invalidateApi(POLICIES_URL);
    onClose();
  });
  return (
    <Modal title="Edit policy details" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Input label="Title" required minLength={3} value={f.title} error={form.errors['title']} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="columns-form">
          <Select label="Category" value={f.category} options={CATEGORY_OPTIONS} error={form.errors['category']} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Input label="Owner (optional)" value={f.owner} error={form.errors['owner']} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        </div>
        <FormActions error={form.error} busy={form.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function AudienceChoice({ legend, items, value, onChange }: { legend: string; items: readonly OrgItem[]; value: readonly string[]; onChange: (ids: string[]) => void }) {
  if (!items.length) return null;
  return (
    <fieldset className="table-toolbar__group">
      <legend>{legend} (none ticked means all)</legend>
      <div className="stack-1">{items.map((i) => <Checkbox key={i.id} label={i.name} checked={value.includes(i.id)} onChange={(e) => onChange(e.target.checked ? [...value, i.id] : value.filter((x) => x !== i.id))} />)}</div>
    </fieldset>
  );
}

function VersionForm({ policyId, onClose }: { policyId: string; onClose: () => void }) {
  const toast = useToast();
  const org = useOrg();
  const [f, setF] = useState({ changeSummary: '', effectiveFrom: todayLocal(), body: '', requiresAck: true, ackDueDays: 14 });
  const [branches, setBranches] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const form = useSubmit(async () => {
    const data = new FormData();
    data.append('changeSummary', f.changeSummary);
    data.append('effectiveFrom', f.effectiveFrom);
    data.append('requiresAck', String(f.requiresAck));
    data.append('ackDueDays', String(f.ackDueDays));
    if (f.body.trim()) data.append('body', f.body);
    if (branches.length) data.append('audienceBranchIds', branches.join(','));
    if (departments.length) data.append('audienceDepartmentIds', departments.join(','));
    if (file) data.append('file', file);
    await api.upload(`${POLICIES_URL}/${policyId}/versions`, data);
    toast('Draft saved; another publisher must publish it');
    await invalidateApi(POLICIES_URL);
    onClose();
  }, { validate: (): Record<string, string> => (f.body.trim() || file ? {} : { body: 'Enter the policy text or attach a PDF.' }) });
  return (
    <Modal title="New policy version" size="lg" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Input label="What changed" required minLength={3} value={f.changeSummary} error={form.errors['changeSummary']} onChange={(e) => setF({ ...f, changeSummary: e.target.value })} />
        <div className="columns-form">
          <DatePicker label="Effective from" required value={f.effectiveFrom} error={form.errors['effectiveFrom']} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
          <Input label="Acknowledge within (days)" type="number" inputMode="numeric" min={1} max={180} value={f.ackDueDays} disabled={!f.requiresAck} error={form.errors['ackDueDays']} onChange={(e) => setF({ ...f, ackDueDays: Number(e.target.value) })} />
        </div>
        <Checkbox label="Employees must acknowledge this version" checked={f.requiresAck} onChange={(e) => setF({ ...f, requiresAck: e.target.checked })} />
        <Textarea label="Policy text" hint="Plain text. You can also, or instead, attach the signed PDF." rows={8} value={f.body} error={form.errors['body']} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <FileUpload label="PDF (optional)" accept=".pdf,application/pdf" file={file} onChange={setFile} error={form.errors['file']} />
        <div className="columns-form">
          <AudienceChoice legend="Branches" items={org.data?.branches ?? []} value={branches} onChange={setBranches} />
          <AudienceChoice legend="Departments" items={org.data?.departments ?? []} value={departments} onChange={setDepartments} />
        </div>
        <FormActions error={form.error} busy={form.busy} submitLabel="Save draft" onCancel={onClose} />
      </form>
    </Modal>
  );
}

const ACK_COLUMNS: Column<AckRow>[] = [
  { key: 'employee', header: 'Employee', card: 'title', cell: (r) => <>{r.name}<div className="table__cell-sub mono">{r.employee_code}</div></> },
  { key: 'where', header: 'Branch / department', cell: (r) => [r.branch, r.department].filter(Boolean).join(' · ') || '—' },
  { key: 'when', header: 'Acknowledged', cell: (r) => (r.acknowledged_at ? fmtDateTime(r.acknowledged_at) : <Badge tone="warn">Pending</Badge>) },
];

function AckReport({ version, onClose }: { version: PolicyVersion; onClose: () => void }) {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const base = `${POLICIES_URL}/versions/${version.id}/acknowledgements`;
  const query = useApiQuery<AckPage>(`${base}${qs({ status, page, pageSize: 25 })}`, { placeholderData: (p) => p });
  return (
    <Modal title={`Acknowledgements — v${version.version_no}`} size="lg" onClose={onClose}>
      <div className="stack-3">
        <div className="cluster-between">
          <Select label="Show" value={status} options={[{ value: 'pending', label: 'Not yet acknowledged' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: '', label: 'Everyone in audience' }]} onChange={(e) => { setStatus(e.target.value); setPage(1); }} />
          <div className="cluster">
            <DownloadButton url={`${base}.xlsx`} fileName={`acknowledgements-v${version.version_no}.xlsx`}>Export Excel</DownloadButton>
            <DownloadButton url={`${base}.csv`} fileName={`acknowledgements-v${version.version_no}.csv`}>Export CSV</DownloadButton>
          </div>
        </div>
        <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState compact title="Nobody here." />}>
          {(d) => <Table label="Acknowledgements" columns={ACK_COLUMNS} rows={d.items} rowKey={(r) => r.employee_id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
        </QueryState>
      </div>
    </Modal>
  );
}
