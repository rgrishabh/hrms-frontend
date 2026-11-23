import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../format';
import './Badge.css';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand';

export function Badge({ tone = 'neutral', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return <span className={`badge badge--${tone}`} title={title}>{children}</span>;
}

const TONE: Record<string, BadgeTone> = {
  present: 'ok', available: 'ok', on_duty: 'ok', acknowledged: 'ok', resolved: 'ok', finalized: 'ok', done: 'ok', published: 'ok', hired: 'ok', accepted: 'ok', completed: 'ok',
  authorized: 'ok', approved: 'ok', succeeded: 'ok', paid: 'ok', active: 'ok', verified: 'ok', issued: 'ok', healthy: 'ok',
  in_repair: 'warn', reopened: 'warn', received: 'warn', on_hold: 'warn', submitted: 'warn', half_day: 'warn', partly_completed: 'warn', pending: 'warn', returned: 'warn', degraded: 'warn', on_notice: 'warn', pre_joining: 'warn',
  lost: 'danger', declined: 'danger', expired: 'danger', not_done: 'danger', missing_punch: 'danger', absent: 'danger', rejected: 'danger', failed: 'danger', disabled: 'danger', suspended: 'danger',
  self_submitted: 'info', manager_submitted: 'info', in_progress: 'info', report_submitted: 'info', conciliation: 'info', inquiry: 'info', computed: 'info', open: 'info', sent: 'info', scheduled: 'info', offer: 'info', interview: 'info', screening: 'info', running: 'info', prepared: 'info', on_leave: 'info', disbursed: 'info',
};

/** Human label for a status code: an explicit label, else the code in sentence case. */
export function statusLabel(status: string): string {
  const s = STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Status always has words, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? 'neutral'}>{statusLabel(status)}</Badge>;
}
