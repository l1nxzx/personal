import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileStats } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { keys } from '../../lib/keys';

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: async () => (await apiFetch<{ profile: ProfileStats }>('/me/profile')).profile,
  });
}

/** Recounts every item's text and rebuilds the time totals from the daily records. */
export function useRecount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiFetch<{ profile: ProfileStats }>('/me/profile/recount', { method: 'POST' }))
        .profile,
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}
