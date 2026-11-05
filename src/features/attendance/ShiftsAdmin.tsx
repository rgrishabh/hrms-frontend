import { useState, type ChangeEvent } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../../api';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { Table, type Column } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { fmtMinutes, todayLocal } from '../../format';
import type { ApiResponse } from '../../lib/api-types';
import { invalidateApi, useApiQuery } from '../../lib/query';
import { PeoplePicker } from './PeoplePicker';
import type { Shift } from './types';

interface ShiftForm {
  id?: string; code: string; name: string; startTime: string; endTime: string; breakMinutes: number | ''; graceMinutes: number | ''; earlyExitGraceMinutes: number | '';
  halfDayMinMinutes: number | ''; fullDayMinMinutes: number | ''; overtimeAfterMinutes: number | ''; status: string;
}
const EMPTY: ShiftForm = { code: '', name: '', startTime: '09:30', endTime: '18:00', breakMinutes: 30, graceMinutes: 10, earlyExitGraceMinutes: 10, halfDayMinMinutes: 240, fullDayMinMinutes: 450, overtimeAfterMinutes: '', status: 'active' };
const toForm = (s: Shift): ShiftForm => ({
  id: s.id, code: s.code, name: s.name, startTime: s.start_time.slice(0, 5), endTime: s.end_time.slice(0, 5), breakMinutes: s.break_minutes, graceMinutes: s.grace_minutes, earlyExitGraceMinutes: s.early_exit_grace_minutes,
  halfDayMinMinutes: s.half_day_min_minutes, fullDayMinMinutes: s.full_day_min_minutes, overtimeAfterMinutes: s.overtime_after_minutes ?? '', status: s.status,
});

export function ShiftsAdmin() {
  const query = useApiQuery<ApiResponse<'/api/v1/attendance/shifts'>>('/api/v1/attendance/shifts');
  const [edit, setEdit] = useState<ShiftForm | null>(null);
  const [assign, setAssign] = useState<Shift | null>(null);
  const columns: Column<Shift>[] = [
    { key: 'code', header: 'Code', card: 'subtitle', cell: (s) => <span className="mono">{s.code}</span> },
    { key: 'name', header: 'Name', card: 'title', cell: (s) => s.name },
    { key: 'timing', header: 'Timing', cell: (s) => <span className="cluster tnum">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}{s.overnight && <Badge tone="info">Overnight</Badge>}</span> },
    { key: 'break', header: 'Break', cell: (s) => `${s.break_minutes}m` },
    { key: 'grace', header: 'Grace', cell: (s) => <span className="nowrap">{s.grace_minutes}m / {s.early_exit_grace_minutes}m</span> },
    { key: 'minimum', header: 'Full / half day', cell: (s) => <span className="nowrap">{fmtMinutes(s.full_day_min_minutes)} / {fmtMinutes(s.half_day_min_minutes)}</span> },
    { key: 'overtime', header: 'OT after', cell: (s) => <span className="nowrap">{s.overtime_after_minutes ? fmtMinutes(s.overtime_after_minutes) : '—'}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (s) => <StatusBadge status={s.status} /> },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (s) => <div className="table__actions"><Button size="sm" onClick={() => setEdit(toForm(s))}>Edit</Button>{s.status === 'active' && <Button size="sm" onClick={() => setAssign(s)}>Assign</Button>}</div> },
  ];
  return (
    <div className="stack-3">
      <div className="cluster-between"><span /><Button variant="primary" onClick={() => setEdit({ ...EMPTY })}>New shift</Button></div>
      <QueryState query={query} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Clock />} title="No shifts yet" description="Create a shift so attendance can be calculated." />}>
        {(d) => <Table label="Shifts" columns={columns} rows={d.items} rowKey={(s) => s.id} />}
      </QueryState>
      {edit && <ShiftFormDialog shift={edit} onClose={() => setEdit(null)} />}
      {assign && <AssignShift shift={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}

function ShiftFormDialog({ shift, onClose }: { shift: ShiftForm; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(shift);
  const num = (k: keyof ShiftForm) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const overnight = f.endTime <= f.startTime;
  const s = useSubmit(async () => {
    const { id, ...rest } = f;
    const body = { ...rest, overtimeAfterMinutes: f.overtimeAfterMinutes === '' ? null : f.overtimeAfterMinutes };
    if (id) await api.put(`/api/v1/attendance/shifts/${id}`, body); else await api.post('/api/v1/attendance/shifts', body);
    toast('Shift saved. Recalculate affected dates from Team attendance if needed.');
    await invalidateApi('/api/v1/attendance/shifts');
    onClose();
  }, { validate: (): FieldErrors => (f.fullDayMinMinutes !== '' && f.halfDayMinMinutes !== '' && f.halfDayMinMinutes > f.fullDayMinMinutes ? { halfDayMinMinutes: 'Cannot be more than the full-day minimum' } : {}) });
  return (
    <Modal title={shift.id ? 'Edit shift' : 'New shift'} size="lg" onClose={onClose}>
      <form className="stack-4" onSubmit={s.submit}>
        <div className="columns-form">
          <Input label="Code" hint="For example GEN or NIGHT" required error={s.errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required error={s.errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Start time" type="time" required error={s.errors['startTime']} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          <Input label="End time" type="time" required hint={overnight ? 'Ends next day (overnight shift)' : undefined} error={s.errors['endTime']} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <Input label="Break (minutes)" hint="Deducted when the day has a single in and out pair" type="number" inputMode="numeric" min={0} required error={s.errors['breakMinutes']} value={f.breakMinutes} onChange={num('breakMinutes')} />
          <Input label="Late grace (minutes)" type="number" inputMode="numeric" min={0} required error={s.errors['graceMinutes']} value={f.graceMinutes} onChange={num('graceMinutes')} />
          <Input label="Early-exit grace (minutes)" type="number" inputMode="numeric" min={0} required error={s.errors['earlyExitGraceMinutes']} value={f.earlyExitGraceMinutes} onChange={num('earlyExitGraceMinutes')} />
          <Input label="Full-day minimum (minutes)" type="number" inputMode="numeric" min={60} required error={s.errors['fullDayMinMinutes']} value={f.fullDayMinMinutes} onChange={num('fullDayMinMinutes')} />
          <Input label="Half-day minimum (minutes)" type="number" inputMode="numeric" min={30} required error={s.errors['halfDayMinMinutes']} value={f.halfDayMinMinutes} onChange={num('halfDayMinMinutes')} />
          <Input label="Overtime after (minutes)" hint="Blank means no overtime" type="number" inputMode="numeric" min={60} error={s.errors['overtimeAfterMinutes']} value={f.overtimeAfterMinutes} onChange={num('overtimeAfterMinutes')} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        <FormActions error={s.error} busy={s.busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function AssignShift({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(todayLocal());
  const s = useSubmit(async () => {
    const r = await api.post<ApiResponse<'/api/v1/attendance/shift-assignments', 'post'>>('/api/v1/attendance/shift-assignments', { employeeIds: Object.keys(selected), shiftId: shift.id, effectiveFrom: from });
    toast(`Assigned ${r.assigned} employee(s)`);
    onClose();
  }, { validate: (): FieldErrors => (Object.keys(selected).length ? {} : { people: 'Select at least one person' }) });
  return (
    <Modal title={`Assign ${shift.code} shift`} onClose={onClose}>
      <form className="stack-3" onSubmit={s.submit}>
        <DatePicker label="Effective from" required hint="The employee's previous shift ends the day before" value={from} onChange={(e) => setFrom(e.target.value)} />
        <PeoplePicker selected={selected} onChange={(x) => { setSelected(x); s.clearError('people'); }} />
        <FormActions error={s.errors['people'] ?? s.error} busy={s.busy} submitLabel="Assign" onCancel={onClose} />
      </form>
    </Modal>
  );
}
