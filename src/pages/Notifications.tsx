import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { fmtDateTime } from '../format';
import { useLoad, Loading, ErrorBox, Empty, Pager, useToast, errText } from '../ui';

export function Notifications({ onChange }: { onChange: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const url = `/api/v1/notifications${qs({ unread: unreadOnly || undefined, page, pageSize: 20 })}`;
  const { data, loading, error, reload } = useLoad(() => api.get(url), [url]);
  const open = async (n: any) => {
    if (!n.read_at) { await api.post(`/api/v1/notifications/${n.id}/read`).catch(() => undefined); onChange(); }
    if (n.link) nav(n.link); else reload();
  };
  return (
    <div className="stack">
      <div className="row"><div><h1>Notifications</h1><p className="sub" style={{ marginBottom: 0 }}>Approvals, decisions, reminders and security notices.</p></div><span className="spacer" />
        <label className="row"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Unread only</label>
        <button className="btn" onClick={async () => { try { await api.post('/api/v1/notifications/read-all'); onChange(); reload(); } catch (e) { toast(errText(e), 'error'); } }}>Mark all read</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data.items.length ? <Empty>{unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}</Empty> : (
        <>
          <div className="card" style={{ padding: 0 }}>
            {data.items.map((n: any) => (
              <button key={n.id} onClick={() => open(n)} className="notif" style={{ fontWeight: n.read_at ? 400 : 600 }}>
                <span className={`dot ${n.read_at ? '' : 'on'}`} aria-label={n.read_at ? 'read' : 'unread'} />
                <span style={{ flex: 1, textAlign: 'left' }}><div>{n.title}</div>{n.body && <div className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{n.body}</div>}</span>
                <span className="muted" style={{ fontWeight: 400, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(n.created_at)}</span>
              </button>))}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
