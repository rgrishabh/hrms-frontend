import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './StatTile.css';

export type StatTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: StatTone;
  href?: string;
  /** Stable key for tests and for linking a tile to its data. */
  tileKey?: string;
}

/** One number with its label. If there is a screen behind the number, the whole tile links to it. */
export function StatTile({ label, value, detail, tone = 'neutral', href, tileKey }: StatTileProps) {
  const body = (
    <>
      <div className="tile__label l">{label}</div>
      <div className="tile__value v tnum">{value}</div>
      {detail && <div className="tile__detail d">{detail}</div>}
    </>
  );
  const cls = `tile tile--${tone}`;
  return href
    ? <Link to={href} className={`${cls} tile--link`} data-tile={tileKey}>{body}</Link>
    : <div className={cls} data-tile={tileKey}>{body}</div>;
}

export function StatGrid({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="tile-grid" role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}
