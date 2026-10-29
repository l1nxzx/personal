import type { DocumentFile, DocumentFolder } from '../../../../shared/types';
import { fileKind } from './api';

export interface FolderTree {
  byId: Map<string, DocumentFolder>;
  /** Direct subfolders of `id` (null = top level), sorted by name. */
  children: (id: string | null) => DocumentFolder[];
  /** From the top level down to `id` (empty for the top level or an unknown id). */
  path: (id: string | null) => DocumentFolder[];
  /** True if `id` is `ancestorId` or sits anywhere below it. */
  isWithin: (id: string | null, ancestorId: string) => boolean;
}

export const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function buildTree(folders: DocumentFolder[]): FolderTree {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const kids = new Map<string | null, DocumentFolder[]>();
  for (const f of folders) {
    // A folder whose parent is gone (shouldn't happen) is shown at the top level.
    const parent = f.parentId && byId.has(f.parentId) ? f.parentId : null;
    kids.set(parent, [...(kids.get(parent) ?? []), f]);
  }
  for (const list of kids.values()) list.sort((a, b) => byName(a.name, b.name));

  const path = (id: string | null) => {
    const out: DocumentFolder[] = [];
    for (let at = id ? byId.get(id) : undefined; at && out.length < 64;) {
      out.unshift(at);
      at = at.parentId ? byId.get(at.parentId) : undefined;
    }
    return out;
  };
  return {
    byId,
    children: (id) => kids.get(id) ?? [],
    path,
    isWithin: (id, ancestorId) => path(id).some((f) => f.id === ancestorId),
  };
}

/** "Taxes / 2025": where something lives, for search results and the details panel. */
export function locationLabel(tree: FolderTree, folderId: string | null): string {
  const names = tree.path(folderId).map((f) => f.name);
  return names.length ? names.join(' / ') : 'My files';
}

// ---------------------------------------------------------------- sorting

export type SortKey = 'name' | 'added' | 'type' | 'size';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export const SORT_LABEL: Record<SortKey, string> = {
  name: 'Name',
  added: 'Date added',
  type: 'Type',
  size: 'Size',
};

/** Sensible first direction per column: A to Z, newest first, biggest first. */
export const defaultDir = (key: SortKey): Sort['dir'] =>
  key === 'added' || key === 'size' ? 'desc' : 'asc';

export function sortFiles(files: DocumentFile[], sort: Sort): DocumentFile[] {
  const cmp: Record<SortKey, (a: DocumentFile, b: DocumentFile) => number> = {
    name: (a, b) => byName(a.name, b.name),
    added: (a, b) => a.createdAt.localeCompare(b.createdAt),
    type: (a, b) => byName(fileKind(a.mime, a.name), fileKind(b.mime, b.name)),
    size: (a, b) => a.size - b.size,
  };
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => sign * cmp[sort.key](a, b) || byName(a.name, b.name));
}

/** Folders always come first; they sort by name, or by date when sorting by date. */
export function sortFolders(folders: DocumentFolder[], sort: Sort): DocumentFolder[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...folders].sort((a, b) => {
    if (sort.key === 'added') return sign * a.createdAt.localeCompare(b.createdAt);
    if (sort.key === 'name') return sign * byName(a.name, b.name);
    return byName(a.name, b.name);
  });
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Folder names containing every word of `q` (case and accents ignored). */
export function matchFolders(folders: DocumentFolder[], q: string): DocumentFolder[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return folders.filter((f) => words.every((w) => norm(f.name).includes(w)));
}

// ---------------------------------------------------------------- selection

/** Selection keys: `d:<id>` for folders (directories), `f:<id>` for files. */
export type ItemKey = `d:${string}` | `f:${string}`;
export const folderItemKey = (id: string): ItemKey => `d:${id}`;
export const fileItemKey = (id: string): ItemKey => `f:${id}`;

export function splitKeys(keys: Iterable<ItemKey>) {
  const fileIds: string[] = [];
  const folderIds: string[] = [];
  for (const k of keys) (k.startsWith('d:') ? folderIds : fileIds).push(k.slice(2));
  return { fileIds, folderIds };
}
