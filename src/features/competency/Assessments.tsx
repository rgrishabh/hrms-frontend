import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import type { PickerItem } from '../../components/Picker';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useAction, useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtDate, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { EmployeeField } from '../employees/EmployeeField';
import { ACTIVITY, APPROACH, asOptions, AUTH_URL, RESULT_LABEL, type AssessmentRow, type Method } from './types';

export function Assessments() {
  const { can, me } = useAuth();
  const { run, isBusy } = useAction();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const mayAssess = can('competency.assess');
  const methods = useApiQuery<ApiResponse<'/api/v1/competency/methods'>>(mayAssess ? `${AUTH_URL}/methods` : null);
  const query = useApiQuery<ApiResponse<'/api/v1/competency/assessments'>>(`${AUTH_URL}/assessments${qs({ page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const columns: Column<AssessmentRow>[] = [
    { key: 'employee', header: 'Employee', card: 'title', cell: (s) => s.employee_name },
    { key: 'result', header: 'Result', card: 'status', cell: (s) => <Badge tone={s.result === 'competent' ? 'ok' : 'danger'}>{RESULT_LABEL[s.result] ?? s.result}</Badge> },
    { key: 'date', header: 'Date', card: 'subtitle', cell: (s) => fmtDate(s.assessed_on) },
    { key: 'method', header: 'Method', cell: (s) => <span className="mono">{s.method_code}</span> },
    { key: 'activity', header: 'Activity', cell: (s) => ACTIVITY[s.activity] ?? s.activity },
    { key: 'approach', header: 'Approach', cell: (s) => <span title={s.evidence}>{APPROACH[s.approach] ?? s.approach}</span> },
    { key: 'assessor', header: 'Assessor', cell: (s) => s.assessor_name },
    {
      key: 'actions', header: 'Actions', card: 'actions', cell: (s) => (mayAssess && s.result === 'competent' && !s.used && s.employee_id !== me?.user.employeeId
        ? <div className="table__actions"><Button size="sm" loading={isBusy(s.id)} onClick={() => void run(s.id, async () => { await api.post(`${AUTH_URL}/authorizations`, { assessmentId: s.id }); await invalidateApi(`${AUTH_URL}/assessments`, `${AUTH_URL}/authorizations`); }, 'Sent to quality for authorization')}>Request authorization</Button></div>
        : null),
    },
  ];
  const active = methods.data?.items.filter((m) => m.status === 'active') ?? [];
  return (
    <div className="stack-3">
      {mayAssess && <div className="cluster-between"><span /><Button variant="primary" disabled={!active.length} onClick={() => setAdding(true)}>Record assessment</Button></div>}
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ClipboardCheck />} title="No assessments recorded" />}>
        {(d) => <Table label="Competency assessments" columns={columns} rows={d.items} rowKey={(s) => s.id} refreshing={query.isPlaceholderData} pagination={{ page: d.page, pageSize: d.pageSize, total: d.total, onPage: setPage }} />}
      </QueryState>
      {adding && <AssessmentForm methods={active} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AssessmentForm({ methods, onClose }: { methods: readonly Method[]; onClose: () => void }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<PickerItem | null>(null);
  const [f, setF] = useState({ methodId: methods[0]?.id ?? '', activity: 'perform', approach: 'replicate', assessedOn: todayLocal(), result: 'competent', evidence: '' });
  const { busy, errors, error, submit } = useSubmit(async () => {
    await api.post(`${AUTH_URL}/assessments`, { ...f, employeeId: employee!.id });
    toast('Assessment recorded');
    await invalidateApi(`${AUTH_URL}/assessments`);
    onClose();
  }, { validate: (): FieldErrors => (employee ? {} : { employeeId: 'Choose the employee' }) });
  return (
    <Modal title="Record competency assessment" onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <EmployeeField required error={errors['employeeId']} value={employee} onChange={setEmployee} />
        <div className="columns-form">
          <Select label="Method" error={errors['methodId']} value={f.methodId} options={methods.map((m) => ({ value: m.id, label: `${m.code}: ${m.name}` }))} onChange={(e) => setF({ ...f, methodId: e.target.value })} />
          <Select label="Activity" error={errors['activity']} value={f.activity} options={asOptions(ACTIVITY)} onChange={(e) => setF({ ...f, activity: e.target.value })} />
          <Select label="How competence was assessed" error={errors['approach']} value={f.approach} options={asOptions(APPROACH)} onChange={(e) => setF({ ...f, approach: e.target.value })} />
          <DatePicker label="Date" required max={todayLocal()} error={errors['assessedOn']} value={f.assessedOn} onChange={(e) => setF({ ...f, assessedOn: e.target.value })} />
          <Select label="Result" error={errors['result']} value={f.result} options={asOptions(RESULT_LABEL)} onChange={(e) => setF({ ...f, result: e.target.value })} />
        </div>
        <Textarea label="Evidence" hint="For example a proficiency scheme and round with z-score, replicate RSD against the method limit, or a witnessed run reference" required minLength={3} error={errors['evidence']} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} />
        <FormActions error={error} busy={busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
