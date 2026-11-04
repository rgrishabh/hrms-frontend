import { useState } from 'react';
import { api } from '../../api';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { QueryState } from '../../components/QueryState';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { ArrowUp } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../../format';
import { invalidateApi, useApiQuery } from '../../lib/query';

type SectionKey = 'contacts' | 'addresses' | 'nominees' | 'education' | 'experience';
type Item = Record<string, string | number | null>;
interface FieldDef { key: string; label: string; type?: 'text' | 'date' | 'number' | 'select' | 'tel'; options?: [string, string][]; required?: boolean; wide?: boolean; hint?: string }
interface SectionDef { key: SectionKey; title: string; fields: FieldDef[]; blank: Item; summary: (x: Item) => string; empty: string; max: number }

const PURPOSES: [string, string][] = [['pf', 'Provident fund'], ['gratuity', 'Gratuity'], ['insurance', 'Insurance'], ['other', 'Other']];
const LEVELS: [string, string][] = [['secondary', 'Secondary (10th)'], ['higher_secondary', 'Higher secondary (12th)'], ['diploma', 'Diploma'], ['graduate', 'Graduate'], ['postgraduate', 'Postgraduate'], ['doctorate', 'Doctorate'], ['certification', 'Certification'], ['other', 'Other']];
const optLabel = (opts: [string, string][], v: unknown) => opts.find(([k]) => k === v)?.[1] ?? String(v);
const d = (v: Item[string] | undefined) => fmtDate(v as string | null | undefined);

const SECTIONS: SectionDef[] = [
  {
    key: 'contacts', title: 'Emergency contacts', max: 5, empty: 'No emergency contact yet.', blank: { name: '', relationship: '', phone: '', altPhone: '' },
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'relationship', label: 'Relationship', required: true }, { key: 'phone', label: 'Phone', type: 'tel', required: true }, { key: 'altPhone', label: 'Alternate phone', type: 'tel' }],
    summary: (x) => `${x.name} (${x.relationship}) · ${x.phone}${x.altPhone ? ` · ${x.altPhone}` : ''}`,
  },
  {
    key: 'addresses', title: 'Addresses', max: 2, empty: 'No address yet.', blank: { kind: 'current', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' },
    fields: [{ key: 'kind', label: 'Address', type: 'select', options: [['current', 'Current'], ['permanent', 'Permanent']], required: true }, { key: 'line1', label: 'Address line 1', required: true, wide: true }, { key: 'line2', label: 'Address line 2', wide: true }, { key: 'city', label: 'City', required: true }, { key: 'state', label: 'State', required: true }, { key: 'postalCode', label: 'PIN code', required: true }, { key: 'country', label: 'Country', required: true }],
    summary: (x) => `${x.kind === 'current' ? 'Current' : 'Permanent'}: ${[x.line1, x.line2, x.city, `${x.state} ${x.postalCode}`, x.country !== 'India' ? x.country : null].filter(Boolean).join(', ')}`,
  },
  {
    key: 'nominees', title: 'Nominees', max: 12, empty: 'No nominee yet.', blank: { purpose: 'pf', name: '', relationship: '', dateOfBirth: '', sharePercent: 100, guardianName: '', address: '' },
    fields: [{ key: 'purpose', label: 'For', type: 'select', options: PURPOSES, required: true }, { key: 'name', label: 'Name', required: true }, { key: 'relationship', label: 'Relationship', required: true }, { key: 'dateOfBirth', label: 'Date of birth', type: 'date' }, { key: 'sharePercent', label: 'Share %', type: 'number', required: true, hint: 'Shares for each purpose add up to 100' }, { key: 'guardianName', label: 'Guardian (for a minor)' }, { key: 'address', label: 'Address', wide: true }],
    summary: (x) => `${optLabel(PURPOSES, x.purpose)}: ${x.name} (${x.relationship}) · ${x.sharePercent}%${x.dateOfBirth ? ` · born ${d(x.dateOfBirth)}` : ''}${x.guardianName ? ` · guardian ${x.guardianName}` : ''}`,
  },
  {
    key: 'education', title: 'Education', max: 15, empty: 'No qualification recorded.', blank: { level: 'graduate', qualification: '', institution: '', university: '', yearOfPassing: '', score: '' },
    fields: [{ key: 'level', label: 'Level', type: 'select', options: LEVELS, required: true }, { key: 'qualification', label: 'Qualification', required: true }, { key: 'institution', label: 'Institution', required: true }, { key: 'university', label: 'Board / university' }, { key: 'yearOfPassing', label: 'Year of passing', type: 'number' }, { key: 'score', label: 'Score', hint: '% / CGPA / class' }],
    summary: (x) => `${x.qualification}, ${x.institution}${x.university ? `, ${x.university}` : ''}${x.yearOfPassing ? ` (${x.yearOfPassing})` : ''}${x.score ? ` · ${x.score}` : ''}`,
  },
  {
    key: 'experience', title: 'Previous employment', max: 20, empty: 'No previous employment recorded.', blank: { employer: '', designation: '', fromDate: '', toDate: '', reasonForLeaving: '' },
    fields: [{ key: 'employer', label: 'Employer', required: true }, { key: 'designation', label: 'Designation', required: true }, { key: 'fromDate', label: 'From', type: 'date', required: true }, { key: 'toDate', label: 'To', type: 'date', required: true }, { key: 'reasonForLeaving', label: 'Reason for leaving', wide: true }],
    summary: (x) => `${x.designation}, ${x.employer} · ${d(x.fromDate)} – ${d(x.toDate)}${x.reasonForLeaving ? ` · ${x.reasonForLeaving}` : ''}`,
  },
];
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<SectionKey, SectionDef>;

/** Form values to API items: blanks become null, numbers become numbers. */
function toItems(section: SectionKey, rows: Item[]) {
  return rows.map((r) => Object.fromEntries(SECTION[section].fields.map((f) => {
    const v = r[f.key];
    if (v === '' || v === undefined || v === null) return [f.key, f.type === 'select' ? v : null];
    return [f.key, f.type === 'number' ? Number(v) : typeof v === 'string' ? v.trim() : v];
  })));
}

interface Profile {
  missing: string[];
  sections: Record<SectionKey, Item[]>;
  edit: Record<SectionKey, 'direct' | 'approval' | null>;
  pending: { id: string; section: SectionKey; created_at: string; requested_by_name: string; items: Item[]; note: string | null }[];
}

function Editor({ employeeId, section, mode, initial, onClose }: { employeeId: string; section: SectionKey; mode: 'direct' | 'approval'; initial: Item[]; onClose: () => void }) {
  const def = SECTION[section];
  const toast = useToast();
  const [rows, setRows] = useState<Item[]>(initial.length ? initial.map((x) => ({ ...def.blank, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? ''])) })) : [{ ...def.blank }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const moveUp = (i: number) => setRows((rs) => { const n = [...rs]; [n[i], n[i - 1]] = [n[i - 1]!, n[i]!]; return n; });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.put<{ applied: boolean }>(`/api/v1/employees/${employeeId}/profile/${section}`, { items: toItems(section, rows), note: note || undefined });
      toast(r.applied ? `${def.title} saved` : `${def.title} sent to HR for approval`);
      await invalidateApi(`/api/v1/employees/${employeeId}/profile`);
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal
      title={`Edit ${def.title.toLowerCase()}`}
      size="lg"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{mode === 'approval' ? 'Send for approval' : 'Save'}</Button></>}
    >
      <div className="stack-4">
        {mode === 'approval' && <Alert tone="warn">HR checks changes to {def.title.toLowerCase()}. They apply once approved.</Alert>}
        {rows.map((r, i) => (
          <Card
            key={i}
            headingLevel={3}
            aria-label={`${def.title} entry ${i + 1}`}
            title={section === 'contacts' ? `Contact ${i + 1}${i === 0 ? ' (call first)' : ''}` : `Entry ${i + 1}`}
            actions={(
              <>
                {section === 'contacts' && i > 0 && <Button size="sm" iconOnly aria-label="Move up" icon={<ArrowUp aria-hidden="true" />} onClick={() => moveUp(i)} />}
                <Button size="sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</Button>
              </>
            )}
          >
            <div className="columns-form">
              {def.fields.map((f) => {
                const common = { label: f.label, required: f.required, hint: f.hint, fieldClassName: f.wide ? 'span-all' : undefined };
                if (f.type === 'select') return <Select key={f.key} {...common} value={String(r[f.key] ?? '')} options={f.options?.map(([value, label]) => ({ value, label }))} onChange={(e) => set(i, f.key, e.target.value)} />;
                if (f.type === 'date') return <DatePicker key={f.key} {...common} value={String(r[f.key] ?? '')} onChange={(e) => set(i, f.key, e.target.value)} />;
                return <Input key={f.key} {...common} type={f.type ?? 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} step={f.key === 'sharePercent' ? '0.01' : undefined} value={String(r[f.key] ?? '')} onChange={(e) => set(i, f.key, e.target.value)} />;
              })}
            </div>
          </Card>
        ))}
        {rows.length < def.max && (
          <div>
            <Button onClick={() => setRows((rs) => [...rs, { ...def.blank, ...(section === 'addresses' ? { kind: rs.some((x) => x.kind === 'current') ? 'permanent' : 'current' } : {}) }])}>
              Add {section === 'addresses' ? 'address' : 'entry'}
            </Button>
          </div>
        )}
        {mode === 'approval' && <Input label="Note for HR (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        <InlineError error={err} />
      </div>
    </Modal>
  );
}

/** The personal sections of an employee's record, with editing as the viewer is allowed. */
export function PersonalDetails({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const query = useApiQuery<Profile>(`/api/v1/employees/${employeeId}/profile`);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);
  return (
    <QueryState query={query}>
      {(data) => {
        const editMode = editing ? data.edit[editing] : null;
        return (
          <div className="stack-3">
            {data.missing.length > 0 && <Alert tone="warn">Still to fill in: {data.missing.join(', ')}.</Alert>}
            {SECTIONS.map((s) => {
              const items = data.sections[s.key];
              const mode = data.edit[s.key];
              const pending = data.pending.find((p) => p.section === s.key);
              return (
                <Card key={s.key} title={s.title} aria-label={s.title} actions={mode && !pending ? <Button size="sm" onClick={() => setEditing(s.key)}>{items.length ? 'Edit' : 'Add'}</Button> : undefined}>
                  <div className="stack-3">
                    {items.length ? <ul className="stack-1 text-list">{items.map((x, i) => <li key={i}>{s.summary(x)}</li>)}</ul> : <EmptyState compact title={s.empty} />}
                    {pending && (
                      <Alert tone="warn" live>
                        <div className="cluster-between">
                          <span><strong>Change awaiting HR approval</strong>, sent {fmtDateTime(pending.created_at)} by {pending.requested_by_name}</span>
                          {mode === 'approval' && <Button size="sm" onClick={() => setWithdraw(pending.id)}>Withdraw</Button>}
                        </div>
                        {pending.items.length ? <ul className="stack-1 text-list">{pending.items.map((x, i) => <li key={i}>{s.summary(x)}</li>)}</ul> : <div>Remove all entries.</div>}
                        {pending.note && <div>“{pending.note}”</div>}
                      </Alert>
                    )}
                  </div>
                </Card>
              );
            })}
            {editing && editMode && <Editor employeeId={employeeId} section={editing} mode={editMode} initial={data.sections[editing]} onClose={() => setEditing(null)} />}
            {withdraw && (
              <ConfirmDialog
                title="Withdraw change"
                message="Withdraw this change? Your details stay as they are."
                confirmLabel="Withdraw"
                onClose={() => setWithdraw(null)}
                onConfirm={async () => {
                  await api.post(`/api/v1/employees/profile-changes/${withdraw}/withdraw`);
                  toast('Change withdrawn');
                  await invalidateApi(`/api/v1/employees/${employeeId}/profile`);
                }}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

/** For an approver: the proposed section next to what is recorded now. */
export function ProfileChangeView({ changeId }: { changeId: string }) {
  const query = useApiQuery<{ section: SectionKey; items: Item[]; current: Item[]; note: string | null }>(`/api/v1/employees/profile-changes/${changeId}`);
  return (
    <QueryState query={query} compact>
      {(data) => {
        const s = SECTION[data.section];
        const list = (items: Item[]) => (items.length ? <ul className="stack-1 text-list">{items.map((x, i) => <li key={i}>{s.summary(x)}</li>)}</ul> : <span className="text-2">None</span>);
        return (
          <div className="columns-2">
            <Card headingLevel={3} title={`Proposed ${s.title.toLowerCase()}`}><div className="stack-2">{list(data.items)}{data.note && <div className="text-2">“{data.note}”</div>}</div></Card>
            <Card headingLevel={3} title="Recorded now">{list(data.current)}</Card>
          </div>
        );
      }}
    </QueryState>
  );
}
