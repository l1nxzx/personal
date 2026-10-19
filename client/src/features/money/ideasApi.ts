import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMoneyIdeaRequest,
  MoneyIdea,
  MoneyIdeaSummary,
  Project,
  UpdateMoneyIdeaRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export function useMoneyIdeas(archived: boolean) {
  return useQuery({
    queryKey: ['moneyIdeas', 'list', archived],
    queryFn: async () =>
      (await apiFetch<{ items: MoneyIdeaSummary[] }>('/money-ideas', { query: { archived } }))
        .items,
  });
}

export function useMoneyIdea(id: string) {
  return useQuery({
    queryKey: ['moneyIdea', id],
    queryFn: async () => (await apiFetch<{ idea: MoneyIdea }>(`/money-ideas/${id}`)).idea,
  });
}

export function useCreateMoneyIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMoneyIdeaRequest) =>
      (await apiFetch<{ idea: MoneyIdea }>('/money-ideas', { method: 'POST', body: input })).idea,
    onSuccess: (idea) => {
      qc.setQueryData(['moneyIdea', idea.id], idea);
      void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
    },
  });
}

/** Optimistic: the page reflects edits at once and rolls back if saving fails. */
export function useUpdateMoneyIdea(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateMoneyIdeaRequest) =>
      (await apiFetch<{ idea: MoneyIdea }>(`/money-ideas/${id}`, { method: 'PATCH', body: patch }))
        .idea,
    onMutate: (patch) => {
      const previous = qc.getQueryData<MoneyIdea>(['moneyIdea', id]);
      if (previous) qc.setQueryData(['moneyIdea', id], { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(['moneyIdea', id], ctx.previous),
    onSuccess: (idea) => {
      qc.setQueryData(['moneyIdea', id], idea);
      void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
      void qc.invalidateQueries({ queryKey: ['links'] });
    },
  });
}

/** Status changes straight from the list. */
export function useSetIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMoneyIdeaRequest }) =>
      apiFetch<{ idea: MoneyIdea }>(`/money-ideas/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: ({ idea }) => {
      qc.setQueryData(['moneyIdea', idea.id], idea);
      void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
    },
  });
}

export function useDeleteMoneyIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/money-ideas/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['moneyIdea', id] });
      void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
    },
  });
}

export function useIdeaToProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ idea: MoneyIdea; project: Project }>(`/money-ideas/${id}/project`, {
        method: 'POST',
      }),
    onSuccess: ({ idea }) => {
      qc.setQueryData(['moneyIdea', id], idea);
      void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['links'] });
    },
  });
}

export const STATUS: { value: MoneyIdea['status']; label: string; hint: string }[] = [
  { value: 'idea', label: 'Idea', hint: 'A possibility, not tried yet' },
  { value: 'testing', label: 'Testing', hint: 'Trying it out in small, cheap ways' },
  { value: 'running', label: 'Running', hint: 'Working and earning' },
  { value: 'dropped', label: 'Dropped', hint: 'Stopped. What you learned is kept' },
];
