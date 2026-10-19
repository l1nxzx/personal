import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateIncomeRequest,
  IncomeEntry,
  IncomeSummary,
  Page,
  UpdateIncomeRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export function useIncomeSummary() {
  return useQuery({
    queryKey: ['income', 'summary'],
    queryFn: async () => (await apiFetch<{ summary: IncomeSummary }>('/income/summary')).summary,
  });
}

export function useIncomeList(month?: string) {
  return useInfiniteQuery({
    queryKey: ['income', 'list', month ?? 'all'],
    queryFn: ({ pageParam }) =>
      apiFetch<Page<IncomeEntry>>('/income', { query: { limit: 50, cursor: pageParam, month } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useRefreshIncome() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['income'] });
}

export function useAddIncome() {
  const refresh = useRefreshIncome();
  return useMutation({
    mutationFn: async (input: CreateIncomeRequest) =>
      (await apiFetch<{ entry: IncomeEntry }>('/income', { method: 'POST', body: input })).entry,
    onSuccess: refresh,
  });
}

export function useUpdateIncome() {
  const refresh = useRefreshIncome();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateIncomeRequest }) =>
      (await apiFetch<{ entry: IncomeEntry }>(`/income/${id}`, { method: 'PATCH', body: patch }))
        .entry,
    onSuccess: refresh,
  });
}

export function useDeleteIncome() {
  const refresh = useRefreshIncome();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/income/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}
