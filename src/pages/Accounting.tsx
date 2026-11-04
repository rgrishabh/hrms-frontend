import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate, fmtDateTime, money } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Tabs, StatusBadge, useToast, errText } from '../ui';

type Tab = 'exports' | 'ledgers';

export function Accounting() {
  const { can } = useAuth();
  const tabs: { key: Tab; label: string }[] = [];
  if (can('accounting.export')) tabs.push({ key: 'exports', label: 'Journals' });
  if (can('accounting.configure') || can('accounting.export')) tabs.push({ key: 'ledgers', label: 'Ledger map' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'ledgers');
  if (!tabs.length) return <Empty>You do not have access to accounting exports.</Empty>;
  return (
    <div className="stack">
      <div><h1>Accounting</h1><p className="sub">Payroll and reimbursement journals for your accounts, mapped to your ledger names. Download as CSV or as Tally XML to import.</p></div>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'exports' ? <Journals /> : <Ledgers />}
    </div>
  );
}

function Journals() {
  const { data, loading, error } = useLoad(() => api.get('/api/v1/accounting/sources'), []);
  const [preview, setPreview] = useState<{ kind: 'payroll-runs' | 'reimbursement-batches'; id: string; title: string } | null>(null);
  const last = (x: any) => (x.last_export ? `${x.last_export.format === 'csv' ? 'CSV' : 'Tally'} · ${fmtDateTime(x.last_export.at)} · ${x.last_export.by}` : <span className="muted">Not exported</span>);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="ac-runs">
        <h2 id="ac-runs" style={{ margin: 0 }}>Payroll runs</h2>
        {!data.runs.length ? <Empty>No finalized payroll runs yet.</Empty> : (
          <div className="table-wrap"><table className="t" aria-label="Payroll runs"><thead><tr><th>Month</th><th>Entity</th><th>Gross</th><th>Status</th><th>Last export</th><th /></tr></thead><tbody>
            {data.runs.map((r: any) => <tr key={r.id}><td>{r.period}{r.kind === 'fnf' ? ' · full and final' : ''}</td><td>{r.legal_entity}</td><td>{money(r.totals?.gross ?? 0)}</td>
              <td><StatusBadge status={r.status} /></td><td>{last(r)}</td>
              <td><button className="btn sm primary" onClick={() => setPreview({ kind: 'payroll-runs', id: r.id, title: `Payroll ${r.period}${r.kind === 'fnf' ? ' (F&F)' : ''}` })}>Journal</button></td></tr>)}
          </tbody></table></div>)}
      </section>
      <section className="card stack" aria-labelledby="ac-batches">
        <h2 id="ac-batches" style={{ margin: 0 }}>Reimbursement batches</h2>
        {!data.batches.length ? <Empty>No approved reimbursement batches.</Empty> : (
          <div className="table-wrap"><table className="t" aria-label="Reimbursement batches"><thead><tr><th>Prepared</th><th>Claims</th><th>Total</th><th>Status</th><th>Last export</th><th /></tr></thead><tbody>
            {data.batches.map((b: any) => <tr key={b.id}><td>{fmtDate(b.created_at.slice(0, 10))}</td><td>{b.claim_count}</td><td>{money(b.total)}</td>
              <td><StatusBadge status={b.status} />{b.payment_reference && <div className="muted mono" style={{ fontSize: 12 }}>{b.payment_reference}</div>}</td><td>{last(b)}</td>
              <td><button className="btn sm primary" onClick={() => setPreview({ kind: 'reimbursement-batches', id: b.id, title: `Reimbursements ${fmtDate(b.created_at.slice(0, 10))}` })}>Journal</button></td></tr>)}
          </tbody></table></div>)}
      </section>
      {preview && <JournalPreview {...preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function JournalPreview({ kind, id, title, onClose }: { kind: string; id: string; title: string; onClose: () => void }) {
  const { data: j, loading, error } = useLoad(() => api.get(`/api/v1/accounting/${kind}/${id}/journal`), [kind, id]);
  const url = (format: string) => `/api/v1/accounting/${kind}/${id}/export?format=${format}`;
  return (
    <Modal title={`Journal — ${title}`} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack">
          <div className="muted">{j.number} · {fmtDate(j.date)} · {j.narration}</div>
          {j.missing.length > 0 && <div className="alert error" style={{ margin: 0 }}>Map these heads to ledgers before exporting: {j.missing.join(', ')} (Ledger map tab).</div>}
          {!j.balanced && <div className="alert error" style={{ margin: 0 }}>The journal does not balance; check the run.</div>}
          <div className="table-wrap"><table className="t" aria-label="Journal entries"><thead><tr><th>Ledger</th><th>Head</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
            {j.entries.map((e: any) => <tr key={e.key}><td>{e.ledger ?? <span className="badge danger">Not mapped</span>}</td><td>{e.label}<div className="muted mono" style={{ fontSize: 12 }}>{e.key}</div></td>
              <td>{Number(e.debit) ? money(e.debit) : ''}</td><td>{Number(e.credit) ? money(e.credit) : ''}</td></tr>)}
            <tr><th colSpan={2}>Total</th><th>{money(j.total)}</th><th>{money(j.total)}</th></tr>
          </tbody></table></div>
          {!j.missing.length && j.balanced && <div className="row"><span className="spacer" />
            <a className="btn" href={url('csv')} style={{ textDecoration: 'none' }}>Download CSV</a>
            <a className="btn primary" href={url('tally_xml')} style={{ textDecoration: 'none' }}>Download Tally XML</a></div>}
        </div>)}
    </Modal>
  );
}

function Ledgers() {
  const toast = useToast();
  const { can } = useAuth();
  const edit = can('accounting.configure');
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/accounting/ledger-map'), []);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const saved: Record<string, string> = Object.fromEntries(data.items.map((i: any) => [i.map_key, i.ledger_name]));
  const v = draft ?? saved;
  const keys: { key: string; label: string }[] = [...data.heads, ...data.items.filter((i: any) => !data.heads.some((h: any) => h.key === i.map_key)).map((i: any) => ({ key: i.map_key, label: i.map_key }))];
  const changed = keys.filter((k) => (v[k.key] ?? '') !== (saved[k.key] ?? ''));
  return (
    <section className="card stack" aria-labelledby="ac-map">
      <div className="row"><h2 id="ac-map" style={{ margin: 0 }}>Ledger map</h2><span className="spacer" />
        {edit && <button className="btn primary" disabled={busy || !changed.length} onClick={async () => {
          setBusy(true);
          try { await api.put('/api/v1/accounting/ledger-map', { entries: changed.map((k) => ({ key: k.key, ledger: v[k.key] ?? '' })) }); toast('Ledger map saved'); setDraft(null); reload(); }
          catch (x) { toast(errText(x), 'error'); } finally { setBusy(false); }
        }}>Save{changed.length ? ` (${changed.length})` : ''}</button>}</div>
      <p className="muted" style={{ margin: 0 }}>Enter the ledger names exactly as they are in your accounts (Tally needs them to exist). Heads ending in <span className="mono">*</span> catch everything of that kind without its own ledger.</p>
      <div className="table-wrap"><table className="t" aria-label="Ledger map"><thead><tr><th>Head</th><th>Ledger</th></tr></thead><tbody>
        {keys.map((k) => <tr key={k.key}><td>{k.label}<div className="muted mono" style={{ fontSize: 12 }}>{k.key}</div></td>
          <td>{edit ? <input aria-label={`Ledger for ${k.key}`} value={v[k.key] ?? ''} maxLength={200} onChange={(e) => setDraft({ ...v, [k.key]: e.target.value })} style={{ width: '100%' }} />
            : (v[k.key] ?? <span className="muted">—</span>)}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}
