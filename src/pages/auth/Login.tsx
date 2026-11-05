import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import type { ApiResponse } from '../../lib/api-types';
import type { PublicConfig } from '../../lib/config';
import { CardPage } from './CardPage';

export function Login({ cfg }: { cfg: PublicConfig }) {
  const { refresh, setChallenge, sessionEnded, clearSessionEnded } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ended] = useState(sessionEnded);
  useEffect(() => { if (sessionEnded) clearSessionEnded(); }, [sessionEnded, clearSessionEnded]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ApiResponse<'/api/v1/auth/login', 'post'>>('/api/v1/auth/login', { email, password });
      setChallenge(r.mfaRequired ? { method: r.mfaMethod, delivery: r.mfaDelivery } : null);
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
        {ended && <Alert tone="warn">Your session ended, so please sign in again. Sessions end after a period without activity.</Alert>}
        <Input label="Work email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <InlineError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Signing in…">Sign in</Button>
        {cfg.auth.resetByEmail && <p className="text-sm"><Link to="/forgot-password">Forgot your password?</Link></p>}
      </form>
    </CardPage>
  );
}
