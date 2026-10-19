import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEntryRequest,
  Entry,
  EntryKind,
  EntryMeta,
  EntrySummary,
  NoteType,
  Page,
  TagCount,
  TopicCount,
  UpdateEntryRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { keys } from '../../lib/keys';
import { ENTRY_API } from '../../lib/routes';

export interface JournalFilters {
  tag?: string;
  from?: string;
  to?: string;
}

export function useJournalList(filters: JournalFilters) {
  return useInfiniteQuery({
    queryKey: keys.entryList('journal', filters),
    queryFn: ({ pageParam }) =>
      apiFetch<Page<EntrySummary>>('/journal', {
        query: { limit: 30, cursor: pageParam, ...filters },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useWritingList(filters: { archived: boolean; tag?: string }) {
  return useQuery({
    queryKey: keys.entryList('writing', filters),
    queryFn: async () =>
      (
        await apiFetch<{ items: EntrySummary[] }>('/writing', {
          query: { archived: filters.archived, tag: filters.tag },
        })
      ).items,
  });
}

export interface NoteFilters {
  topic?: string;
  type?: NoteType;
  tag?: string;
}

export function useNoteList(filters: NoteFilters) {
  return useInfiniteQuery({
    queryKey: keys.entryList('note', filters),
    queryFn: ({ pageParam }) =>
      apiFetch<Page<EntrySummary>>('/notes', {
        query: { limit: 40, cursor: pageParam, ...filters },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ['entries', 'note', 'topics'],
    queryFn: async () => (await apiFetch<{ items: TopicCount[] }>('/notes/topics')).items,
    staleTime: 5 * 60_000,
  });
}

export function useTags(kind: EntryKind) {
  return useQuery({
    queryKey: keys.entryTags(kind),
    queryFn: async () => (await apiFetch<{ items: TagCount[] }>(`${ENTRY_API[kind]}/tags`)).items,
    staleTime: 5 * 60_000,
  });
}

export function useEntry(kind: EntryKind, id: string | null) {
  return useQuery({
    queryKey: keys.entry(kind, id ?? 'new'),
    queryFn: async () => (await apiFetch<{ entry: Entry }>(`${ENTRY_API[kind]}/${id}`)).entry,
    enabled: !!id,
    // The editor owns the text while open; only refetch on explicit invalidation.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export async function createEntry(kind: EntryKind, input: CreateEntryRequest): Promise<Entry> {
  return (await apiFetch<{ entry: Entry }>(ENTRY_API[kind], { method: 'POST', body: input })).entry;
}

export async function patchEntry(
  kind: EntryKind,
  id: string,
  input: UpdateEntryRequest,
): Promise<EntryMeta> {
  return (
    await apiFetch<{ entry: EntryMeta }>(`${ENTRY_API[kind]}/${id}`, {
      method: 'PATCH',
      body: input,
    })
  ).entry;
}

/** Lists, tags and home all show entry summaries; refresh them after any change. */
export function useInvalidateEntryLists() {
  const qc = useQueryClient();
  return (kind: EntryKind) => {
    void qc.invalidateQueries({ queryKey: keys.entries(kind) });
    void qc.invalidateQueries({ queryKey: keys.home });
  };
}

/**
 * Changes that don't touch the text: pin/archive, and a note's type, topic, sources and
 * perspectives. They don't bump `rev`, so an open editor never sees them as a conflict.
 */
export function usePatchEntryMeta(kind: EntryKind) {
  const invalidate = useInvalidateEntryLists();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Omit<UpdateEntryRequest, 'rev' | 'title' | 'body' | 'date' | 'tags'>;
    }) => patchEntry(kind, id, patch),
    onSuccess: (meta) => {
      qc.setQueryData<Entry>(keys.entry(kind, meta.id), (e) => (e ? { ...e, ...meta } : e));
      invalidate(kind);
    },
  });
}

/** Pin / archive from a list, without opening the editor. */
export function useSetEntryFlags(kind: EntryKind) {
  const patch = usePatchEntryMeta(kind);
  return {
    ...patch,
    mutate: (
      v: { id: string; flags: { pinned?: boolean; archived?: boolean } },
      opts?: Parameters<typeof patch.mutate>[1],
    ) => patch.mutate({ id: v.id, patch: v.flags }, opts),
  };
}

export function useDeleteEntry(kind: EntryKind) {
  const invalidate = useInvalidateEntryLists();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`${ENTRY_API[kind]}/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: keys.entry(kind, id) });
      invalidate(kind);
    },
  });
}
