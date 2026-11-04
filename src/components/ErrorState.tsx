import { CircleAlert, Lock, Settings2, WifiOff } from 'lucide-react';
import { ApiError, errorMessage, isNotConfigured } from '../api';
import { ERROR_SURFACE_ATTR } from '../contract';
import { Button } from './Button';
import './ErrorState.css';

const surface = { [ERROR_SURFACE_ATTR]: '' };

function describe(error: unknown): { title: string; detail: string; retryable: boolean; icon: typeof CircleAlert } {
  if (isNotConfigured(error)) return { title: 'Not set up yet', detail: errorMessage(error), retryable: false, icon: Settings2 };
  if (error instanceof ApiError) {
    if (error.status === 0) return { title: 'You appear to be offline', detail: 'Check your connection and try again.', retryable: true, icon: WifiOff };
    if (error.status === 403) return { title: 'You do not have access to this', detail: 'Ask your administrator if you need it.', retryable: false, icon: Lock };
    if (error.status === 404) return { title: 'This could not be found', detail: errorMessage(error), retryable: false, icon: CircleAlert };
    if (error.status >= 500) return { title: 'This could not be loaded', detail: errorMessage(error), retryable: true, icon: CircleAlert };
  }
  return { title: 'This could not be loaded', detail: errorMessage(error), retryable: true, icon: CircleAlert };
}

/** A failed load, with the reason and a retry where retrying can help. Never reads as "nothing here". */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { title, detail, retryable, icon: Icon } = describe(error);
  return (
    <div {...surface} role="alert" className={`error-state${compact ? ' error-state--compact' : ''}`}>
      <Icon className="error-state__icon" aria-hidden="true" />
      <div className="grow">
        <p className="error-state__title">{title}</p>
        <p className="error-state__detail">{detail}</p>
      </div>
      {retryable && onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** A failed action inside a form or dialog. Renders nothing without an error. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return <div {...surface} role="alert" className="inline-error">{typeof error === 'string' ? error : errorMessage(error)}</div>;
}
