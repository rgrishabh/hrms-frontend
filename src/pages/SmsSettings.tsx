import { useState } from 'react';
import { api, qs } from '../api';
import { fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Modal, Field, StatusBadge, Confirm, useToast, errText } from '../ui';

/** Settings → SMS: the DLT-registered template for each notification kind, the delivery log, and a test send. */
export function SmsSettings() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/v1/sms/templates'), []);
  const [edit, setEdit] = useState<any | null>(null);
  const [test, setTest] = useState<any | null>(null);
  const [remove, setRemove] = useState<any | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="stack">
      {!data.transport && <div className="alert info">No SMS provider is configured for this installation (SMS_TRANSPORT deployment setting). Templates can be prepared now.</div>}
      <section className="card stack" aria-labelledby="sms-t">
        <h2 id="sms-t" style={{ margin: 0 }}>SMS templates</h2>
        <p className="muted" style={{ margin: 0 }}>In India every SMS must match a template registered on your operator's DLT portal. Enter the template ID and the exact registered text; the first <span className="mono">{'{#var#}'}</span> gets the notification's title, the second its detail (30 characters each). Notifications without a template are not sent by SMS.</p>
        <div className="table-wrap"><table className="t" aria-label="SMS templates"><thead><tr><th>Notification</th><th>Template</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((i: any) => <tr key={i.kind}><td>{i.label}<div className="muted mono" style={{ fontSize: 12 }}>{i.kind}</div></td>
            <td style={{ maxWidth: 360 }}>{i.template ? <>{i.template.text}<div className="muted mono" style={{ fontSize: 12 }}>DLT {i.template.dlt_template_id}</div></> : <span className="muted">—</span>}</td>
            <td>{i.template ? <StatusBadge status={i.template.enabled ? 'active' : 'disabled'} /> : <span className="muted">Not sent by SMS</span>}</td>
            <td className="row" style={{ gap: 4 }}>
              <button className="btn sm" onClick={() => setEdit(i)}>{i.template ? 'Edit' : 'Add template'}</button>
              {i.template && data.transport && <button className="btn sm" onClick={() => setTest(i)}>Send test</button>}
              {i.template && <button className="btn sm danger" onClick={() => setRemove(i)}>Remove</button>}
            </td></tr>)}
        </tbody></table></div>
      </section>
      <Outbox />
      {edit && <TemplateForm item={edit} onClose={() => setEdit(null)} onSaved={() => { toast('Template saved'); reload(); }} />}
      {test && <TestForm item={test} onClose={() => setTest(null)} />}
      {remove && <Confirm title="Remove SMS template" danger confirmLabel="Remove" onClose={() => setRemove(null)} message={`Stop sending “${remove.label}” by SMS?`}
        onConfirm={async () => { await api.del(`/api/v1/sms/templates/${remove.kind}`); toast('Template removed'); reload(); }} />}
    </div>
  );
}

function TemplateForm({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ dltTemplateId: item.template?.dlt_template_id ?? '', text: item.template?.text ?? '', enabled: item.template?.enabled ?? true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`SMS template — ${item.label}`} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try { await api.put(`/api/v1/sms/templates/${item.kind}`, f); onSaved(); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="DLT template ID" hint="The number your operator's DLT portal gave the template"><input required inputMode="numeric" pattern="[0-9]{10,25}" value={f.dltTemplateId} onChange={(e) => setF({ ...f, dltTemplateId: e.target.value })} /></Field>
        <Field label="Registered text" hint="Exactly as registered, including the sender's sign-off; up to two {#var#}"><textarea required minLength={5} maxLength={500} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="HRMS: {#var#}. Details: {#var#}. Open HRMS to act. -ACMELB" /></Field>
        <label className="row"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Send this notification by SMS</label>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function TestForm({ item, onClose }: { item: any; onClose: () => void }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Send test — ${item.label}`} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault(); setError(null); setBusy(true);
        try { const r = await api.post('/api/v1/sms/test', { phone, kind: item.kind }); toast(`Sent: ${r.text}`); onClose(); } catch (x) { setError(errText(x)); } finally { setBusy(false); }
      }}>
        <Field label="Mobile number"><input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></Field>
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send now'}</button></div>
      </form>
    </Modal>
  );
}

function Outbox() {
  const [status, setStatus] = useState('');
  const { data, loading, error } = useLoad(() => api.get(`/api/v1/sms/outbox${qs({ status: status || undefined })}`), [status]);
  return (
    <section className="card stack" aria-labelledby="sms-o">
      <div className="row"><h2 id="sms-o" style={{ margin: 0 }}>Recent SMS</h2><span className="spacer" />
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['queued', 'sent', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field></div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.items.length ? <Empty>No SMS sent yet.</Empty> : (
        <div className="table-wrap"><table className="t" aria-label="Recent SMS"><thead><tr><th>When</th><th>To</th><th>Notification</th><th>Status</th><th>Detail</th></tr></thead><tbody>
          {data.items.map((o: any) => <tr key={o.id}><td>{fmtDateTime(o.created_at)}</td><td>{o.display_name}<div className="muted mono" style={{ fontSize: 12 }}>{o.to}</div></td>
            <td className="mono" style={{ fontSize: 12 }}>{o.kind}</td><td><StatusBadge status={o.status} /></td>
            <td className="muted" style={{ maxWidth: 280, fontSize: 12 }}>{o.last_error ?? (o.sent_at ? `Sent ${fmtDateTime(o.sent_at)}` : `Attempt ${o.attempts}`)}</td></tr>)}
        </tbody></table></div>)}
    </section>
  );
}
