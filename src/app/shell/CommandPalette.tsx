import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Search, Sun } from 'lucide-react';
import { useAuth } from '../../auth';
import { Dialog } from '../../components/Dialog';
import { setThemePreference } from '../../lib/theme';
import { reachableRoutes } from '../registry';
import { useViewer } from '../useViewer';
import './CommandPalette.css';

interface Command { id: string; label: string; section: string; keywords: string; icon: typeof Search; run: () => void }

/** Opens with Ctrl+K or Cmd+K. Lists every page this person can reach, whatever view they are in. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // A layout effect, so a key pressed as soon as this is on screen is heard, and always sees the current `open`.
  useLayoutEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);
  return open ? <Palette onClose={() => onOpenChange(false)} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { config, logout } = useAuth();
  const viewer = useViewer();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const pages = reachableRoutes(viewer, config?.features ?? {}).map<Command>((r) => ({ id: r.id, label: r.label, section: 'Go to', keywords: r.path, icon: r.icon, run: () => nav(r.path) }));
    return [
      ...pages,
      { id: 'light', label: 'Switch to light theme', section: 'Actions', keywords: 'theme appearance', icon: Sun, run: () => setThemePreference('light') },
      { id: 'dark', label: 'Switch to dark theme', section: 'Actions', keywords: 'theme appearance', icon: Moon, run: () => setThemePreference('dark') },
      { id: 'signout', label: 'Sign out', section: 'Actions', keywords: 'log out logout', icon: LogOut, run: () => void logout() },
    ];
  }, [viewer, config, nav, logout]);

  const query = text.trim().toLowerCase();
  const results = commands.filter((c) => !query || c.label.toLowerCase().includes(query) || c.keywords.includes(query));

  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % Math.max(results.length, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % Math.max(results.length, 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
  };
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  return (
    <Dialog kind="modal" title="Command palette" size="md" onClose={onClose} className="palette">
      <div className="palette__search">
        <Search aria-hidden="true" />
        <input
          data-autofocus
          role="combobox"
          aria-label="Search pages and actions"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          placeholder="Search pages and actions"
          value={text}
          onChange={(e) => { setText(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="palette__list list-plain">
        {results.map((c, i) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keys go to the combobox input, which holds focus and moves aria-activedescendant
          <li key={c.id} id={`palette-${c.id}`} role="option" aria-selected={i === active} className="palette__item" onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
            <c.icon aria-hidden="true" /><span className="grow">{c.label}</span><span className="text-xs text-3">{c.section}</span>
          </li>
        ))}
        {!results.length && <li role="presentation" className="palette__none">Nothing matches.</li>}
      </ul>
    </Dialog>
  );
}
