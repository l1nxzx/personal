import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HomeData, Prefs, SearchResult } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { today } from '../../lib/dates';
import { keys } from '../../lib/keys';

export function useHome() {
  return useQuery({
    queryKey: keys.home,
    // The device's date, so "On this day" follows the owner's time zone.
    queryFn: () => apiFetch<HomeData>('/me/home', { query: { date: today() } }),
  });
}

export function usePrefs() {
  return useQuery({
    queryKey: keys.prefs,
    queryFn: async () => (await apiFetch<{ prefs: Prefs }>('/me/prefs')).prefs,
    staleTime: 10 * 60_000,
  });
}

/** Optimistic preference update. */
export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Prefs>) =>
      (await apiFetch<{ prefs: Prefs }>('/me/prefs', { method: 'PATCH', body: patch })).prefs,
    onMutate: (patch) => {
      const previous = qc.getQueryData<Prefs>(keys.prefs);
      if (previous) qc.setQueryData(keys.prefs, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(keys.prefs, ctx.previous),
    onSuccess: (prefs) => qc.setQueryData(keys.prefs, prefs),
  });
}

export function useSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: keys.search(query),
    queryFn: async ({ signal }) =>
      (await apiFetch<{ items: SearchResult[] }>('/me/search', { query: { q: query }, signal }))
        .items,
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
