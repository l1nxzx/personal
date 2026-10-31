import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiFetch';
import { PERSIST_MAX_AGE } from './queryPersist';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // As long as the copy kept on the device (lib/queryPersist.ts), so it survives restarts.
      gcTime: PERSIST_MAX_AGE,
      refetchOnWindowFocus: true,
      // Don't retry client errors (401/403/404/validation); retry network/5xx twice.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});
