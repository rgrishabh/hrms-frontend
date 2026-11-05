import type { ReactNode } from 'react';
import './KeyValue.css';

export interface KeyValueItem { label: string; value: ReactNode }

/** Label and value pairs, as a description list. Empty values read as a dash. */
export function KeyValue({ items, columns = 'auto' }: { items: readonly KeyValueItem[]; columns?: 'auto' | 'one' }) {
  return (
    <dl className={`keyvalue keyvalue--${columns}`}>
      {items.map((i) => <div key={i.label} className="keyvalue__item"><dt>{i.label}</dt><dd>{i.value ?? '—'}</dd></div>)}
    </dl>
  );
}
