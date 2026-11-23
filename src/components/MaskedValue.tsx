import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { errorMessage } from '../api';
import { Button } from './Button';
import './MaskedValue.css';

export interface MaskedValueProps {
  /** What the value is, for screen readers: "Net pay". */
  label: string;
  /** Shown until revealed, for example "₹ ••••••". */
  mask?: string;
  /** Fetches or returns the real value. Runs only on an explicit click, each time. */
  onReveal: () => Promise<string> | string;
}

/** Sensitive values stay masked until the viewer asks. Hiding again forgets the value. */
export function MaskedValue({ label, mask = '••••••', onReveal }: MaskedValueProps) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = async () => {
    setBusy(true);
    setError(null);
    try { setValue(await onReveal()); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const shown = value !== null;
  return (
    <span className="masked">
      <span className="masked__value tnum">{shown ? value : <><span aria-hidden="true">{mask}</span><span className="visually-hidden">{label} hidden</span></>}</span>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        loading={busy}
        aria-label={shown ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={shown}
        icon={shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        onClick={shown ? () => setValue(null) : reveal}
      />
      {error && <span role="alert" className="masked__error">{error}</span>}
    </span>
  );
}
