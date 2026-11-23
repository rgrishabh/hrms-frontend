import type { ReactNode } from 'react';
import { Button } from './Button';
import { InlineError } from './ErrorState';

export interface FormActionsProps {
  error?: unknown;
  busy?: boolean;
  submitLabel: string;
  busyLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Secondary actions, on the left. */
  extra?: ReactNode;
}

/** The end of every form: what went wrong, then Cancel and the primary action. */
export function FormActions({ error, busy, submitLabel, busyLabel, onCancel, cancelLabel = 'Cancel', disabled, danger, extra }: FormActionsProps) {
  return (
    <>
      <InlineError error={error} />
      <div className="cluster-between">
        <div className="cluster">{extra}</div>
        <div className="cluster">
          {onCancel && <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>}
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={disabled} loading={busy} loadingText={busyLabel}>{submitLabel}</Button>
        </div>
      </div>
    </>
  );
}
