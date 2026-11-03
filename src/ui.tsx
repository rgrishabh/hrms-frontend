import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from './api';
import { STATUS_LABEL } from './format';

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const errText = (e: unknown) => {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details)) return `${e.message}: ${e.details.map((d: any) => (typeof d === 'string' ? d : `${d.path ? d.path.replace(/^\w+\./, '') + ' – ' : ''}${d.message}`)).join('; ')}`;
    return e.message;
  }
  return (e as Error)?.message ?? 'Something went wrong';
};

// ---------------------------------------------------------------- data hook
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError(errText(e)); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

// ---------------------------------------------------------------- small components
export const Loading = () => <div className="empty" aria-busy="true">Loading…</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }: { error: string | null }) => (error ? <div className="alert error" role="alert">{error}</div> : null);

export function StatusBadge({ status }: { status: string }) {
  const kind = ({ present: 'ok', available: 'ok', in_repair: 'warn', lost: 'danger', not_started: '', self_submitted: 'info', manager_submitted: 'info', acknowledged: 'ok', reopened: 'warn', resolved: 'ok', in_progress: 'info', report_submitted: 'info', conciliation: 'info', inquiry: 'info', received: 'warn', computed: 'info', finalized: 'ok', open: 'info', skipped: '', done: 'ok', published: 'ok', hired: 'ok', accepted: 'ok', completed: 'ok', sent: 'info', scheduled: 'info', offer: 'info', interview: 'info', screening: 'info', applied: '', on_hold: 'warn', declined: 'danger', closed: '', retired: '', authorized: 'ok', expired: 'danger', withdrawn: '', superseded: '', approved: 'ok', succeeded: 'ok', paid: 'ok', prepared: 'info', submitted: 'warn', draft: '', running: 'info', active: 'ok', verified: 'ok', issued: 'ok', healthy: 'ok', half_day: 'warn', on_leave: 'info', cancelled: '', pending: 'warn', missing_punch: 'danger',
    absent: 'danger', rejected: 'danger', failed: 'danger', disabled: 'danger', suspended: 'danger', returned: 'warn', degraded: 'warn' } as Record<string, string>)[status] ?? '';
  return <span className={`badge ${kind}`}>{STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field">{label}{children}{hint && <span className="hint">{hint}</span>}{error && <span className="err">{error}</span>}</label>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>{total === 0 ? 'No records' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ marginBottom: 14 }}><h2 style={{ margin: 0 }}>{title}</h2><span className="spacer" /><button className="btn sm" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Confirmation dialog with optional required comment. */
export function Confirm({ title, message, confirmLabel, danger, requireComment, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel: string; danger?: boolean; requireComment?: boolean;
  onConfirm: (comment: string) => Promise<void>; onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <div>{message}</div>
        {requireComment !== undefined && <Field label={requireComment ? 'Comment (required)' : 'Comment (optional)'}><textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>}
        <ErrorBox error={error} />
        <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || (requireComment && !comment.trim())}
            onClick={async () => { setBusy(true); setError(null); try { await onConfirm(comment); onClose(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } }}>
            {busy ? 'Working…' : confirmLabel}
          </button></div>
      </div>
    </Modal>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => (
    <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>{t.label}</button>))}</div>;
}
