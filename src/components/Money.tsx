import { money } from '../format';
import './Money.css';

/**
 * The one way an amount reaches the screen, so a later change to how amounts appear, such as masking,
 * touches this file only. `Money` is for JSX; `formatMoney` is for text that cannot hold an element:
 * toasts, confirmation messages and option labels.
 */
export const formatMoney = (value: number | string | null | undefined): string => (value === null || value === undefined || value === '' ? '—' : money(value));

export const MASK = '••••••';

/** `masked`: the server withheld this figure. Not the same as empty, so it reads differently. */
export function Money({ value, empty = '—', masked }: { value: number | string | null | undefined; empty?: string; masked?: boolean }) {
  if (masked) return <span className="money tnum"><span aria-hidden="true">{MASK}</span><span className="visually-hidden">Hidden</span></span>;
  if (value === null || value === undefined || value === '') return <>{empty}</>;
  return <span className="money tnum">{formatMoney(value)}</span>;
}
