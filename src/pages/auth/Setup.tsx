import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { InlineError } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import type { PublicConfig } from '../../lib/config';
import { CardPage } from './CardPage';

/** Completes a one-time administrator setup link. The token is in the URL fragment, which browsers never send to servers. */
export function Setup({ cfg }: { cfg: PublicConfig }) {
  const nav = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { if (window.location.hash) history.replaceState(null, '', window.location.pathname); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) { setError('The passwords do not match'); return; }
    setBusy(true);
    try { await api.post('/api/v1/auth/setup', { token, newPassword: pw }); setDone(true); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  if (!token) return <CardPage cfg={cfg}><h1>Setup link incomplete</h1><p className="text-2">Open the full link you were given, or ask your system operator for a new one.</p></CardPage>;
  if (done) return <CardPage cfg={cfg}><h1>Password set</h1><p className="text-2">You can now sign in.</p><Button variant="primary" onClick={() => nav('/')}>Go to sign in</Button></CardPage>;
  return (
    <CardPage cfg={cfg}>
      <form className="stack-4" onSubmit={submit}>
        <div className="stack-1"><h1>Set up your administrator account</h1><p className="text-2">This link works once. Choose a strong password of at least 12 characters.</p></div>
        <Input label="New password" type="password" autoComplete="new-password" required minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <InlineError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>Set password</Button>
      </form>
    </CardPage>
  );
}
