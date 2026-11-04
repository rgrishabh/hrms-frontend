import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { fmtDate, money, todayLocal } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, Tabs, Pager, StatusBadge, Confirm, useToast, errText } from '../ui';
import { EmployeePicker } from '../features/employees/EmployeePicker';

type Tab = 'mine' | 'team' | 'all';
const KIND: Record<string, string> = { salary_advance: 'Salary advance', loan: 'Loan' };
const monthLabel = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const terms = (l: any) => `${l.installments} × ${money(l.installment_amount)} from ${monthLabel(l.first_period)}`;

export function Loans() {
  const { canAny, can, me } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (me!.user.employeeId && can('loans.self')) tabs.push({ key: 'mine', label: 'Mine' });
  if (can('loans.team.read')) tabs.push({ key: 'team', label: 'My team' });
  if (canAny('loans.read', 'loans.approve', 'loans.manage')) tabs.push({ key: 'all', label: 'Everyone' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mine');
  if (!tabs.length) return <Empty>You do not have access to advances and loans.</Empty>;
  return (
    <div className="stack">
      <div><h1>Advances &amp; loans</h1><p className="sub">Salary advances and interest-free loans, approved by your manager and finance, recovered in monthly instalments through payroll.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'mine' ? <Mine /> : <Everyone scope={tab} />}
    </div>
  );
}

function Mine() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/loans/requests?scope=mine&pageSize=50'), []);
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<any | null>(null);
  return (
    <section className="card stack" aria-labelledby="ln-mine">
      <div className="row"><h2 id="ln-mine" style={{ margin: 0 }}>My advances and loans</h2><span className="spacer" />
        <button className="btn primary" onClick={() => setForm(true)}>Apply</button></div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No advances or loans.</Empty> : <LoanTable items={data.items} label="My advances and loans"
        actions={(l) => <>
          <button className="btn sm" onClick={() => setDetail(l.id)}>Details</button>
          {l.status === 'pending' && <button className="btn sm" onClick={() => setWithdraw(l)}>Withdraw</button>}
        </>} />}
      {form && <ApplyForm onClose={() => setForm(false)} onSaved={() => { toast('Application sent for approval'); reload(); }} />}
      {detail && <LoanDetail id={detail} onClose={() => setDetail(null)} />}
      {withdraw && <Confirm title="Withdraw application" message={`Withdraw your ${KIND[withdraw.kind]!.toLowerCase()} application for ${money(withdraw.amount)}?`} confirmLabel="Withdraw" onClose={() => setWithdraw(null)}
        onConfirm={async () => { await api.post(`/api/v1/loans/requests/${withdraw.id}/withdraw`); toast('Application withdrawn'); reload(); }} />}
    </section>
  );
}

function LoanTable({ items, label, showEmployee, actions }: { items: any[]; label: string; showEmployee?: boolean; actions: (l: any) => React.ReactNode }) {
  return (
    <div className="table-wrap"><table className="t" aria-label={label}><thead><tr>{showEmployee && <th>Employee</th>}<th>Kind</th><th>Amount</th><th>Recovery</th><th>Outstanding</th><th>Status</th><th /></tr></thead><tbody>
      {items.map((l) => <tr key={l.id}>
        {showEmployee && <td>{l.name}<div className="muted mono" style={{ fontSize: 12 }}>{l.employee_code}{l.department ? ` · ${l.department}` : ''}</div></td>}
        <td>{KIND[l.kind]}<div className="muted" style={{ fontSize: 12, maxWidth: 220 }}>{l.purpose}</div></td>
        <td>{money(l.amount)}</td><td>{terms(l)}{l.skip_periods.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Deferred: {l.skip_periods.map(monthLabel).join(', ')}</div>}</td>
        <td>{['disbursed', 'closed'].includes(l.status) ? money(l.outstanding) : <span className="muted">—</span>}</td>
        <td><StatusBadge status={l.status} />{l.recorded_by_other && <div className="muted" style={{ fontSize: 12 }}>Recorded by payroll</div>}</td>
        <td className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{actions(l)}</td></tr>)}
    </tbody></table></div>
  );
}

function ApplyForm({ forOthers, onClose, onSaved }: { forOthers?: boolean; onClose: () => void; onSaved: () => void }) {
  const month = todayLocal().slice(0, 7);
  const [f, setF] = useState({ employeeId: '', kind: 'salary_advance', amount: '', installments: '1', firstPeriod: month, purpose: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0; const n = Number(f.installments) || 1;
  const inst = amount > 0 ? Math.ceil(amount / n) : 0;
  return (
    <Modal title={forOthers ? 'Record an advance or loan for an employee' : 'Apply for an advance or loan'} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try {
          await api.post('/api/v1/loans/requests', { kind: f.kind, amount, installments: n, firstPeriod: f.firstPeriod, purpose: f.purpose, employeeId: forOthers ? f.employeeId : undefined });
          onSaved(); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        {forOthers && <Field label="Employee"><EmployeePicker value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /></Field>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="salary_advance">Salary advance</option><option value="loan">Loan (interest-free)</option></select></Field>
          <Field label="Amount (₹)"><input type="number" required min={1} step={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 140 }} /></Field>
          <Field label="Instalments"><input type="number" required min={1} max={120} step={1} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} style={{ width: 100 }} /></Field>
          <Field label="Recover from"><input type="month" required min={month} value={f.firstPeriod} onChange={(e) => setF({ ...f, firstPeriod: e.target.value })} /></Field>
        </div>
        {inst > 0 && <div className="muted">{n} monthly instalment{n === 1 ? '' : 's'} of {money(inst)}{inst * n !== amount ? ` (the last ${money(amount - inst * (n - 1))})` : ''}, deducted from salary.</div>}
        <Field label="Purpose"><textarea required minLength={3} maxLength={1000} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (forOthers && !f.employeeId)}>{busy ? 'Sending…' : 'Submit for approval'}</button></div>
      </form>
    </Modal>
  );
}

function LoanDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: l, loading, error } = useLoad(() => api.get(`/api/v1/loans/requests/${id}`), [id]);
  return (
    <Modal title={l ? `${KIND[l.kind]} — ${money(l.amount)}` : 'Advance / loan'} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="row"><StatusBadge status={l.status} /><span className="muted">{l.name} · {terms(l)}</span></div>
          <div>{l.purpose}</div>
          {l.disbursement_reference && <div className="muted">Paid {fmtDate(l.disbursed_at.slice(0, 10))} · {l.disbursement_reference}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div className="stat"><div className="l">Outstanding</div><div><strong>{money(l.balance.outstanding)}</strong></div></div>
            <div className="stat"><div className="l">In payroll being processed</div><div>{money(l.balance.inProgress)}</div></div>
            <div className="stat"><div className="l">Recovered</div><div>{money(l.balance.recovered)}</div></div>
          </div>
          <h3 style={{ margin: 0 }}>Schedule</h3>
          <div className="table-wrap"><table className="t" aria-label="Schedule"><thead><tr><th>Month</th><th>Instalment</th></tr></thead><tbody>
            {l.schedule.map((s: any) => <tr key={s.period}><td>{monthLabel(s.period)}</td><td>{money(s.amount)}</td></tr>)}</tbody></table></div>
          {l.recoveries.length > 0 && <><h3 style={{ margin: 0 }}>Recovered</h3>
            <div className="table-wrap"><table className="t" aria-label="Recoveries"><thead><tr><th>When</th><th>How</th><th>Amount</th></tr></thead><tbody>
              {l.recoveries.map((r: any) => <tr key={r.id}><td>{r.period ? monthLabel(r.period) : fmtDate(r.created_at.slice(0, 10))}</td>
                <td>{r.source === 'payroll' ? `Payroll${r.run_kind === 'fnf' ? ' (full and final)' : ''} · ${r.run_status}` : `Repaid · ${r.reference}`}</td><td>{money(r.amount)}</td></tr>)}</tbody></table></div></>}
        </div>)}
    </Modal>
  );
}

function Everyone({ scope }: { scope: 'team' | 'all' }) {
  const toast = useToast();
  const { can, me } = useAuth();
  const [f, setF] = useState({ status: '', kind: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const [record, setRecord] = useState(false);
  const [act, setAct] = useState<{ kind: 'disburse' | 'repay' | 'defer' | 'cancel'; loan: any } | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/v1/loans/requests${qs({ scope, status: f.status || undefined, kind: f.kind || undefined, page, pageSize: 25 })}`), [scope, f, page]);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const manage = scope === 'all' && can('loans.manage');
  const cancelOk = scope === 'all' && (can('loans.manage') || can('loans.approve'));
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>
          {['pending', 'approved', 'disbursed', 'closed', 'returned', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}</select></Field>
        <Field label="Kind"><select value={f.kind} onChange={(e) => set({ kind: e.target.value })}><option value="">Both</option><option value="salary_advance">Salary advances</option><option value="loan">Loans</option></select></Field>
        <span className="spacer" />
        {manage && <button className="btn primary" onClick={() => setRecord(true)}>Record for an employee</button>}
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No advances or loans match.</Empty> : (<>
        <LoanTable items={data.items} label="Advances and loans" showEmployee actions={(l) => {
          const own = l.employee_id === me!.user.employeeId;
          return <>
            <button className="btn sm" onClick={() => setDetail(l.id)}>Details</button>
            {manage && !own && l.status === 'approved' && <button className="btn sm primary" onClick={() => setAct({ kind: 'disburse', loan: l })}>Disburse</button>}
            {manage && !own && l.status === 'disbursed' && <button className="btn sm" onClick={() => setAct({ kind: 'repay', loan: l })}>Repayment</button>}
            {manage && ['approved', 'disbursed'].includes(l.status) && <button className="btn sm" onClick={() => setAct({ kind: 'defer', loan: l })}>Defer a month</button>}
            {cancelOk && l.status === 'approved' && <button className="btn sm danger" onClick={() => setAct({ kind: 'cancel', loan: l })}>Cancel</button>}
          </>;
        }} />
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>)}
      {detail && <LoanDetail id={detail} onClose={() => setDetail(null)} />}
      {record && <ApplyForm forOthers onClose={() => setRecord(false)} onSaved={() => { toast('Recorded; sent to the manager and finance for approval'); reload(); }} />}
      {act?.kind === 'disburse' && <Action title="Disburse" loan={act.loan} onClose={() => setAct(null)} onDone={() => { toast('Recorded as paid; recovery starts in payroll'); reload(); }}
        fields={[{ key: 'reference', label: 'Payment reference', hint: 'NEFT / UTR number or cash voucher' }]} url={`/api/v1/loans/requests/${act.loan.id}/disburse`}
        intro={`Pay ${money(act.loan.amount)} to ${act.loan.name}. Recovery: ${terms(act.loan)}.`} />}
      {act?.kind === 'repay' && <Action title="Record a repayment" loan={act.loan} onClose={() => setAct(null)} onDone={(r) => { toast(r.closed ? 'Repaid in full; closed' : `Recorded. Outstanding ${money(r.outstanding)}`); reload(); }}
        fields={[{ key: 'amount', label: 'Amount (₹)', type: 'number' }, { key: 'reference', label: 'Reference', hint: 'Receipt or transfer reference' }]} url={`/api/v1/loans/requests/${act.loan.id}/repayment`}
        intro={`${act.loan.name} has ${money(act.loan.outstanding)} outstanding.`} />}
      {act?.kind === 'defer' && <Action title="Defer an instalment" loan={act.loan} onClose={() => setAct(null)} onDone={(r) => { toast(r.recomputePayroll ? `Deferred. Recompute the ${r.recomputePayroll} payroll run.` : 'Deferred'); reload(); }}
        fields={[{ key: 'period', label: 'Month', type: 'month' }, { key: 'reason', label: 'Reason' }]} url={`/api/v1/loans/requests/${act.loan.id}/defer`}
        intro={`Skip one month of ${act.loan.name}'s recovery; the schedule moves out by a month.`} />}
      {act?.kind === 'cancel' && <Confirm title="Cancel approved application" danger requireComment confirmLabel="Cancel" onClose={() => setAct(null)}
        message={`Cancel ${act.loan.name}'s ${KIND[act.loan.kind]!.toLowerCase()} of ${money(act.loan.amount)} before it is paid?`}
        onConfirm={async (reason) => { await api.post(`/api/v1/loans/requests/${act.loan.id}/cancel`, { reason }); toast('Cancelled'); reload(); }} />}
    </div>
  );
}

function Action({ title, intro, fields, url, onClose, onDone }: { title: string; loan: any; intro: string; url: string; onClose: () => void; onDone: (r: any) => void;
  fields: { key: string; label: string; hint?: string; type?: string }[] }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try {
          const body = Object.fromEntries(fields.map((x) => [x.key, x.type === 'number' ? Number(v[x.key]) : v[x.key]]));
          onDone(await api.post(url, body)); onClose();
        } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <div>{intro}</div>
        {fields.map((x) => <Field key={x.key} label={x.label} hint={x.hint}>
          <input required type={x.type ?? 'text'} {...(x.type === 'number' ? { min: 1, step: 1 } : { minLength: 3 })} value={v[x.key] ?? ''} onChange={(e) => setV({ ...v, [x.key]: e.target.value })} /></Field>)}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : title}</button></div>
      </form>
    </Modal>
  );
}
