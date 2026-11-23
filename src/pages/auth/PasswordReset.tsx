import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { useSubmit } from '../../components/useSubmit';
import type { PublicConfig } from '../../lib/config';
import { CardPage } from './CardPage';
import { NewPasswordFields, passwordsDiffer } from './NewPasswordFields';

/** The token from a link. It sits in the fragment so it never reaches a server log, and is cleared as soon as it is read. */
export function useFragmentToken(): string {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  useEffect(() => { if (window.location.hash) history.replaceState(null, '', window.location.pathname); }, []);
  return token;
}

/** Always says the same thing, because the server does not say whether the address exists. */
export function ForgotPassword({ cfg }: { cfg: PublicConfig }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const form = useSubmit(async () => { await api.post('/api/v1/auth/password/forgot', { email }); setSent(true); });
  if (sent) {
    return (
      <CardPage cfg={cfg}>
        <h1>Check your email</h1>
        <p className="text-2">If {email} has an account here, a link to choose a new password is on its way. It works once, for 30 minutes.</p>
        <p className="text-sm"><Link to="/">Back to sign in</Link></p>
      </CardPage>
    );
  }
  return (
    <CardPage cfg={cfg}>
      <form className="stack-4" onSubmit={form.submit}>
        <div className="stack-1"><h1>Reset your password</h1><p className="text-2">Enter your work email and we will send you a link.</p></div>
        <Input label="Work email" type="email" inputMode="email" autoComplete="username" required value={email} error={form.errors['email']} onChange={(e) => setEmail(e.target.value)} />
        <InlineError error={form.error} />
        <Button type="submit" variant="primary" size="lg" block loading={form.busy}>Send reset link</Button>
        <p className="text-sm"><Link to="/">Back to sign in</Link></p>
      </form>
    </CardPage>
  );
}

export function ResetPassword({ cfg }: { cfg: PublicConfig }) {
  const nav = useNavigate();
  const token = useFragmentToken();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [done, setDone] = useState(false);
  const form = useSubmit(async () => { await api.post('/api/v1/auth/password/reset', { token, newPassword: pw.password }); setDone(true); }, { validate: (): Record<string, string> => (pw.password === pw.confirm ? {} : { confirm: passwordsDiffer }) });
  if (!token) return <CardPage cfg={cfg}><h1>This link is incomplete</h1><p className="text-2">Open the full link from your email, or ask for a new one.</p><p className="text-sm"><Link to="/forgot-password">Send a new link</Link></p></CardPage>;
  if (done) return <CardPage cfg={cfg}><h1>Password changed</h1><p className="text-2">You can sign in with your new password. Every other session has been signed out.</p><Button variant="primary" onClick={() => nav('/')}>Go to sign in</Button></CardPage>;
  return (
    <CardPage cfg={cfg}>
      <form className="stack-4" onSubmit={form.submit}>
        <h1>Choose a new password</h1>
        <NewPasswordFields value={pw} onChange={setPw} error={form.errors['newPassword']} confirmError={form.errors['confirm']} />
        <InlineError error={form.errors['newPassword'] ? null : form.error} />
        <Button type="submit" variant="primary" size="lg" block loading={form.busy}>Change password</Button>
        <p className="text-sm"><Link to="/forgot-password">Link not working? Send a new one</Link></p>
      </form>
    </CardPage>
  );
}
