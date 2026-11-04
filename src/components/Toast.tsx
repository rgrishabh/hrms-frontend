import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Toast.css';

export type ToastKind = 'ok' | 'error';
interface ToastItem { id: number; text: string; kind: ToastKind }

const OK_MS = 4500;
const ERROR_MS = 10000;

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

/**
 * Short confirmations and errors. Successes are polite; errors are assertive, last longer, and any
 * toast pauses its timer while hovered or focused so it can be read and dismissed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const schedule = useCallback((item: ToastItem) => {
    timers.current.set(item.id, setTimeout(() => remove(item.id), item.kind === 'error' ? ERROR_MS : OK_MS));
  }, [remove]);
  const push = useCallback((text: string, kind: ToastKind = 'ok') => {
    const item = { id: nextId.current++, text, kind };
    setToasts((t) => [...t, item]);
    schedule(item);
  }, [schedule]);
  const pause = (id: number) => clearTimeout(timers.current.get(id));

  const render = (t: ToastItem) => (
    <div
      key={t.id}
      className={`toast toast--${t.kind}`}
      role={t.kind === 'error' ? 'alert' : undefined}
      onMouseEnter={() => pause(t.id)}
      onMouseLeave={() => schedule(t)}
      onFocus={() => pause(t.id)}
      onBlur={() => schedule(t)}
    >
      <span className="grow">{t.text}</span>
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => remove(t.id)}><X aria-hidden="true" /></button>
    </div>
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts">
          <div role="status" aria-live="polite" className="toasts__group">{toasts.filter((t) => t.kind === 'ok').map(render)}</div>
          <div className="toasts__group">{toasts.filter((t) => t.kind === 'error').map(render)}</div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
