import { QueryClient, useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { api, ApiError } from '../api';

/**
 * Server state lives in memory only and is cleared at sign-out. Client errors are not retried;
 * neither are network failures while offline, since the offline banner already says so.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
    mutations: { retry: false },
  },
});

/** A GET keyed by its URL. Pass null to hold off until the URL is known. */
export function useApiQuery<T>(url: string | null, options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn' | 'enabled'> & { enabled?: boolean }) {
  return useQuery<T>({ ...options, queryKey: ['api', url], queryFn: () => api.get<T>(url!), enabled: url !== null && options?.enabled !== false });
}

/** Refetches every cached GET whose URL starts with one of these prefixes. */
export function invalidateApi(...prefixes: string[]) {
  return queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'api' && typeof q.queryKey[1] === 'string' && prefixes.some((p) => (q.queryKey[1] as string).startsWith(p)),
  });
}

export function useApiMutation<TData = unknown, TVars = void>(options: UseMutationOptions<TData, Error, TVars>) {
  return useMutation<TData, Error, TVars>(options);
}
