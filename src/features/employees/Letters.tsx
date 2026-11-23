import { useState } from 'react';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { DownloadButton } from '../../components/DownloadButton';
import { EmptyState } from '../../components/EmptyState';
import { FormActions } from '../../components/FormActions';
import { Input, Textarea } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useSubmit, type FieldErrors } from '../../components/useSubmit';
import { StatusBadge } from '../../components/Badge';
import type { ApiResponse } from '../../lib/api-types';
import { downloadFile } from '../../lib/download';
import { useApiQuery } from '../../lib/query';

type Letters = ApiResponse<'/api/v1/lifecycle/employees/{id}/letters'>;
type Letter = Letters['items'][number];
type Payslips = ApiResponse<'/api/v1/payroll/employees/{id}/payslips'>;

const GROUPS: readonly { key: Letter['group']; label: string }[] = [
  { key: 'employment', label: 'Employment' },
  { key: 'pay', label: 'Salary' },
  { key: 'conduct', label: 'Appreciation and conduct' },
  { key: 'exit', label: 'Leaving and references' },
  { key: 'other', label: 'Other' },
];

/** The letters written through a form. What one says about the person comes from the record; only what is asked for here is typed. With `start`, the form opens on that letter. */
export function WriteLetter({ employeeId, label = 'Write another letter', start = '' }: { employeeId: string; label?: string; start?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{label}</Button>
      {open && <LetterDialog employeeId={employeeId} start={start} onClose={() => setOpen(false)} />}
    </>
  );
}

function LetterDialog({ employeeId, start, onClose }: { employeeId: string; start: string; onClose: () => void }) {
  const query = useApiQuery<Letters>(`/api/v1/lifecycle/employees/${employeeId}/letters`, { staleTime: 0 });
  return (
    <Modal title="Write a letter" size="lg" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>{(d) => <LetterForm employeeId={employeeId} letters={d.items} start={start} onClose={onClose} />}</QueryState>
    </Modal>
  );
}

const initial = (letters: readonly Letter[], key: string): Record<string, string> =>
  Object.fromEntries((letters.find((l) => l.key === key)?.fields ?? []).map((f) => [f.key, f.value ?? '']));

function LetterForm({ employeeId, letters, start, onClose }: { employeeId: string; letters: readonly Letter[]; start: string; onClose: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState(() => (letters.some((l) => l.key === start) ? start : ''));
  const [values, setValues] = useState(() => initial(letters, start));
  const letter = letters.find((l) => l.key === key);
  const s = useSubmit(async () => {
    if (!letter) return;
    const fields = Object.fromEntries(letter.fields.map((f) => [f.key, (values[f.key] ?? '').trim()] as const).filter(([, v]) => v));
    await downloadFile(`/api/v1/lifecycle/employees/${employeeId}/letters/${letter.key}`, `${letter.key}-letter.pdf`, { fields });
    toast(`${letter.label} downloaded`);
  }, { validate: (): FieldErrors => Object.fromEntries((letter?.fields ?? []).filter((f) => f.required && !(values[f.key] ?? '').trim()).map((f) => [f.key, 'This is needed on the letter'])) });
  const pick = (next: string) => {
    setKey(next);
    setValues(initial(letters, next));
    s.setError(null);
  };
  return (
    <form className="stack-3" onSubmit={(e) => void s.submit(e)} noValidate>
      <Select label="Letter" required value={key} placeholder="Select…" onChange={(e) => pick(e.target.value)}>
        {GROUPS.map((g) => {
          const of = letters.filter((l) => l.group === g.key);
          return of.length > 0 && <optgroup key={g.key} label={g.label}>{of.map((l) => <option key={l.key} value={l.key}>{l.unavailable ? `${l.label} (not available)` : l.label}</option>)}</optgroup>;
        })}
      </Select>
      {letter?.unavailable && <Alert tone="warn">{letter.unavailable}.</Alert>}
      {letter && !letter.unavailable && letter.fields.map((f) => {
        const common = { label: f.label, required: f.required, value: values[f.key] ?? '', error: s.errors[f.key], maxLength: f.maxLength };
        const set = (v: string) => { setValues((x) => ({ ...x, [f.key]: v })); s.clearError(f.key); };
        if (f.type === 'date') return <DatePicker key={f.key} label={common.label} required={common.required} value={common.value} error={common.error} onChange={(e) => set(e.target.value)} />;
        return f.type === 'long'
          ? <Textarea key={f.key} {...common} rows={6} onChange={(e) => set(e.target.value)} />
          : <Input key={f.key} {...common} inputMode={f.type === 'money' ? 'decimal' : undefined} onChange={(e) => set(e.target.value)} />;
      })}
      {letter && !letter.unavailable && <p className="text-sm text-2">{letter.fields.some((f) => f.type === 'money') ? 'Check what is filled in: the record shows what applies now. ' : 'Names, dates and salary come from the record. '}The download is recorded in the audit log, and no copy is kept.</p>}
      <FormActions error={s.error} busy={s.busy} submitLabel="Download PDF" disabled={!letter || !!letter.unavailable} onCancel={onClose} />
    </form>
  );
}

/** Someone's salary slips as PDF, for payroll's readers. The figures are on the file only. */
export function SalarySlips({ employeeId }: { employeeId: string }) {
  const { canAny, hasFeature } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasFeature('FEATURE_PAYSLIPS') || !canAny('payroll.read', 'payroll.manage')) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Salary slips</Button>
      {open && <SlipsDialog employeeId={employeeId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SlipsDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const query = useApiQuery<Payslips>(`/api/v1/payroll/employees/${employeeId}/payslips`);
  return (
    <Modal title="Salary slips" onClose={onClose}>
      <QueryState query={query} loading={<SkeletonRows />}>
        {(d) => (d.items.length
          ? (
            <ul className="list-plain stack-2">
              {d.items.map((p) => (
                <li key={p.id} className="cluster-between">
                  <span className="cluster"><span className="mono">{p.period}</span><StatusBadge status={p.status} /></span>
                  <DownloadButton url={`/api/v1/payroll/payslips/${p.id}/payslip.pdf`} fileName={`payslip-${p.period}.pdf`} aria-label={`Salary slip for ${p.period}`}>PDF</DownloadButton>
                </li>
              ))}
            </ul>
          )
          : <EmptyState compact title="No salary slips yet." />)}
      </QueryState>
    </Modal>
  );
}
