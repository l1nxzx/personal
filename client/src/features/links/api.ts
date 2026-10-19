import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinkedItem, Ref } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export const linksKey = (ref: Ref) => ['links', ref.type, ref.id] as const;

export function useLinks(ref: Ref | null) {
  return useQuery({
    queryKey: ref ? linksKey(ref) : ['links', 'none'],
    queryFn: async () =>
      (
        await apiFetch<{ items: LinkedItem[] }>('/links', {
          query: { type: ref!.type, id: ref!.id },
        })
      ).items,
    enabled: !!ref,
  });
}

/** Both sides show the link, so every link list is refreshed after a change. */
export function useLinkMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['links'] });
  const add = useMutation({
    mutationFn: (pair: { from: Ref; to: Ref }) =>
      apiFetch('/links', { method: 'POST', body: pair }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (pair: { from: Ref; to: Ref }) =>
      apiFetch('/links/remove', { method: 'POST', body: pair }),
    onMutate: ({ from, to }) => {
      // Optimistic: drop the row from this item's list right away.
      qc.setQueryData<LinkedItem[]>(linksKey(from), (list) =>
        list?.filter((l) => !(l.ref.type === to.type && l.ref.id === to.id)),
      );
    },
    onSettled: refresh,
  });
  return { add, remove };
}
