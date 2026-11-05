import { Eye, EyeOff } from 'lucide-react';
import { isMaskedField } from '../lib/masking';
import { Button } from './Button';

/** Shows or hides the masked values of a section. Showing asks the server again, which records who looked. */
export function RevealToggle({ revealed, onChange, what = 'amounts', loading }: { revealed: boolean; onChange: (revealed: boolean) => void; what?: string; loading?: boolean }) {
  return (
    <Button size="sm" loading={loading} aria-pressed={revealed} icon={revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} title={revealed ? undefined : 'Showing these is recorded in the audit log'} onClick={() => onChange(!revealed)}>
      {revealed ? `Hide ${what}` : `Show ${what}`}
    </Button>
  );
}

/** Free text that may be withheld, such as a leave reason. */
export function MaskableText({ row, field, reason = 'Only the person, HR above them and who decides the request can see this.' }: { row: object; field: string; reason?: string }) {
  const value = (row as Record<string, unknown>)[field];
  if (isMaskedField(row, field)) return <Restricted reason={reason} />;
  return <>{value === null || value === undefined ? '—' : String(value)}</>;
}

/** A field the server withheld from this reader, with the reason. There is no way to reveal these. */
export function Restricted({ reason = 'Only HR above this person, and the person, can see this.' }: { reason?: string }) {
  return <span className="text-2 text-sm">Hidden. {reason}</span>;
}
