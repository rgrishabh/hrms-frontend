import type { ReactNode } from 'react';
import { BrandMark } from '../../app/shell/BrandMark';
import { SupportLine } from '../../app/shell/SupportLine';
import type { PublicConfig } from '../../lib/config';
import './auth.css';

/** The single-card layout of everything before the shell: sign-in, setup, MFA, forced password change. */
export function CardPage({ cfg, children }: { cfg: PublicConfig | null; children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        {cfg && <div className="auth-card__brand"><BrandMark cfg={cfg} size="lg" /><span>{cfg.brand.name}</span></div>}
        {children}
        {cfg && <SupportLine cfg={cfg} />}
      </div>
    </main>
  );
}
