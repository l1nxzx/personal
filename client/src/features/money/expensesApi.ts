import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateExpenseRequest,
  CreateSubscriptionRequest,
  Expense,
  ExpenseSummary,
  Page,
  Subscription,
  UpdateExpenseRequest,
  UpdateSubscriptionRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export function useExpenseSummary() {
  return useQuery({
    queryKey: ['expenses', 'summary'],
    queryFn: async () => (await apiFetch<{ summary: ExpenseSummary }>('/expenses/summary')).summary,
  });
}

export function useExpenseList() {
  return useInfiniteQuery({
    queryKey: ['expenses', 'list'],
    queryFn: ({ pageParam }) =>
      apiFetch<Page<Expense>>('/expenses', { query: { limit: 50, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Real, recorded costs connected to one idea or project. */
export function useExpensesFor(filter: { moneyIdeaId?: string; projectId?: string }) {
  return useQuery({
    queryKey: ['expenses', 'for', filter],
    queryFn: async () => (await apiFetch<Page<Expense>>('/expenses', { query: filter })).items,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['expenses'] });
    void qc.invalidateQueries({ queryKey: ['subscriptions'] });
  };
}

export function useAddExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: CreateExpenseRequest) =>
      (await apiFetch<{ expense: Expense }>('/expenses', { method: 'POST', body: input })).expense,
    onSuccess: refresh,
  });
}

export function useUpdateExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateExpenseRequest }) =>
      (await apiFetch<{ expense: Expense }>(`/expenses/${id}`, { method: 'PATCH', body: patch }))
        .expense,
    onSuccess: refresh,
  });
}

export function useDeleteExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => (await apiFetch<{ items: Subscription[] }>('/subscriptions')).items,
  });
}

export function useSubscriptionMutations() {
  const refresh = useRefresh();
  const add = useMutation({
    mutationFn: async (input: CreateSubscriptionRequest) =>
      (
        await apiFetch<{ subscription: Subscription }>('/subscriptions', {
          method: 'POST',
          body: input,
        })
      ).subscription,
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateSubscriptionRequest }) =>
      (
        await apiFetch<{ subscription: Subscription }>(`/subscriptions/${id}`, {
          method: 'PATCH',
          body: patch,
        })
      ).subscription,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const pay = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      apiFetch<{ expense: Expense; subscription: Subscription }>(`/subscriptions/${id}/payments`, {
        method: 'POST',
        body: { date },
      }),
    onSuccess: refresh,
  });
  return { add, update, remove, pay };
}

/** Approximate monthly cost of a recurring payment (a projection, not a record). */
export function monthlyEquivalent(s: Pick<Subscription, 'amountMinor' | 'frequency'>): number {
  const perYear = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[s.frequency];
  return Math.round((s.amountMinor * perYear) / 12);
}

export const FREQUENCY_LABEL: Record<Subscription['frequency'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};
