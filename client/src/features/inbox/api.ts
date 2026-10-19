import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Capture,
  CaptureRequest,
  CaptureResult,
  ConvertCaptureRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { keys } from '../../lib/keys';

export function useInbox() {
  return useQuery({
    queryKey: keys.inbox,
    queryFn: async () => (await apiFetch<{ items: Capture[] }>('/inbox')).items,
  });
}

/** Refreshes whatever a capture or conversion may have changed. */
function useAfterFiling() {
  const qc = useQueryClient();
  return (result: CaptureResult) => {
    void qc.invalidateQueries({ queryKey: keys.inbox });
    void qc.invalidateQueries({ queryKey: keys.home });
    if (result.destination === 'task') void qc.invalidateQueries({ queryKey: keys.openTasks });
    if (result.destination === 'journal' || result.destination === 'writing') {
      void qc.invalidateQueries({ queryKey: keys.entries(result.destination) });
      void qc.invalidateQueries({ queryKey: keys.entry(result.destination, result.id) });
    }
  };
}

export function useCapture() {
  const after = useAfterFiling();
  return useMutation({
    mutationFn: (input: CaptureRequest) =>
      apiFetch<CaptureResult>('/inbox/capture', { method: 'POST', body: input }),
    onSuccess: after,
  });
}

export function useConvertCapture() {
  const after = useAfterFiling();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ConvertCaptureRequest & { id: string }) =>
      apiFetch<CaptureResult>(`/inbox/${id}/convert`, { method: 'POST', body: input }),
    onMutate: ({ id }) => {
      const previous = qc.getQueryData<Capture[]>(keys.inbox);
      qc.setQueryData<Capture[]>(keys.inbox, (list) => list?.filter((c) => c.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.inbox, ctx?.previous),
    onSuccess: after,
  });
}

export function useDeleteCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/inbox/${id}`, { method: 'DELETE' }),
    onMutate: (id) => {
      const previous = qc.getQueryData<Capture[]>(keys.inbox);
      qc.setQueryData<Capture[]>(keys.inbox, (list) => list?.filter((c) => c.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.inbox, ctx?.previous),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.home }),
  });
}
