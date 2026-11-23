import type { ReactNode } from 'react';
import './Alert.css';

/** A notice that belongs to the page. For failures use ErrorState or InlineError. */
export function Alert({ tone = 'info', children, live }: { tone?: 'info' | 'ok' | 'warn'; children: ReactNode; live?: boolean }) {
  return <div className={`notice notice--${tone}`} role={live ? 'status' : undefined}>{children}</div>;
}
