import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { useSubmit } from '../../components/useSubmit';
import type { PublicConfig } from '../../lib/config';
import { CardPage } from './CardPage';
import { NewPasswordFields, passwordsDiffer } from './NewPasswordFields';
import { useFragmentToken } from './PasswordReset';

/** Finishes an invitation or the first administrator's setup link. Both land here and work once. */
export function Setup({ cfg }: { cfg: PublicConfig }) {
  const nav = useNavigate();
  const token = useFragmentToken();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [done, setDone] = useState(false);
  const form = useSubmit(async () => { await api.post('/api/v1/auth/setup', { token, newPassword: pw.password }); setDone(true); }, { validate: (): Record<string, string> => (pw.password === pw.confirm ? {} : { confirm: passwordsDiffer }) });
  if (!token) return <CardPage cfg={cfg}><h1>This link is incomplete</h1><p className="text-2">Open the full link you were sent, or ask your administrator for a new invitation.</p></CardPage>;
  if (done) return <CardPage cfg={cfg}><h1>Password set</h1><p className="text-2">You can now sign in.</p><Button variant="primary" onClick={() => nav('/')}>Go to sign in</Button></CardPage>;
  return (
    <CardPage cfg={cfg}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="stack-1"><h1>Set up your account</h1><p className="text-2">Welcome to {cfg.brand.productName}. Choose a password to finish. This link works once.</p></div>
        <NewPasswordFields value={pw} onChange={setPw} error={form.errors['newPassword']} confirmError={form.errors['confirm']} />
        <InlineError error={form.errors['newPassword'] ? null : form.error} />
        <Button type="submit" variant="primary" size="lg" block loading={form.busy}>Set password</Button>
      </form>
    </CardPage>
  );
}
