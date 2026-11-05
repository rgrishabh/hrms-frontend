import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';
import './Dialog.css';

/* Open dialogs, oldest first. Only the newest answers Escape, and focus returns down the stack. */
const stack: symbol[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** One-time content, such as a device key: only an explicit button can close it. */
  persistent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  kind: 'modal' | 'drawer';
  side?: 'left' | 'right';
  className?: string;
  /** For a dialog whose form resets after saving: says when there is unsaved work, instead of "anything typed since opening". */
  dirty?: boolean;
}

/**
 * The shared base of Modal and Drawer: portal, focus trap, focus restore, stack-aware Escape, scroll
 * lock, and a guard so a filled-in form is not lost to a stray click or Escape.
 */
export function Dialog({ title, description, onClose, children, footer, persistent, size = 'md', kind, side = 'right', className, dirty: dirtyProp }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const pressStartedOnBackdrop = useRef(false);

  const dismiss = () => {
    if (persistent) return;
    if (dirtyProp ?? dirty) { setAskDiscard(true); return; }
    onClose();
  };

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const token = Symbol('dialog');
    stack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const target = root?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      ?? root?.querySelector('.dialog__body')?.querySelector<HTMLElement>(FOCUSABLE)
      ?? root;
    target?.focus();
    document.body.classList.add('dialog-open');
    // On window, because a focused button that just removed itself leaves focus on the body.
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && stack[stack.length - 1] === token) dismissRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
      stack.splice(stack.indexOf(token), 1);
      if (!stack.length) document.body.classList.remove('dialog-open');
      previous?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 || import.meta.env.MODE === 'test');
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0]!; const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  // A drag that starts inside and ends on the backdrop, such as selecting text, must not close it.
  const onBackdropDown = (e: MouseEvent) => { pressStartedOnBackdrop.current = e.target === e.currentTarget; };
  const onBackdropUp = (e: MouseEvent) => { if (pressStartedOnBackdrop.current && e.target === e.currentTarget) dismiss(); pressStartedOnBackdrop.current = false; };

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a pointer convenience: the keyboard path is Esc and the close button
    <div className={`dialog-backdrop dialog-backdrop--${kind} dialog-backdrop--${side}`} onMouseDown={onBackdropDown} onMouseUp={onBackdropUp}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[`dialog dialog--${kind} dialog--${size}`, className].filter(Boolean).join(' ')}
        onKeyDown={onKeyDown}
        onInput={(e) => { if (panel.current?.contains(e.target as Node)) setDirty(true); }}
      >
        <header className="dialog__header">
          <div className="grow">
            <h2 id={titleId} className="dialog__title">{title}</h2>
            {description && <p id={descriptionId} className="dialog__description">{description}</p>}
          </div>
          {!persistent && <Button variant="ghost" size="sm" iconOnly aria-label="Close" icon={<X aria-hidden="true" />} onClick={dismiss} />}
        </header>
        <div className="dialog__body">{children}</div>
        {askDiscard
          ? (
            <footer className="dialog__footer dialog__footer--warn" role="group" aria-label="Unsaved changes">
              <span className="grow">Discard your changes?</span>
              <Button size="sm" onClick={() => setAskDiscard(false)}>Keep editing</Button>
              <Button size="sm" variant="danger" onClick={onClose}>Discard</Button>
            </footer>
          )
          : footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
