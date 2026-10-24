import type { EntryKind } from '../../../shared/types';

/** TanStack Query keys, in one place so invalidation stays consistent. */
export const keys = {
  home: ['home'] as const,
  prefs: ['prefs'] as const,
  inbox: ['inbox'] as const,
  entries: (kind: EntryKind) => ['entries', kind] as const,
  entryList: (kind: EntryKind, filters: object) => ['entries', kind, 'list', filters] as const,
  entryTags: (kind: EntryKind) => ['entries', kind, 'tags'] as const,
  entry: (kind: EntryKind, id: string) => ['entry', kind, id] as const,
  tasks: ['tasks'] as const,
  openTasks: ['tasks', 'open'] as const,
  doneTasks: ['tasks', 'done'] as const,
  search: (q: string) => ['search', q] as const,
  profile: ['profile'] as const,
};
