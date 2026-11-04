import { money } from '../format';
import './Money.css';

/**
 * The one way an amount reaches the screen, so a later change to how amounts appear, such as masking,
 * touches this file only. `Money` is for JSX; `formatMoney` is for text that cannot hold an element:
 * toasts, confirmation messages and option labels.
 */
export const formatMoney = (value: number | string): string => money(value);

export function Money({ value, empty = '—' }: { value: number | string | null | undefined; empty?: string }) {
  if (value === null || value === undefined || value === '') return <>{empty}</>;
  return <span className="money tnum">{formatMoney(value)}</span>;
}
