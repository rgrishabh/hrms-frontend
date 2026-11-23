import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from './ErrorState';
import { SkeletonRows } from './Skeleton';

export interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  /** Rendered once data exists. `data` is never null here, which is the point of this component. */
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  /** Decide whether loaded data counts as empty, and what to show. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  compact?: boolean;
}

/**
 * The one way to go from a query to the screen: loading, failed, empty or loaded, exactly one of them.
 * A background refetch keeps showing the current data, so lists do not flash or lose their scroll.
 */
export function QueryState<T>({ query, children, loading, isEmpty, empty, compact }: QueryStateProps<T>) {
  if (query.isPending) return <>{loading ?? <SkeletonRows />}</>;
  if (query.isError && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={compact} />;
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
