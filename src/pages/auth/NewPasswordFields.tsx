import { Input } from '../../components/Input';

export const PASSWORD_HINT = 'At least 12 characters. Length is what counts. Common and leaked passwords are refused.';
export const passwordsDiffer = 'The passwords do not match.';

export interface NewPassword { password: string; confirm: string }

/** A new password twice. The server's reasons for refusing one (`weak_password`) arrive in `error`. */
export function NewPasswordFields({ value, onChange, error, confirmError, label = 'New password', hint = PASSWORD_HINT }: { value: NewPassword; onChange: (v: NewPassword) => void; error?: string; confirmError?: string; label?: string; hint?: string }) {
  return (
    <>
      <Input label={label} hint={hint} type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={value.password} error={error} onChange={(e) => onChange({ ...value, password: e.target.value })} />
      <Input label={`Confirm ${label.toLowerCase()}`} type="password" autoComplete="new-password" required value={value.confirm} error={confirmError} onChange={(e) => onChange({ ...value, confirm: e.target.value })} />
    </>
  );
}
