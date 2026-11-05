import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, qs, type Paged } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { DownloadButton } from '../../components/DownloadButton';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit } from '../../components/useSubmit';
import { fmtDate, fmtDateTime } from '../../format';
import type { ApiBody } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';

const BASE = '/api/v1/tenant/data-rights';
interface Retention { carveOuts: { category: string; label: string; years: number; basis: string; setting: string }[]; auditLog: string; notLegalAdvice: string }
interface Erasure { id: string; subject_type: 'employee' | 'candidate'; subject_id: string; subject_name?: string | null; status: string; reason: string | null; requested_by_name?: string | null; created_at: string; retained_until?: string | null }

export function DataRights() {
  const { canAny, can } = useAuth();
  const read = canAny('settings.read', 'data_rights.manage');
  const retention = useApiQuery<Retention>(read ? `${BASE}/retention` : null);
  const requests = canAny('data_rights.manage', 'data_rights.execute');
  return (
    <div className="stack-4">
      {requests && <ErasureRequests execute={can('data_rights.execute')} manage={can('data_rights.manage')} />}
      {canAny('employees.manage', 'data_rights.execute') && <PersonExport />}
      {read && (
        <Card title="What is kept after erasure">
          <QueryState query={retention} compact>
            {(r) => (
              <div className="stack-3">
                <Table label="Periods kept" columns={[{ key: 'label', header: 'Records', card: 'title', cell: (c: Retention['carveOuts'][number]) => c.label }, { key: 'years', header: 'Years', align: 'right', cell: (c) => <span className="tnum">{c.years}</span> }, { key: 'basis', header: 'Basis', cell: (c) => <span className="cell-wrap">{c.basis}</span> }]} rows={r.carveOuts} rowKey={(c) => c.category} />
                <p className="text-sm text-2">{r.auditLog}</p>
                <Alert>{r.notLegalAdvice}</Alert>
              </div>
            )}
          </QueryState>
        </Card>
      )}
    </div>
  );
}

function PersonExport() {
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  return (
    <Card title="Export what is held about a person">
      <div className="stack-3">
        <EmployeeField value={employee} onChange={setEmployee} />
        {employee && <div><DownloadButton url={`${BASE}/employees/${employee.id}/export`} fileName={`personal-data-${employee.id}.json`} variant="primary">Download JSON</DownloadButton></div>}
      </div>
    </Card>
  );
}

function ErasureRequests({ execute, manage }: { execute: boolean; manage: boolean }) {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const query = useApiQuery<Paged<Erasure>>(`${BASE}/erasure-requests${qs({ page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const [raising, setRaising] = useState(false);
  const [act, setAct] = useState<{ kind: 'execute' | 'reject'; row: Erasure } | null>(null);
  const columns: Column<Erasure>[] = [
    { key: 'subject', header: 'Person', card: 'title', cell: (r) => r.subject_name ?? (r.subject_type === 'candidate' ? 'Candidate' : 'Employee') },
    { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'when', header: 'Requested', card: 'subtitle', cell: (r) => fmtDateTime(r.created_at) },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—' },
    { key: 'kept', header: 'Kept until', cell: (r) => (r.retained_until ? fmtDate(r.retained_until) : '—') },
    ...(execute ? [{ key: 'actions', header: 'Actions', card: 'actions', cell: (r: Erasure) => (r.status === 'requested' || r.status === 'pending' ? <div className="table__actions"><Button size="sm" variant="danger-ghost" onClick={() => setAct({ kind: 'execute', row: r })}>Carry out</Button><Button size="sm" onClick={() => setAct({ kind: 'reject', row: r })}>Reject</Button></div> : null) } as Column<Erasure>] : []),
  ];
  return (
    <Card title="Erasure requests" actions={manage && <Button size="sm" variant="primary" onClick={() => setRaising(true)}>Raise a request</Button>}>
      <QueryState query={query} compact isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<ShieldCheck />} title="No erasure requests." />}>
        {(d) => <Table label="Erasure requests" columns={columns} rows={d.items} rowKey={(r) => r.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {raising && <RaiseErasure onClose={() => setRaising(false)} />}
      {act && (
        <ConfirmDialog
          title={act.kind === 'execute' ? 'Carry out erasure' : 'Reject erasure request'}
          danger={act.kind === 'execute'}
          typedConfirmation={act.kind === 'execute' ? 'ERASE' : undefined}
          confirmLabel={act.kind === 'execute' ? 'Erase' : 'Reject'}
          message={act.kind === 'execute' ? 'Personal details are removed now and cannot be restored. What the law requires is kept until its period ends, and the result lists it.' : 'The person keeps their data, and the note is recorded.'}
          onClose={() => setAct(null)}
          onConfirm={async () => {
            await api.post(`${BASE}/erasure-requests/${act.row.id}/${act.kind}`, {});
            toast(act.kind === 'execute' ? 'Erasure carried out' : 'Request rejected');
            await invalidateApi(`${BASE}/erasure-requests`);
          }}
        />
      )}
    </Card>
  );
}

function RaiseErasure({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [reason, setReason] = useState('');
  const form = useSubmit(async () => {
    await api.post(`${BASE}/erasure-requests`, { subjectType: 'employee', subjectId: employee!.id, reason: reason || undefined } satisfies ApiBody<'/api/v1/tenant/data-rights/erasure-requests'>);
    toast('Erasure request raised');
    await invalidateApi(`${BASE}/erasure-requests`);
    onClose();
  }, { validate: (): Record<string, string> => (employee ? {} : { employeeId: 'Choose a person' }) });
  return (
    <Modal title="Raise an erasure request" onClose={onClose}>
      <form className="stack-3" onSubmit={form.submit}>
        <Alert>Only someone who has left, or who never joined, can be erased. Someone else carries out the request.</Alert>
        <EmployeeField error={form.errors['employeeId']} value={employee} onChange={setEmployee} />
        <Textarea label="Reason" maxLength={1000} error={form.errors['reason']} value={reason} onChange={(e) => setReason(e.target.value)} />
        <FormActions error={form.error} busy={form.busy} submitLabel="Raise request" onCancel={onClose} />
      </form>
    </Modal>
  );
}
