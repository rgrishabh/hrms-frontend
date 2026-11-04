import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';

export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) { setError('The new passwords do not match'); return; }
    setBusy(true);
    try {
      await api.post('/api/v1/auth/password', { currentPassword: cur, newPassword: pw });
      setCur(''); setPw(''); setPw2('');
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <form className="stack-3" onSubmit={submit}>
      {forced && <Alert tone="warn">You must choose a new password before continuing.</Alert>}
      <Input label={forced ? 'Temporary password' : 'Current password'} type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
      <Input label="New password" hint="At least 12 characters. Other sessions are signed out." type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
      <InlineError error={error} />
      <div><Button type="submit" variant="primary" loading={busy} loadingText="Saving…">Change password</Button></div>
    </form>
  );
}
