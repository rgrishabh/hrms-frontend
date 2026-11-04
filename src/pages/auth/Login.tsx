import { useState, type FormEvent } from 'react';
import { api, setCsrf } from '../../api';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import type { PublicConfig } from '../../lib/config';
import { CardPage } from './CardPage';

export function Login({ cfg }: { cfg: PublicConfig }) {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ csrfToken: string }>('/api/v1/auth/login', { email, password });
      setCsrf(r.csrfToken);
      await refresh();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <CardPage cfg={cfg}>
      <form className="stack-4" onSubmit={submit}>
        <div className="stack-1">
          <h1>Sign in</h1>
          {cfg.brand.loginMessage && <p className="text-2">{cfg.brand.loginMessage}</p>}
        </div>
        <Input label="Work email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <InlineError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Signing in…">Sign in</Button>
      </form>
    </CardPage>
  );
}
