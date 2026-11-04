import { useState } from 'react';
import { api } from '../../api';
import { fmtDate, money, todayLocal } from '../../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, StatusBadge, Confirm, useToast, errText } from '../../ui';

export const VEHICLE: Record<string, string> = { car: 'Car', two_wheeler: 'Two-wheeler' };
const STATE: Record<string, string> = { current: 'active', scheduled: 'scheduled', superseded: 'superseded' };

/** Expenses → Allowance rates: the organization's per-diem and mileage policy, effective-dated. */
export function AllowanceRates() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/expenses/allowance-rates'), []);
  const [form, setForm] = useState<'per_diem' | 'mileage' | null>(null);
  const [withdraw, setWithdraw] = useState<any>(null);
  const [showOld, setShowOld] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data.items.filter((r: any) => showOld || r.state !== 'superseded');
  const table = (kind: string) => rows.filter((r: any) => r.kind === kind);
  return (
    <div className="stack">
      <p className="hint">Your organization's allowance policy. HRMS ships no rates, and their tax treatment is for your advisers. A rate applies from its date until a newer one for the same class takes over; claims keep the rate they were priced at.</p>
      {[['per_diem', 'Per diem (per day)'], ['mileage', 'Mileage (per km)']].map(([kind, title]) => (
        <section key={kind} className="card stack" aria-label={title}>
          <div className="row"><h2 style={{ margin: 0 }}>{title}</h2><span className="spacer" />
            {data.canManage && <button className="btn primary sm" onClick={() => setForm(kind as 'per_diem' | 'mileage')}>Add rate</button>}</div>
          {!table(kind!).length ? <Empty>No {kind === 'per_diem' ? 'per-diem' : 'mileage'} rates yet.</Empty> : (
            <div className="table-wrap"><table className="t"><thead><tr>{kind === 'per_diem' ? <><th>Destination class</th><th>Grade</th></> : <th>Vehicle</th>}
              <th>Rate</th><th>From</th><th>Status</th><th>Note</th><th /></tr></thead><tbody>
              {table(kind!).map((r: any) => (
                <tr key={r.id}>{kind === 'per_diem' ? <><td className="mono">{r.tier}</td><td>{r.grade ?? 'All grades'}</td></> : <td>{VEHICLE[r.vehicle]}</td>}
                  <td>{money(r.rate)}</td><td>{fmtDate(r.effective_from)}</td><td><StatusBadge status={STATE[r.state]!} /></td><td>{r.note ?? '—'}<div className="muted">{r.created_by_name}</div></td>
                  <td>{data.canManage && r.state === 'scheduled' && <button className="btn sm" onClick={() => setWithdraw(r)}>Withdraw</button>}</td></tr>))}
            </tbody></table></div>)}
        </section>))}
      <label className="row"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show superseded rates</label>
      {form && <RateForm kind={form} tiers={data.tiers} onClose={() => setForm(null)} onSaved={() => { toast('Rate added'); reload(); }} />}
      {withdraw && <Confirm title="Withdraw rate" message={`Withdraw the rate of ${money(withdraw.rate)} from ${fmtDate(withdraw.effective_from)}? It has not started yet.`} confirmLabel="Withdraw rate" danger
        onClose={() => setWithdraw(null)} onConfirm={async () => { await api.del(`/api/v1/expenses/allowance-rates/${withdraw.id}`); toast('Rate withdrawn'); reload(); }} />}
    </div>
  );
}

function RateForm({ kind, tiers, onClose, onSaved }: { kind: 'per_diem' | 'mileage'; tiers: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tier: tiers[0] ?? '', grade: '', vehicle: 'car', rate: '', effectiveFrom: todayLocal(), note: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={kind === 'per_diem' ? 'Add per-diem rate' : 'Add mileage rate'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api.post('/api/v1/expenses/allowance-rates', { kind, rate: Number(f.rate), effectiveFrom: f.effectiveFrom, note: f.note.trim() || undefined,
            ...(kind === 'per_diem' ? { tier: f.tier, grade: f.grade.trim() || null } : { vehicle: f.vehicle }) });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); }
      }}>
        <div className="grid-2">
          {kind === 'per_diem' ? <>
            <Field label="Destination class" hint="A short code, e.g. METRO, OTHER, INTL"><input required list="tiers" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value.toUpperCase() })} maxLength={20} />
              <datalist id="tiers">{tiers.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Grade (optional)" hint="Blank = every grade; a grade's own rate wins"><input value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} maxLength={20} placeholder="e.g. L5" /></Field>
          </> : <Field label="Vehicle"><select value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>{Object.entries(VEHICLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
          <Field label={kind === 'per_diem' ? 'Rate per day (₹)' : 'Rate per km (₹)'}><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
          <Field label="Applies from" hint="Up to 90 days back"><input type="date" required value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
        </div>
        <Field label="Note (optional)"><input maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Travel policy v3, approved by the board" /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Add rate</button></div>
      </form>
    </Modal>
  );
}
