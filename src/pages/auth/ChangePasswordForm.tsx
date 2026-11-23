import { useState } from 'react';
import { api } from '../../api';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { useSubmit } from '../../components/useSubmit';
import { NewPasswordFields, PASSWORD_HINT, passwordsDiffer } from './NewPasswordFields';

export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const form = useSubmit(async () => {
    // The answer carries the rotated CSRF token, which the API client keeps.
    await api.post('/api/v1/auth/password', { currentPassword: cur, newPassword: pw.password });
    setCur(''); setPw({ password: '', confirm: '' });
    onDone();
  }, { validate: (): Record<string, string> => (pw.password === pw.confirm ? {} : { confirm: passwordsDiffer }) });
  return (
    <form className="stack-3" onSubmit={form.submit}>
      {forced && <Alert tone="warn">You must choose a new password before continuing.</Alert>}
      <Input label={forced ? 'Temporary password' : 'Current password'} type="password" autoComplete="current-password" required value={cur} error={form.errors['currentPassword']} onChange={(e) => setCur(e.target.value)} />
      <NewPasswordFields value={pw} onChange={setPw} error={form.errors['newPassword']} confirmError={form.errors['confirm']} hint={`${PASSWORD_HINT} Other sessions are signed out.`} />
      <InlineError error={form.errors['newPassword'] ? null : form.error} />
      <div><Button type="submit" variant="primary" loading={form.busy} loadingText="Saving…">Change password</Button></div>
    </form>
  );
}
