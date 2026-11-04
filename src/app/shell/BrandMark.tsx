import { useState } from 'react';
import type { PublicConfig } from '../../lib/config';
import './BrandMark.css';

/** Logo from deployment config, the dark variant in dark mode via CSS; initials if none works. */
export function BrandMark({ cfg, size = 'md' }: { cfg: PublicConfig; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const { logoUrl, logoDarkUrl, name, productName } = cfg.brand;
  if (logoUrl && !failed) {
    return (
      <span className={`brand-logo brand-logo--${size}`}>
        <img className={logoDarkUrl ? 'brand-logo__light' : undefined} src={logoUrl} alt={`${name} logo`} onError={() => setFailed(true)} />
        {logoDarkUrl && <img className="brand-logo__dark" src={logoDarkUrl} alt={`${name} logo`} onError={() => setFailed(true)} />}
      </span>
    );
  }
  const initials = productName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className={`brand-initials brand-initials--${size}`} aria-hidden="true">{initials}</span>;
}
