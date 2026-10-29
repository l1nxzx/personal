import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileStats, UsageRange } from '../../../../shared/types';
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

/** Recorded time and actions per day from `from` to `to` (local dates). */
export function useUsage(from: string, to: string) {
  return useQuery({
    queryKey: [...keys.profile, 'usage', from, to],
    queryFn: async () =>
      (await apiFetch<{ usage: UsageRange }>('/me/usage', { query: { from, to } })).usage,
    // Moving to another day keeps the previous figures on screen while the new ones load.
    placeholderData: (previous) => previous,
  });
}
