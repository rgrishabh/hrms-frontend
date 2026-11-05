import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Download, LogOut, Settings2 } from 'lucide-react';
import { useAuth } from '../../auth';
import { Avatar } from '../../components/Avatar';
import { useInstallPrompt } from '../../pwa/install';
import { SupportLine } from './SupportLine';

/** Long enough to cross the gap between the button and the panel. */
const HOVER_CLOSE_MS = 200;

/**
 * The signed-in person and their own controls, top right. A mouse resting on it opens the panel and leaving closes it; a click keeps it open
 * until a click elsewhere, Esc or a second click. Touch only clicks. The panel holds links and buttons, so this is a disclosure, not an ARIA menu.
 */
export function UserMenu() {
  const { config, me, logout } = useAuth();
  const install = useInstallPrompt();
  const [open, setOpen] = useState<'hover' | 'click' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closing = useRef<number | undefined>(undefined);

  const stopClosing = () => window.clearTimeout(closing.current);
  useEffect(() => stopClosing, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(null);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!config || !me) return null;
  const close = () => setOpen(null);
  const roles = me.roles.map((r) => r.name).join(', ');

  return (
    <div
      ref={root}
      className="user-menu"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        stopClosing();
        setOpen((o) => o ?? 'hover');
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        closing.current = window.setTimeout(() => setOpen((o) => (o === 'hover' ? null : o)), HOVER_CLOSE_MS);
      }}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <button ref={button} type="button" className="user-menu__button" aria-label={`Account menu, ${me.user.displayName}`} aria-expanded={!!open} onClick={() => setOpen((o) => (o === 'click' ? null : 'click'))}>
        <Avatar name={me.user.displayName} size="sm" />
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="user-menu__panel">
          <div className="user-menu__who">
            <Avatar name={me.user.displayName} size="sm" />
            <div className="grow">
              <div className="user-menu__name">{me.user.displayName}</div>
              <div className="user-menu__role">{roles}</div>
            </div>
          </div>
          <div className="user-menu__actions">
            <Link to="/account" className="user-menu__item" onClick={close}><Settings2 aria-hidden="true" />Account</Link>
            {install.available && <button type="button" className="user-menu__item" onClick={() => { close(); void install.prompt(); }}><Download aria-hidden="true" />Install app</button>}
            <button type="button" className="user-menu__item" onClick={() => void logout()}><LogOut aria-hidden="true" />Sign out</button>
          </div>
          <SupportLine cfg={config} />
        </div>
      )}
    </div>
  );
}
