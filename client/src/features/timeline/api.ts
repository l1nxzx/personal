import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMomentRequest, Moment, UpdateMomentRequest } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export function useMoments() {
  return useQuery({
    queryKey: ['moments'],
    queryFn: async () => (await apiFetch<{ items: Moment[] }>('/moments')).items,
  });
}

export function useMomentMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['moments'] });
  const add = useMutation({
    mutationFn: async (input: CreateMomentRequest) =>
      (await apiFetch<{ moment: Moment }>('/moments', { method: 'POST', body: input })).moment,
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateMomentRequest }) =>
      (await apiFetch<{ moment: Moment }>(`/moments/${id}`, { method: 'PATCH', body: patch }))
        .moment,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/moments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { add, update, remove };
}
