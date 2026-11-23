import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Style { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; icon?: ReactNode; iconOnly?: boolean }

const cls = ({ variant = 'secondary', size = 'md', block, iconOnly }: Style, extra?: string) =>
  ['btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', extra].filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Style {
  /** Shows a busy state and blocks clicks, so a slow request cannot be submitted twice. */
  loading?: boolean;
  loadingText?: string;
}

/** An action. type defaults to "button" so a stray button cannot submit a surrounding form. */
export function Button({ variant, size, block, icon, iconOnly, loading, loadingText, className, children, disabled, type = 'button', onClick, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cls({ variant, size, block, iconOnly }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

/** Navigation that looks like a button. Keeps link semantics, so it can open in a new tab. */
export function ButtonLink({ variant, size, block, icon, iconOnly, className, children, ...rest }: LinkProps & Style) {
  return <Link {...rest} className={cls({ variant, size, block, iconOnly }, className)}>{icon}{children}</Link>;
}

/** A plain anchor styled as a button, for downloads and external pages. */
export function ButtonAnchor({ variant, size, block, icon, iconOnly, className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Style) {
  return <a {...rest} className={cls({ variant, size, block, iconOnly }, className)}>{icon}{children}</a>;
}
