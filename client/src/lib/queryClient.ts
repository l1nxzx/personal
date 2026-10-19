import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiFetch';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      // Don't retry client errors (401/403/404/validation); retry network/5xx twice.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});
