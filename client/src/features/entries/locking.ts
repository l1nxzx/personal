import type {
  Entry,
  EntryKind,
  EntryVersion,
  EntryVersionSummary,
  LockEntryRequest,
  UnlockEntryRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { ENTRY_API } from '../../lib/routes';
import type { useEntryLock } from './EntryLockContext';
import { anchorKeysOf, type Fields } from './useEntryEditor';

type Lock = ReturnType<typeof useEntryLock>;

export const countWords = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

/** The readable form of a locked entry (unchanged if it isn't locked). */
export async function openEntry(lock: Lock, entry: Entry): Promise<Entry> {
  if (!entry.locked || !entry.sealed) return entry;
  const c = await lock.open(entry.sealed);
  return { ...entry, body: c.body, tags: c.tags, wordCount: c.wordCount };
}

/** The readable form of a version (sealed ones belong to a locked entry's history). */
export async function openVersion(lock: Lock, v: EntryVersion): Promise<EntryVersion> {
  if (!v.sealed) return v;
  const c = await lock.open(v.sealed);
  return { ...v, body: c.body, tags: c.tags, wordCount: c.wordCount };
}

export async function sealFields(lock: Lock, f: Fields) {
  return {
    sealed: await lock.seal({ body: f.body, tags: f.tags, wordCount: countWords(f.body) }),
    anchors: anchorKeysOf(f.body),
  };
}

async function allVersions(kind: EntryKind, id: string): Promise<EntryVersion[]> {
  const list = (
    await apiFetch<{ items: EntryVersionSummary[] }>(`${ENTRY_API[kind]}/${id}/versions`)
  ).items;
  const out: EntryVersion[] = [];
  // A few at a time: histories can be long.
  for (let i = 0; i < list.length; i += 6) {
    const chunk = await Promise.all(
      list
        .slice(i, i + 6)
        .map(async (v) => (await apiFetch<{ version: EntryVersion }>(`/versions/${v.id}`)).version),
    );
    out.push(...chunk);
  }
  return out;
}

/**
 * Locks an existing entry: the text on screen (saved or not) and every earlier version are
 * encrypted here and replace the readable copies on the server in one request.
 */
export async function lockExisting(
  lock: Lock,
  kind: EntryKind,
  id: string,
  rev: number,
  fields: Fields,
): Promise<Entry> {
  const versions = (await allVersions(kind, id)).filter((v) => !v.sealed);
  const body: LockEntryRequest = {
    rev,
    ...(await sealFields(lock, fields)),
    versions: await Promise.all(
      versions.map(async (v) => ({
        id: v.id,
        sealed: await lock.seal({ body: v.body, tags: v.tags, wordCount: v.wordCount }),
      })),
    ),
  };
  return (
    await apiFetch<{ entry: Entry }>(`${ENTRY_API[kind]}/${id}/lock`, { method: 'POST', body })
  ).entry;
}

/** Removes the lock: the text and every earlier version are decrypted here and sent readable. */
export async function unlockExisting(
  lock: Lock,
  kind: EntryKind,
  id: string,
  rev: number,
  fields: Fields,
): Promise<Entry> {
  const versions = (await allVersions(kind, id)).filter((v) => v.sealed);
  const body: UnlockEntryRequest = {
    rev,
    body: fields.body,
    tags: fields.tags,
    versions: await Promise.all(
      versions.map(async (v) => {
        const open = await openVersion(lock, v);
        return { id: v.id, body: open.body, tags: open.tags };
      }),
    ),
  };
  return (
    await apiFetch<{ entry: Entry }>(`${ENTRY_API[kind]}/${id}/unlock`, { method: 'POST', body })
  ).entry;
}
