import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiniappSettings, MiniappState } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { MINIAPPS } from './registry';
import type { MiniappDefinition } from './sdk/types';

export const STATE_KEY = ['miniapps', 'state'] as const;

export function useMiniappState(enabled = true) {
  return useQuery({
    enabled,
    queryKey: STATE_KEY,
    queryFn: async () => (await apiFetch<{ state: MiniappState }>('/miniapps')).state,
    staleTime: 60_000,
  });
}

/** Enabled apps that exist in this build, in the screen's order. */
export function enabledApps(state: MiniappState | undefined): MiniappDefinition[] {
  if (!state) return [];
  const enabled = MINIAPPS.filter((m) => state.apps[m.id]?.enabled);
  const rank = (id: string) => {
    const i = state.settings.order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return enabled.sort((a, b) => rank(a.id) - rank(b.id));
}

export function useSetInstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { enabled?: boolean; onHome?: boolean } }) =>
      apiFetch<{ state: MiniappState }>(`/miniapps/apps/${id}`, { method: 'PUT', body: patch }),
    onSuccess: ({ state }) => qc.setQueryData(STATE_KEY, state),
  });
}

export function useDeleteData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/miniapps/apps/${id}/data`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: ['miniapps', 'data', id] });
      void qc.invalidateQueries({ queryKey: STATE_KEY });
    },
  });
}

export function useSetWallpaper() {
  const qc = useQueryClient();
  const apply = (settings: MiniappSettings) =>
    qc.setQueryData<MiniappState>(STATE_KEY, (s) => (s ? { ...s, settings } : s));
  const template = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ settings: MiniappSettings }>('/miniapps/wallpaper', {
        method: 'PUT',
        body: { template: id },
      }),
    onSuccess: ({ settings }) => apply(settings),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('image', file);
      return apiFetch<{ settings: MiniappSettings }>('/miniapps/wallpaper', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: ({ settings }) => apply(settings),
  });
  return { template, upload };
}

/** Saves the screen's arrangement (and folders, when given); the screen shows it at once. */
export function useSetLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { layout: string[]; folders?: MiniappSettings['folders'] }) =>
      apiFetch<{ state: MiniappState }>('/miniapps/layout', { method: 'PUT', body: v }),
    onMutate: async ({ layout, folders }) => {
      await qc.cancelQueries({ queryKey: STATE_KEY });
      const before = qc.getQueryData<MiniappState>(STATE_KEY);
      qc.setQueryData<MiniappState>(STATE_KEY, (s) =>
        s
          ? { ...s, settings: { ...s.settings, layout, folders: folders ?? s.settings.folders } }
          : s,
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(STATE_KEY, ctx.before);
    },
    onSuccess: ({ state }) => qc.setQueryData(STATE_KEY, state),
  });
}
