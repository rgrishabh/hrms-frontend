import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Confirm, useToast, errText } from '../ui';

type Section = 'contacts' | 'addresses' | 'nominees' | 'education' | 'experience';
type Item = Record<string, any>;
type FieldDef = { key: string; label: string; type?: 'text' | 'date' | 'number' | 'select'; options?: [string, string][]; required?: boolean; wide?: boolean; hint?: string };

const PURPOSES: [string, string][] = [['pf', 'Provident fund'], ['gratuity', 'Gratuity'], ['insurance', 'Insurance'], ['other', 'Other']];
const LEVELS: [string, string][] = [['secondary', 'Secondary (10th)'], ['higher_secondary', 'Higher secondary (12th)'], ['diploma', 'Diploma'], ['graduate', 'Graduate'],
  ['postgraduate', 'Postgraduate'], ['doctorate', 'Doctorate'], ['certification', 'Certification'], ['other', 'Other']];
const optLabel = (opts: [string, string][], v: string) => opts.find(([k]) => k === v)?.[1] ?? v;

const SECTIONS: { key: Section; title: string; fields: FieldDef[]; blank: Item; summary: (x: Item) => string; empty: string; max: number }[] = [
  { key: 'contacts', title: 'Emergency contacts', max: 5, empty: 'No emergency contact yet.', blank: { name: '', relationship: '', phone: '', altPhone: '' },
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'relationship', label: 'Relationship', required: true }, { key: 'phone', label: 'Phone', required: true }, { key: 'altPhone', label: 'Alternate phone' }],
    summary: (x) => `${x.name} (${x.relationship}) · ${x.phone}${x.altPhone ? ` · ${x.altPhone}` : ''}` },
  { key: 'addresses', title: 'Addresses', max: 2, empty: 'No address yet.', blank: { kind: 'current', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' },
    fields: [{ key: 'kind', label: 'Address', type: 'select', options: [['current', 'Current'], ['permanent', 'Permanent']], required: true }, { key: 'line1', label: 'Address line 1', required: true, wide: true },
      { key: 'line2', label: 'Address line 2', wide: true }, { key: 'city', label: 'City', required: true }, { key: 'state', label: 'State', required: true },
      { key: 'postalCode', label: 'PIN code', required: true }, { key: 'country', label: 'Country', required: true }],
    summary: (x) => `${x.kind === 'current' ? 'Current' : 'Permanent'}: ${[x.line1, x.line2, x.city, `${x.state} ${x.postalCode}`, x.country !== 'India' ? x.country : null].filter(Boolean).join(', ')}` },
  { key: 'nominees', title: 'Nominees', max: 12, empty: 'No nominee yet.', blank: { purpose: 'pf', name: '', relationship: '', dateOfBirth: '', sharePercent: 100, guardianName: '', address: '' },
    fields: [{ key: 'purpose', label: 'For', type: 'select', options: PURPOSES, required: true }, { key: 'name', label: 'Name', required: true }, { key: 'relationship', label: 'Relationship', required: true },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'date' }, { key: 'sharePercent', label: 'Share %', type: 'number', required: true, hint: 'Shares for each purpose add up to 100' },
      { key: 'guardianName', label: 'Guardian (for a minor)' }, { key: 'address', label: 'Address', wide: true }],
    summary: (x) => `${optLabel(PURPOSES, x.purpose)}: ${x.name} (${x.relationship}) · ${x.sharePercent}%${x.dateOfBirth ? ` · born ${fmtDate(x.dateOfBirth)}` : ''}${x.guardianName ? ` · guardian ${x.guardianName}` : ''}` },
  { key: 'education', title: 'Education', max: 15, empty: 'No qualification recorded.', blank: { level: 'graduate', qualification: '', institution: '', university: '', yearOfPassing: '', score: '' },
    fields: [{ key: 'level', label: 'Level', type: 'select', options: LEVELS, required: true }, { key: 'qualification', label: 'Qualification', required: true, hint: 'e.g. M.Sc. Analytical Chemistry' },
      { key: 'institution', label: 'Institution', required: true }, { key: 'university', label: 'Board / university' }, { key: 'yearOfPassing', label: 'Year of passing', type: 'number' }, { key: 'score', label: 'Score', hint: '% / CGPA / class' }],
    summary: (x) => `${x.qualification} — ${x.institution}${x.university ? `, ${x.university}` : ''}${x.yearOfPassing ? ` (${x.yearOfPassing})` : ''}${x.score ? ` · ${x.score}` : ''}` },
  { key: 'experience', title: 'Previous employment', max: 20, empty: 'No previous employment recorded.', blank: { employer: '', designation: '', fromDate: '', toDate: '', reasonForLeaving: '' },
    fields: [{ key: 'employer', label: 'Employer', required: true }, { key: 'designation', label: 'Designation', required: true }, { key: 'fromDate', label: 'From', type: 'date', required: true },
      { key: 'toDate', label: 'To', type: 'date', required: true }, { key: 'reasonForLeaving', label: 'Reason for leaving', wide: true }],
    summary: (x) => `${x.designation}, ${x.employer} · ${fmtDate(x.fromDate)} – ${fmtDate(x.toDate)}${x.reasonForLeaving ? ` · ${x.reasonForLeaving}` : ''}` },
];
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<Section, typeof SECTIONS[number]>;

/** Form values → API items: blanks become null, numbers become numbers. */
function toItems(section: Section, rows: Item[]) {
  return rows.map((r) => Object.fromEntries(SECTION[section].fields.map((f) => {
    const v = r[f.key];
    if (v === '' || v === undefined || v === null) return [f.key, f.type === 'select' ? r[f.key] : null];
    return [f.key, f.type === 'number' ? Number(v) : typeof v === 'string' ? v.trim() : v];
  })));
}

function Editor({ employeeId, section, mode, initial, onClose, onSaved }: { employeeId: string; section: Section; mode: 'direct' | 'approval'; initial: Item[]; onClose: () => void; onSaved: () => void }) {
  const def = SECTION[section];
  const toast = useToast();
  const [rows, setRows] = useState<Item[]>(initial.length ? initial.map((x) => ({ ...def.blank, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? ''])) })) : [{ ...def.blank }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => { const n = [...rs]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; return n; });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.put(`/api/v1/employees/${employeeId}/profile/${section}`, { items: toItems(section, rows), note: note || undefined });
      toast(r.applied ? `${def.title} saved` : `${def.title} sent to HR for approval`);
      onSaved(); onClose();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Edit ${def.title.toLowerCase()}`} onClose={onClose}>
      <div className="stack">
        {mode === 'approval' && <div className="alert warn">HR checks changes to {def.title.toLowerCase()}. They apply once approved.</div>}
        {rows.map((r, i) => (
          <fieldset key={i} className="card stack" style={{ padding: 12 }} aria-label={`${def.title} entry ${i + 1}`}>
            <div className="row"><strong>{section === 'contacts' ? `Contact ${i + 1}${i === 0 ? ' (call first)' : ''}` : `Entry ${i + 1}`}</strong><span className="spacer" />
              {section === 'contacts' && i > 0 && <button type="button" className="btn sm" onClick={() => move(i, -1)} aria-label="Move up">↑</button>}
              <button type="button" className="btn sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button></div>
            <div className="grid grid-3">
              {def.fields.map((f) => (
                <label key={f.key} className="field" style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
                  <span>{f.label}{f.required ? ' *' : ''}</span>
                  {f.type === 'select'
                    ? <select aria-label={f.label} value={r[f.key]} onChange={(e) => set(i, f.key, e.target.value)}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    : <input aria-label={f.label} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} step={f.key === 'sharePercent' ? '0.01' : undefined} value={r[f.key] ?? ''} onChange={(e) => set(i, f.key, e.target.value)} />}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {rows.length < def.max && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((rs) => [...rs, { ...def.blank, ...(section === 'addresses' ? { kind: rs.some((x) => x.kind === 'current') ? 'permanent' : 'current' } : {}) }])}>Add {section === 'addresses' ? 'address' : 'entry'}</button>}
        {mode === 'approval' && <label className="field"><span>Note for HR (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>}
        <ErrorBox error={err} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>{mode === 'approval' ? 'Send for approval' : 'Save'}</button></div>
      </div>
    </Modal>
  );
}

/** The personal sections of an employee's record, with editing as the viewer is allowed. */
export function PersonalDetails({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/employees/${employeeId}/profile`), [employeeId]);
  const [editing, setEditing] = useState<Section | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const pendingOf = (s: Section) => data.pending.find((p: any) => p.section === s);
  return (
    <div className="stack">
      {data.missing.length > 0 && <div className="alert warn">Still to fill in: {data.missing.join(', ')}.</div>}
      {SECTIONS.map((s) => {
        const items: Item[] = data.sections[s.key];
        const mode = data.edit[s.key] as 'direct' | 'approval' | null;
        const pending = pendingOf(s.key);
        return (
          <div key={s.key} className="card stack" aria-label={s.title}>
            <div className="row"><h2 style={{ margin: 0 }}>{s.title}</h2><span className="spacer" />
              {mode && !pending && <button className="btn sm" onClick={() => setEditing(s.key)}>{items.length ? 'Edit' : 'Add'}</button>}</div>
            {items.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{s.summary(x)}</li>)}</ul> : <span className="muted">{s.empty}</span>}
            {pending && (
              <div className="alert warn" role="status">
                <div className="row"><strong>Change awaiting HR approval</strong><span className="muted">sent {fmtDateTime(pending.created_at)} by {pending.requested_by_name}</span><span className="spacer" />
                  {mode === 'approval' && <button className="btn sm" onClick={() => setWithdraw(pending.id)}>Withdraw</button>}</div>
                {pending.items.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{pending.items.map((x: Item, i: number) => <li key={i}>{s.summary(x)}</li>)}</ul> : <div>Remove all entries.</div>}
                {pending.note && <div className="muted">“{pending.note}”</div>}
              </div>
            )}
          </div>
        );
      })}
      {editing && <Editor employeeId={employeeId} section={editing} mode={data.edit[editing]} initial={data.sections[editing]} onClose={() => setEditing(null)} onSaved={reload} />}
      {withdraw && <Confirm title="Withdraw change" message="Withdraw this change? Your details stay as they are." confirmLabel="Withdraw" onClose={() => setWithdraw(null)}
        onConfirm={async () => { await api.post(`/api/v1/employees/profile-changes/${withdraw}/withdraw`); toast('Change withdrawn'); reload(); }} />}
    </div>
  );
}

/** My profile: the signed-in employee's own personal details. */
export function MyProfile() {
  const { me } = useAuth();
  const id = me!.user.employeeId;
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div><h1>My profile</h1><p className="sub">Keep your emergency contacts and addresses up to date. HR checks changes to nominees, education and previous employment.
        {id && <> See also <Link to={`/employees/${id}`}>your employee record</Link>.</>}</p></div>
      {id ? <PersonalDetails employeeId={id} /> : <Empty>Your account is not linked to an employee record.</Empty>}
    </div>
  );
}

/** For an approver: the proposed section next to what is recorded now. */
export function ProfileChangeView({ changeId }: { changeId: string }) {
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/employees/profile-changes/${changeId}`), [changeId]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const s = SECTION[data.section as Section];
  const list = (items: Item[]) => (items.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{s.summary(x)}</li>)}</ul> : <span className="muted">None</span>);
  return (
    <div className="grid grid-2">
      <div className="card stack" style={{ padding: 12 }}><strong>Proposed {s.title.toLowerCase()}</strong>{list(data.items)}{data.note && <div className="muted">“{data.note}”</div>}</div>
      <div className="card stack" style={{ padding: 12 }}><strong>Recorded now</strong>{list(data.current)}</div>
    </div>
  );
}
