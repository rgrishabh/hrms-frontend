import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, money, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';

type Tab = 'mine' | 'team' | 'all';
const MODE: Record<string, string> = { air: 'Air', rail: 'Rail', bus: 'Bus', road: 'Road (taxi / company vehicle)', own_vehicle: 'Own vehicle', other: 'Other' };
const EST: [string, string][] = [['travel', 'Tickets / fuel'], ['stay', 'Stay'], ['local', 'Local conveyance'], ['meals', 'Meals'], ['other', 'Other']];

const when = (t: any) => (t.start_date === t.end_date ? fmtDate(t.start_date) : `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}`);
const route = (t: any) => `${t.origin} → ${t.destination}`;
function advanceCell(t: any) {
  if (Number(t.advance_requested) <= 0) return <span className="muted">—</span>;
  return <>{money(t.advance_requested)}<div className="muted" style={{ fontSize: 12 }}>{t.advance_paid_at ? `Paid · ${t.advance_reference}` : ['approved', 'completed'].includes(t.status) ? 'Not paid yet' : ''}</div></>;
}

export function Travel() {
  const { canAny, can, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('travel.self')) tabs.push({ key: 'mine', label: 'My trips' });
  if (can('travel.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('travel.read', 'travel.approve', 'expenses.pay')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to travel.</Empty>;
  return (
    <div className="stack">
      <div><h1>Travel</h1><p className="sub">Trips with an estimate and an optional advance, approved by your manager (and finance for advances and trips abroad). Claim the expenses from the trip; the advance is set off against the claim.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' ? <Mine /> : <Everyone scope={tab} />}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/travel/requests?scope=mine&pageSize=50'), []);
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [act, setAct] = useState<{ kind: 'withdraw' | 'cancel' | 'complete'; trip: any } | null>(null);
  const today = data?.today ?? todayLocal();
  const claim = async (t: any) => {
    try { const r = await api.post(`/api/v1/travel/requests/${t.id}/claim`); nav(`/expenses?tab=mine&claim=${r.id}`); } catch (x) { toast(errText(x), 'error'); }
  };
  return (
    <section className="card stack" aria-labelledby="tr-mine">
      <div className="row"><h2 id="tr-mine" style={{ margin: 0 }}>My trips</h2><span className="spacer" />
        <button className="btn primary" onClick={() => setForm(true)}>Request travel</button></div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No trips yet.</Empty> : (
        <div className="table-wrap"><table className="t" aria-label="My trips"><thead><tr><th>When</th><th>Route</th><th>Purpose</th><th>Estimate</th><th>Advance</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((t: any) => <tr key={t.id}>
            <td>{when(t)}</td><td>{route(t)}<div className="muted" style={{ fontSize: 12 }}>{MODE[t.travel_mode]}{t.trip_type === 'international' ? ' · international' : ''}</div></td>
            <td style={{ maxWidth: 240 }}>{t.purpose}</td><td>{money(t.estimate_total)}</td><td>{advanceCell(t)}</td><td><StatusBadge status={t.status} /></td>
            <td className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => setDetail(t.id)}>Details</button>
              {t.status === 'pending' && <button className="btn sm" onClick={() => setAct({ kind: 'withdraw', trip: t })}>Withdraw</button>}
              {t.status === 'approved' && t.start_date > today && <button className="btn sm" onClick={() => setAct({ kind: 'cancel', trip: t })}>Cancel</button>}
              {t.status === 'approved' && t.start_date <= today && <button className="btn sm" onClick={() => setAct({ kind: 'complete', trip: t })}>Back from trip</button>}
              {['approved', 'completed'].includes(t.status) && <button className="btn sm primary" onClick={() => claim(t)}>Claim expenses</button>}
            </td></tr>)}
        </tbody></table></div>)}
      {form && <RequestForm onClose={() => setForm(false)} onSaved={() => { toast('Travel requested; sent for approval'); reload(); }} />}
      {detail && <TripDetail id={detail} onClose={() => setDetail(null)} />}
      {act?.kind === 'withdraw' && <Confirm title="Withdraw travel request" message={`Withdraw your trip ${route(act.trip)} (${when(act.trip)})?`} confirmLabel="Withdraw" onClose={() => setAct(null)}
        onConfirm={async () => { await api.post(`/api/v1/travel/requests/${act.trip.id}/withdraw`); toast('Request withdrawn'); reload(); }} />}
      {act?.kind === 'cancel' && <Confirm title="Cancel trip" danger requireComment confirmLabel="Cancel trip" onClose={() => setAct(null)}
        message={<>Cancel your approved trip {route(act.trip)} ({when(act.trip)})?{act.trip.advance_paid_at ? ' The advance paid to you must be returned to finance.' : ''}</>}
        onConfirm={async (reason) => { await api.post(`/api/v1/travel/requests/${act.trip.id}/cancel`, { reason }); toast('Trip cancelled'); reload(); }} />}
      {act?.kind === 'complete' && <Confirm title="Back from the trip" confirmLabel="Mark completed" onClose={() => setAct(null)}
        message={`Mark ${route(act.trip)} completed? Then claim its expenses; any advance left over is returned to finance.`}
        onConfirm={async () => { await api.post(`/api/v1/travel/requests/${act.trip.id}/complete`); toast('Trip completed'); reload(); }} />}
    </section>
  );
}

/** Fills the meals estimate from the organization's per-diem rate for the trip's days (when rates are set). */
function PerDiemHelper({ from, to, onUse }: { from: string; to: string; onUse: (amount: string) => void }) {
  const rates = useLoad(() => api.get('/api/v1/expenses/allowance-rates').catch(() => null), []);
  const tiers: string[] = rates.data?.tiers ?? [];
  const [tier, setTier] = useState('');
  const t = tier || tiers[0] || '';
  const quote = useLoad(() => (t && from && to >= from ? api.get(`/api/v1/expenses/allowance-quote${qs({ kind: 'per_diem', tier: t, date: from, to })}`) : Promise.resolve(null)), [t, from, to]);
  if (!tiers.length) return null;
  return (
    <div className="row" style={{ flexWrap: 'wrap', alignItems: 'end' }} aria-label="Per diem">
      <Field label="Per-diem class"><select value={t} onChange={(e) => setTier(e.target.value)}>{tiers.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
      {quote.data?.rate ? <>
        <span className="muted">{quote.data.quantity} day(s) × {money(quote.data.rate)} = <strong>{money(quote.data.amount)}</strong></span>
        <button type="button" className="btn sm" onClick={() => onUse(quote.data.amount)}>Use for meals</button></>
        : quote.data && <span className="muted">No per-diem rate for {t} on these dates</span>}
    </div>
  );
}

function RequestForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = todayLocal();
  const [f, setF] = useState({ purpose: '', tripType: 'domestic', origin: '', destination: '', startDate: today, endDate: today, travelMode: 'rail', accommodation: false, project: '', markOnDuty: true });
  const [est, setEst] = useState<Record<string, string>>({ travel: '', stay: '', local: '', meals: '', other: '' });
  const [advance, setAdvance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => { const n = { ...x, ...p }; if (p.startDate && n.endDate < p.startDate) n.endDate = p.startDate; return n; });
  const total = Object.values(est).reduce((s, v) => s + (Number(v) || 0), 0);
  return (
    <Modal title="Request travel" onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try {
          await api.post('/api/v1/travel/requests', { ...f, project: f.project || undefined, estimate: Object.fromEntries(Object.entries(est).map(([k, v]) => [k, v || 0])), advance: advance || 0 });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="Purpose"><textarea required minLength={3} maxLength={1000} value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="Client, work order, what the trip is for" /></Field>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="From (city)"><input required minLength={2} maxLength={120} value={f.origin} onChange={(e) => set({ origin: e.target.value })} /></Field>
          <Field label="Destination"><input required minLength={2} maxLength={200} value={f.destination} onChange={(e) => set({ destination: e.target.value })} /></Field>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="Start"><input type="date" required min={today} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          <Field label="Return"><input type="date" required min={f.startDate} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
          <Field label="Mode"><select value={f.travelMode} onChange={(e) => set({ travelMode: e.target.value })}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Trip"><select value={f.tripType} onChange={(e) => set({ tripType: e.target.value })}><option value="domestic">Within India</option><option value="international">International</option></select></Field>
        </div>
        <Field label="Client / work order (optional)"><input maxLength={100} value={f.project} onChange={(e) => set({ project: e.target.value })} /></Field>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6 }}><legend>Estimated cost (₹)</legend>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {EST.map(([k, label]) => <Field key={k} label={label}><input type="number" min={0} step="0.01" value={est[k]} onChange={(e) => setEst({ ...est, [k]: e.target.value })} style={{ width: 120 }} /></Field>)}
          </div>
          <PerDiemHelper from={f.startDate} to={f.endDate} onUse={(amount) => setEst({ ...est, meals: amount })} />
          <div className="muted">Total {money(total)}</div>
        </fieldset>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <Field label="Advance needed (₹)" hint="Paid by finance before the trip; set off against your claim afterwards"><input type="number" min={0} step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} style={{ width: 160 }} /></Field>
          <label className="row"><input type="checkbox" checked={f.accommodation} onChange={(e) => set({ accommodation: e.target.checked })} /> Needs accommodation</label>
          <label className="row"><input type="checkbox" checked={f.markOnDuty} onChange={(e) => set({ markOnDuty: e.target.checked })} /> Count the trip days as field duty</label>
        </div>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Submit for approval'}</button></div>
      </form>
    </Modal>
  );
}

function TripDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t, loading, error } = useLoad(() => api.get(`/api/v1/travel/requests/${id}`), [id]);
  const s = t?.settlement;
  return (
    <Modal title={t ? `Trip — ${route(t)}` : 'Trip'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={t.status} /><span className="muted">{t.name} · {when(t)} · {MODE[t.travel_mode]}</span></div>
          <div>{t.purpose}{t.project ? <span className="muted"> · {t.project}</span> : null}</div>
          {t.on_duty_note && <div className="alert info" style={{ margin: 0 }}>{t.on_duty_note}</div>}
          {t.field_duty_id && <div className="muted">Counted as field duty in attendance.</div>}
          <div className="table-wrap"><table className="t" aria-label="Estimate"><tbody>
            {EST.map(([k, label]) => Number(t[`estimate_${k}`]) > 0 && <tr key={k}><td>{label}</td><td>{money(t[`estimate_${k}`])}</td></tr>)}
            <tr><th>Estimate</th><th>{money(t.estimate_total)}</th></tr>
          </tbody></table></div>
          <h3 style={{ margin: 0 }}>Settlement</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', display: 'grid', gap: 8 }}>
            <div className="stat"><div className="l">Advance paid</div><div>{money(s.advancePaid)}</div></div>
            <div className="stat"><div className="l">Claimed</div><div>{money(s.claimed)}</div></div>
            <div className="stat"><div className="l">Set off from advance</div><div>{money(s.advanceAdjusted)}</div></div>
            <div className="stat"><div className="l">Reimbursed / to reimburse</div><div>{money(s.reimbursable)}</div></div>
            <div className="stat"><div className="l">Returned</div><div>{money(s.recovered)}</div></div>
            <div className="stat"><div className="l">Advance outstanding</div><div><strong>{money(s.outstanding)}</strong></div></div>
          </div>
          {s.claims.length > 0 && <div className="table-wrap"><table className="t" aria-label="Trip claims"><thead><tr><th>Claim</th><th>Total</th><th>Status</th></tr></thead><tbody>
            {s.claims.map((c: any) => <tr key={c.id}><td>{c.title}</td><td>{money(c.total)}</td><td><StatusBadge status={c.status} /></td></tr>)}</tbody></table></div>}
        </div>)}
    </Modal>
  );
}

function Everyone({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me } = useAuth();
  const [f, setF] = useState({ status: '', advance: '', on: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const [act, setAct] = useState<{ kind: 'pay' | 'returned' | 'close' | 'cancel'; trip: any } | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/travel/requests${qs({ scope, status: f.status || undefined, advance: f.advance || undefined, on: f.on || undefined, page, pageSize: 25 })}`), [scope, f, page]);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const pay = scope === 'all' && can('expenses.pay');
  const approve = scope === 'all' && can('travel.approve');
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>
          {['pending', 'approved', 'completed', 'closed', 'returned', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</select></Field>
        {scope === 'all' && <Field label="Advance"><select value={f.advance} onChange={(e) => set({ advance: e.target.value })}><option value="">Any</option>
          <option value="to_pay">To pay</option><option value="outstanding">Paid, not yet settled</option></select></Field>}
        <Field label="Travelling on"><input type="date" value={f.on} onChange={(e) => set({ on: e.target.value })} /></Field>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No trips match.</Empty> : (<>
        <div className="table-wrap"><table className="t" aria-label="Trips"><thead><tr><th>Employee</th><th>When</th><th>Route</th><th>Estimate</th><th>Advance</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((t: any) => {
            const own = t.employee_id === me!.user.employeeId;
            return <tr key={t.id}>
              <td>{t.name}<div className="muted mono" style={{ fontSize: 12 }}>{t.employee_code}{t.department ? ` · ${t.department}` : ''}</div></td>
              <td>{when(t)}</td><td>{route(t)}<div className="muted" style={{ fontSize: 12 }}>{t.purpose}</div></td><td>{money(t.estimate_total)}</td><td>{advanceCell(t)}</td><td><StatusBadge status={t.status} /></td>
              <td className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => setDetail(t.id)}>Details</button>
                {pay && !own && ['approved', 'completed'].includes(t.status) && Number(t.advance_requested) > 0 && !t.advance_paid_at && <button className="btn sm primary" onClick={() => setAct({ kind: 'pay', trip: t })}>Pay advance</button>}
                {pay && !own && t.advance_paid_at && t.status !== 'closed' && <button className="btn sm" onClick={() => setAct({ kind: 'returned', trip: t })}>Advance returned</button>}
                {pay && t.status === 'completed' && <button className="btn sm" onClick={() => setAct({ kind: 'close', trip: t })}>Close</button>}
                {approve && !own && t.status === 'approved' && <button className="btn sm danger" onClick={() => setAct({ kind: 'cancel', trip: t })}>Cancel</button>}
              </td></tr>;
          })}
        </tbody></table></div>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>)}
      {detail && <TripDetail id={detail} onClose={() => setDetail(null)} />}
      {act?.kind === 'pay' && <PayAdvance trip={act.trip} onClose={() => setAct(null)} onDone={() => { toast('Advance recorded as paid'); reload(); }} />}
      {act?.kind === 'returned' && <AdvanceReturned trip={act.trip} onClose={() => setAct(null)} onDone={(left) => { toast(`Recorded. Outstanding ${money(left)}`); reload(); }} />}
      {act?.kind === 'close' && <Confirm title="Close trip" confirmLabel="Close trip" onClose={() => setAct(null)}
        message={`Close ${act.trip.name}'s trip ${route(act.trip)}? Only possible when no advance is outstanding and no claim is still in progress.`}
        onConfirm={async () => { await api.post(`/api/v1/travel/requests/${act.trip.id}/close`); toast('Trip closed'); reload(); }} />}
      {act?.kind === 'cancel' && <Confirm title="Cancel approved trip" danger requireComment confirmLabel="Cancel trip" onClose={() => setAct(null)}
        message={<>Cancel {act.trip.name}'s trip {route(act.trip)} ({when(act.trip)})? Its field duty is cancelled{act.trip.advance_paid_at ? '; the paid advance stays outstanding until returned' : ''}.</>}
        onConfirm={async (reason) => { await api.post(`/api/v1/travel/requests/${act.trip.id}/cancel`, { reason }); toast('Trip cancelled'); reload(); }} />}
    </div>
  );
}

function PayAdvance({ trip, onClose, onDone }: { trip: any; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Pay travel advance" onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try { await api.post(`/api/v1/travel/requests/${trip.id}/advance-paid`, { reference }); onDone(); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <div>{money(trip.advance_requested)} to {trip.name} for {route(trip)} ({when(trip)}).</div>
        <Field label="Payment reference" hint="NEFT / UTR number, or the cash voucher"><input required minLength={3} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Record as paid'}</button></div>
      </form>
    </Modal>
  );
}

function AdvanceReturned({ trip, onClose, onDone }: { trip: any; onClose: () => void; onDone: (left: string) => void }) {
  const detail = useLoad(() => api.get(`/api/v1/travel/requests/${trip.id}`), [trip.id]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const out = detail.data?.settlement.outstanding;
  return (
    <Modal title="Advance returned" onClose={onClose}>
      {detail.loading ? <Loading /> : (
        <form className="stack" onSubmit={async (ev) => {
          ev.preventDefault(); setError(null); setBusy(true);
          try { const r = await api.post(`/api/v1/travel/requests/${trip.id}/advance-returned`, { amount, note }); onDone(r.outstanding); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
        }}>
          <div>{trip.name} still has {money(out ?? 0)} of the advance for {route(trip)}.</div>
          <Field label="Amount returned (₹)"><input type="number" required min={0.01} max={out} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="How it was returned"><input required minLength={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash to accounts, NEFT reference…" /></Field>
          <ErrorBox error={error} />
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || Number(out) <= 0}>{busy ? 'Saving…' : 'Record'}</button></div>
        </form>)}
    </Modal>
  );
}
