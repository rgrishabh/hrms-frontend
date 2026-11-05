import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge, statusLabel } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { FormActions } from '../../components/FormActions';
import { Checkbox, Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useTableState } from '../../components/useTableState';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDate, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { AUTH_URL, validityTone, type Course, type TrainingRecord } from './types';

const RESULTS = [{ value: 'passed', label: 'Passed' }, { value: 'completed', label: 'Completed, no test' }, { value: 'failed', label: 'Failed' }];

export function TrainingRecords() {
  const { can, me } = useAuth();
  const toast = useToast();
  const manage = can('training.manage');
  const [adding, setAdding] = useState(false);
  const [revoke, setRevoke] = useState<TrainingRecord | null>(null);
  const courses = useApiQuery<ApiResponse<'/api/v1/competency/courses'>>(manage ? `${AUTH_URL}/courses` : null);
  const columns: Column<TrainingRecord>[] = [
    { key: 'employee', header: 'Employee', card: 'title', required: true, cell: (t) => <>{t.employee_name} <span className="table__cell-sub mono">{t.employee_code}</span></> },
    { key: 'status', header: 'Status', card: 'status', cell: (t) => <Badge tone={validityTone(t.validity)}>{statusLabel(t.validity)}</Badge> },
    { key: 'course', header: 'Course', cell: (t) => <><span className="mono">{t.course_code}</span> {t.course_name}</> },
    { key: 'completed', header: 'Completed', cell: (t) => fmtDate(t.completed_on) },
    { key: 'until', header: 'Valid until', cell: (t) => fmtDate(t.expires_on) },
    { key: 'trainer', header: 'Trainer', cell: (t) => t.trainer ?? t.provider ?? '—' },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (t) => (manage && t.status === 'active' && t.employee_id !== me?.user.employeeId ? <div className="table__actions"><Button size="sm" onClick={() => setRevoke(t)}>Revoke</Button></div> : null) },
  ];
  const table = useTableState('competency-training', columns);
  const expiring = table.filters['expiring'] === 'yes';
  const query = useApiQuery<ApiResponse<'/api/v1/competency/training-records'>>(`${AUTH_URL}/training-records${qs({ page: table.page, pageSize: 25, expiringWithinDays: expiring ? 30 : undefined })}`, { placeholderData: (p) => p });
  const active = courses.data?.items.filter((c) => c.status === 'active') ?? [];
  return (
    <div className="stack-3">
      <FilterBar actions={manage && <Button variant="primary" disabled={!active.length} onClick={() => setAdding(true)}>Record training</Button>}>
        <Checkbox label="Expired or expiring within 30 days" checked={expiring} onChange={(e) => table.setFilter('expiring', e.target.checked ? 'yes' : '')} />
      </FilterBar>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<GraduationCap />} title={expiring ? 'Nothing expired or expiring soon' : 'No training records'} />}>
        {(d) => <Table label="Training records" columns={columns} rows={d.items} rowKey={(t) => t.id} hidden={table.hidden} onToggleColumn={table.toggleColumn} views={table.views} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: table.setPage }} />}
      </QueryState>
      {adding && <TrainingForm courses={active} onClose={() => setAdding(false)} />}
      {revoke && (
        <ConfirmDialog
          title="Revoke training record"
          message={`Revoke ${revoke.course_code} for ${revoke.employee_name}? Give a reason. This is kept in the audit log.`}
          confirmLabel="Revoke record"
          danger
          requireComment
          onClose={() => setRevoke(null)}
          onConfirm={async (reason) => { await api.post(`${AUTH_URL}/training-records/${revoke.id}/revoke`, { reason }); toast('Record revoked'); await invalidateApi(`${AUTH_URL}/training-records`); }}
        />
      )}
    </div>
  );
}

function TrainingForm({ courses, onClose }: { courses: readonly Course[]; onClose: () => void }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ courseId: courses[0]?.id ?? '', completedOn: todayLocal(), result: 'passed', trainer: '', provider: '', hours: '', notes: '' });
  const { busy, errors, error, submit } = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/competency/training-records', 'post'>>(`${AUTH_URL}/training-records`, { ...f, employeeId: employee!.id, hours: f.hours ? Number(f.hours) : null });
    toast(r.expiresOn ? `Recorded; valid until ${fmtDate(r.expiresOn)}` : 'Recorded');
    await invalidateApi(`${AUTH_URL}/training-records`);
    onClose();
  }, { validate: (): FieldErrors => (employee ? {} : { employeeId: 'Choose the employee' }) });
  return (
    <Modal title="Record training" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <EmployeeField required error={errors['employeeId']} value={employee} onChange={setEmployee} />
        <div className="columns-form">
          <Select label="Course" error={errors['courseId']} value={f.courseId} options={courses.map((c) => ({ value: c.id, label: `${c.code}: ${c.name}` }))} onChange={(e) => setF({ ...f, courseId: e.target.value })} />
          <DatePicker label="Completed on" required max={todayLocal()} error={errors['completedOn']} value={f.completedOn} onChange={(e) => setF({ ...f, completedOn: e.target.value })} />
          <Select label="Result" error={errors['result']} value={f.result} options={RESULTS} onChange={(e) => setF({ ...f, result: e.target.value })} />
          <Input label="Hours" type="number" inputMode="decimal" min={0.1} step={0.1} error={errors['hours']} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
          <Input label="Trainer" error={errors['trainer']} value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} />
          <Input label="Provider (external)" error={errors['provider']} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
        </div>
        <Textarea label="Notes" hint="Certificates can be uploaded to the employee's documents" error={errors['notes']} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <FormActions error={error} busy={busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
