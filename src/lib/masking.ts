import { keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiQuery } from './query';

/**
 * L4 fields answer null with `masked: true` and `maskedFields`, unless the request asks with `?reveal=1`, which is
 * audited. A field that is simply empty stays out of `maskedFields`. L3 fields use the same shape, without a reveal.
 */
export interface Maskable { masked?: boolean; maskedFields?: readonly string[] }

export const isMaskedField = (row: object | null | undefined, field: string): boolean => {
  const r = row as Maskable | null | undefined;
  return !!r?.masked && !!r.maskedFields?.includes(field);
};

export const withReveal = (url: string) => `${url}${url.includes('?') ? '&' : '?'}reveal=1`;

/**
 * A query that can be asked for its masked values. Revealed answers are not cached, and hiding drops them, so a figure
 * lives in memory only while it is on screen.
 */
export function useRevealable<T>(url: string | null, { keepPrevious = false }: { keepPrevious?: boolean } = {}) {
  const [revealed, setRevealed] = useState(false);
  const paging = keepPrevious ? { placeholderData: keepPreviousData as never } : {};
  const query = useApiQuery<T>(url && revealed ? withReveal(url) : url, revealed ? { ...paging, gcTime: 0, staleTime: 0 } : paging);
  return { query, revealed, setRevealed };
}
