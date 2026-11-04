import { useState } from 'react';
import './Avatar.css';

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export interface AvatarProps { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }

/** A photo if there is a working one, otherwise initials. Decorative: the name sits next to it. */
export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}
