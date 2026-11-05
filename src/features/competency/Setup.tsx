import { useState } from 'react';
import { BookOpen, FlaskConical } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
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
import { invalidateApi, useApiQuery } from '../../lib/query';
import { asOptions, AUTH_URL, COURSE_KIND, LAB_COURSE_KIND, type Course, type Method } from './types';

const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const COURSES_URL = `${AUTH_URL}/courses`;
const METHODS_URL = `${AUTH_URL}/methods`;

export function Setup() {
  const { can, hasFeature } = useAuth();
  const lab = hasFeature('FEATURE_LAB_COMPETENCY');
  const courses = useApiQuery<ApiResponse<'/api/v1/competency/courses'>>(COURSES_URL);
  const methods = useApiQuery<ApiResponse<'/api/v1/competency/methods'>>(lab ? METHODS_URL : null);
  const [course, setCourse] = useState<Course | 'new' | null>(null);
  const [method, setMethod] = useState<Method | 'new' | null>(null);
  const kinds = { ...COURSE_KIND, ...(lab ? LAB_COURSE_KIND : {}) };
  const courseColumns: Column<Course>[] = [
    { key: 'name', header: 'Name', card: 'title', cell: (c) => c.name },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (c) => <span className="mono">{c.code}</span> },
    { key: 'status', header: 'Status', card: 'status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'kind', header: 'Type', cell: (c) => kinds[c.kind] ?? 'Other' },
    { key: 'validity', header: 'Validity', cell: (c) => (c.validity_months ? `${c.validity_months} months` : 'No expiry') },
    { key: 'records', header: 'Records', align: 'right', cell: (c) => c.records },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (c) => (can('training.manage') ? <div className="table__actions"><Button size="sm" onClick={() => setCourse(c)}>Edit</Button></div> : null) },
  ];
  const methodColumns: Column<Method>[] = [
    { key: 'name', header: 'Method', card: 'title', cell: (m) => <span className="cluster">{m.name}{m.status !== 'active' && <Badge>Inactive</Badge>}</span> },
    { key: 'code', header: 'Code', card: 'subtitle', cell: (m) => <span className="mono">{m.code}</span> },
    { key: 'standard', header: 'Standard', cell: (m) => m.standard_ref ?? '—' },
    { key: 'discipline', header: 'Discipline / matrix', cell: (m) => [m.discipline, m.matrix].filter(Boolean).join(' · ') || '—' },
    { key: 'training', header: 'Required training', cell: (m) => m.requirements.map((r) => r.code).join(', ') || '—' },
    { key: 'review', header: 'Review', cell: (m) => `${m.review_months} months` },
    { key: 'actions', header: 'Actions', card: 'actions', cell: (m) => (can('competency.manage') ? <div className="table__actions"><Button size="sm" onClick={() => setMethod(m)}>Edit</Button></div> : null) },
  ];
  return (
    <div className="stack-4">
      <Card title="Training courses" flush actions={can('training.manage') && <Button variant="primary" size="sm" onClick={() => setCourse('new')}>New course</Button>}>
        <QueryState query={courses} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<BookOpen />} title="No courses yet" description={lab ? 'For example lab induction, chemical safety, or instrument operation per method.' : 'For example induction, safety or code of conduct.'} />}>
          {(d) => <Table label="Training courses" columns={courseColumns} rows={d.items} rowKey={(c) => c.id} />}
        </QueryState>
      </Card>
      {lab && (
        <Card title="Laboratory methods" flush actions={can('competency.manage') && <Button variant="primary" size="sm" onClick={() => setMethod('new')}>New method</Button>}>
          <QueryState query={methods} isEmpty={(d) => !d.items.length} empty={<EmptyState compact icon={<FlaskConical />} title="No methods yet" description="Add the test methods in your scope, with the training each one requires." />}>
            {(d) => <Table label="Laboratory methods" columns={methodColumns} rows={d.items} rowKey={(m) => m.id} />}
          </QueryState>
        </Card>
      )}
      {course && <CourseForm course={course === 'new' ? null : course} kinds={kinds} lab={lab} onClose={() => setCourse(null)} />}
      {method && <MethodForm method={method === 'new' ? null : method} courses={courses.data?.items ?? []} onClose={() => setMethod(null)} />}
    </div>
  );
}

function CourseForm({ course, kinds, lab, onClose }: { course: Course | null; kinds: Record<string, string>; lab: boolean; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: course?.code ?? '', name: course?.name ?? '', kind: course?.kind ?? (lab ? 'method' : 'induction'), description: course?.description ?? '', validityMonths: course?.validity_months?.toString() ?? '', status: course?.status ?? 'active' });
  const { busy, errors, error, submit } = useSubmit(async () => {
    const body = { ...f, validityMonths: f.validityMonths ? Number(f.validityMonths) : null };
    if (course) await api.put(`${COURSES_URL}/${course.id}`, body); else await api.post(COURSES_URL, body);
    toast('Saved');
    await invalidateApi(COURSES_URL);
    onClose();
  });
  // A course saved earlier under a kind no longer offered keeps it, so editing does not change it silently.
  const kindOptions = kinds[f.kind] ? asOptions(kinds) : [...asOptions(kinds), { value: f.kind, label: 'Other' }];
  return (
    <Modal title={course ? `Edit ${course.code}` : 'New training course'} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <div className="columns-form">
          <Input label="Code" required pattern="[A-Z][A-Z0-9_\-]*" title="Letters, numbers, hyphen and underscore, starting with a letter" maxLength={30} error={errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required minLength={2} maxLength={150} error={errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Type" error={errors['kind']} value={f.kind} options={kindOptions} onChange={(e) => setF({ ...f, kind: e.target.value })} />
          <Input label="Valid for (months)" hint="Blank means it does not expire" type="number" inputMode="numeric" min={1} max={120} error={errors['validityMonths']} value={f.validityMonths} onChange={(e) => setF({ ...f, validityMonths: e.target.value })} />
          <Select label="Status" error={errors['status']} value={f.status} options={STATUS_OPTIONS} onChange={(e) => setF({ ...f, status: e.target.value })} />
        </div>
        <Input label="Description" maxLength={500} error={errors['description']} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <FormActions error={error} busy={busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}

function MethodForm({ method, courses, onClose }: { method: Method | null; courses: readonly Course[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: method?.code ?? '', name: method?.name ?? '', standardRef: method?.standard_ref ?? '', discipline: method?.discipline ?? '', matrix: method?.matrix ?? '', reviewMonths: method?.review_months ?? 12, status: method?.status ?? 'active', requiredCourseIds: method?.requirements.map((r) => r.id) ?? [] });
  const { busy, errors, error, submit } = useSubmit(async () => {
    if (method) await api.put(`${METHODS_URL}/${method.id}`, f); else await api.post(METHODS_URL, f);
    toast('Saved');
    await invalidateApi(METHODS_URL, `${AUTH_URL}/matrix`);
    onClose();
  });
  return (
    <Modal title={method ? `Edit ${method.code}` : 'New laboratory method'} onClose={onClose}>
      <form className="stack-3" onSubmit={submit}>
        <div className="columns-form">
          <Input label="Code" required pattern="[A-Z][A-Z0-9_.\/\-]*" title="Letters, numbers and _ . / -, starting with a letter" maxLength={40} error={errors['code']} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Input label="Name" required minLength={2} maxLength={200} error={errors['name']} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Standard reference" hint="As cited in your scope" maxLength={200} error={errors['standardRef']} value={f.standardRef} onChange={(e) => setF({ ...f, standardRef: e.target.value })} />
          <Input label="Discipline" maxLength={80} error={errors['discipline']} value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} />
          <Input label="Matrix / product" maxLength={80} error={errors['matrix']} value={f.matrix} onChange={(e) => setF({ ...f, matrix: e.target.value })} />
          <Input label="Review authorizations every (months)" type="number" inputMode="numeric" min={1} max={60} required error={errors['reviewMonths']} value={f.reviewMonths} onChange={(e) => setF({ ...f, reviewMonths: Number(e.target.value) })} />
          <Select label="Status" error={errors['status']} value={f.status} options={STATUS_OPTIONS} onChange={(e) => setF({ ...f, status: e.target.value })} />
        </div>
        <fieldset className="table-toolbar__group">
          <legend>Required training</legend>
          <p className="text-xs text-3">Authorization is possible only while all of these are valid.</p>
          {courses.filter((c) => c.status === 'active' || f.requiredCourseIds.includes(c.id)).map((c) => (
            <Checkbox
              key={c.id}
              label={<><span className="mono">{c.code}</span> {c.name}</>}
              checked={f.requiredCourseIds.includes(c.id)}
              onChange={(e) => setF({ ...f, requiredCourseIds: e.target.checked ? [...f.requiredCourseIds, c.id] : f.requiredCourseIds.filter((x) => x !== c.id) })}
            />
          ))}
        </fieldset>
        <FormActions error={error} busy={busy} submitLabel="Save" onCancel={onClose} />
      </form>
    </Modal>
  );
}
