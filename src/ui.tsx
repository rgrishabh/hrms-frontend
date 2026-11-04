/*
 * Compatibility layer for pages not yet migrated to src/components (listed in docs/DESIGN.md). They keep
 * their markup, but get the new dialogs, toasts and tabs through this file. Delete it with the last one.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from './api';
import { ErrorState } from './components/ErrorState';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Modal as NewModal } from './components/Modal';
import { Pagination } from './components/Pagination';
import { Tabs as NewTabs } from './components/Tabs';
import { ERROR_SURFACE_ATTR } from './contract';
import './styles/legacy.css';

export { useToast, ToastProvider } from './components/Toast';
export { statusLabel, StatusBadge } from './components/Badge';
export const errText = errorMessage;

/**
 * Data loading for unmigrated pages. Data is cleared when the dependencies change, so a page never
 * shows one record's data under another record's heading. Reload keeps the current data on screen.
 */
export function useLoad<T = any>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const lastDeps = useRef<unknown[]>(deps);
  useEffect(() => {
    let alive = true;
    const changed = deps.length !== lastDeps.current.length || deps.some((d, i) => !Object.is(d, lastDeps.current[i]));
    lastDeps.current = deps;
    if (changed) { setData(null); setError(null); }
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, tick]);
  return { data: data as any, error, loading, reload: () => setTick((t) => t + 1), setData };
}

export const Loading = () => <div className="empty" aria-busy="true">Loading…</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }: { error: string | null }) => (error ? <div className="alert error" role="alert" {...{ [ERROR_SURFACE_ATTR]: '' }}>{error}</div> : null);

/** The failed-load branch of the shared pattern: loading, then failed, then empty or data. */
export const LoadFailed = ({ error, onRetry }: { error: string | null; onRetry?: () => void }) => <ErrorState error={new Error(error ?? 'This could not be loaded')} onRetry={onRetry} compact />;

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field-legacy">{label}{children}{hint && <span className="hint">{hint}</span>}{error && <span className="err">{error}</span>}</label>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  return <div className="pager"><Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} /></div>;
}

export function Modal({ title, onClose, children, persistent }: { title: string; onClose: () => void; children: ReactNode; persistent?: boolean }) {
  return <NewModal title={title} onClose={onClose} persistent={persistent}>{children}</NewModal>;
}

/** Confirmation dialog with optional required comment. onConfirm must reject on failure to keep it open. */
export function Confirm({ title, message, confirmLabel, danger, requireComment, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel: string; danger?: boolean; requireComment?: boolean;
  onConfirm: (comment: string) => Promise<void>; onClose: () => void;
}) {
  return <ConfirmDialog title={title} message={message} confirmLabel={confirmLabel} danger={danger} requireComment={requireComment} onConfirm={onConfirm} onClose={onClose} />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return <div className="tabs-legacy"><NewTabs label="Sections" tabs={tabs} value={value} onChange={onChange} /></div>;
}
