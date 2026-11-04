import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import './Tabs.css';

export interface TabItem<T extends string> { key: T; label: string; count?: number }

export interface TabsProps<T extends string> {
  label: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Shared id so TabPanel can point back at its tab. */
  idBase?: string;
}

export const tabId = (base: string, key: string) => `${base}-tab-${key}`;
export const panelId = (base: string, key: string) => `${base}-panel-${key}`;

/** WAI-ARIA tabs: one tab stop, arrow keys, Home and End. Scrolls inside itself on narrow screens. */
export function Tabs<T extends string>({ label, tabs, value, onChange, idBase }: TabsProps<T>) {
  const generated = useId();
  const base = idBase ?? generated;
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length]!;
    onChange(t.key);
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(base, t.key))}`)?.focus();
  };
  return (
    <div ref={list} role="tablist" aria-label={label} className="tabs-bar" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.key}
          id={tabId(base, t.key)}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          aria-controls={idBase ? panelId(base, t.key) : undefined}
          tabIndex={value === t.key ? 0 : -1}
          className="tabs-bar__tab"
          onClick={() => onChange(t.key)}
        >
          {t.label}{t.count !== undefined && <span className="tabs-bar__count"> ({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idBase, tab, children }: { idBase: string; tab: string; children: ReactNode }) {
  return <div role="tabpanel" id={panelId(idBase, tab)} aria-labelledby={tabId(idBase, tab)} tabIndex={0} className="tabs-panel">{children}</div>;
}

/** Keeps the selected tab in ?tab= so refresh and links keep the place. Unknown values fall back. */
export function useTabParam<T extends string>(keys: readonly T[], param = 'tab'): [T, (key: T) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get(param) as T | null;
  const value = requested && keys.includes(requested) ? requested : keys[0]!;
  const set = (key: T) => setParams((p) => { const n = new URLSearchParams(p); n.set(param, key); return n; }, { replace: true });
  return [value, set];
}
