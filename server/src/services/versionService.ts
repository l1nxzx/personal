import type {
  EntryKind,
  EntryVersion,
  EntryVersionSummary,
  SealedBox,
} from '../../../shared/types.js';
import * as entries from '../data/entryRepo.js';
import * as versions from '../data/versionRepo.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { Ctx } from './context.js';

const toSummary = (v: versions.VersionRecord): EntryVersionSummary => ({
  id: v.id,
  entryId: v.entryId,
  kind: v.kind,
  title: v.title,
  wordCount: v.wordCount,
  savedAt: v.savedAt,
  label: v.label,
});

/** Earlier versions of an entry, newest first. */
export async function listVersions(
  ctx: Ctx,
  kind: EntryKind,
  entryId: string,
): Promise<EntryVersionSummary[]> {
  if (!(await entries.get(ctx.userId, kind, entryId)))
    throw notFound('This entry no longer exists');
  return (await versions.listFor(ctx.userId, entryId))
    .filter((v) => v.kind === kind)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map(toSummary);
}

export async function getVersion(ctx: Ctx, id: string): Promise<EntryVersion> {
  const v = await versions.get(ctx.userId, id);
  if (!v) throw notFound('This version no longer exists');
  return { ...toSummary(v), body: v.body, tags: v.tags, sealed: v.sealed };
}

/** "Keep this version": stores the entry as it is now, with an optional label. */
export async function saveVersion(
  ctx: Ctx,
  kind: EntryKind,
  entryId: string,
  label: string | null,
  sealed?: SealedBox,
): Promise<EntryVersionSummary> {
  const entry = await entries.get(ctx.userId, kind, entryId);
  if (!entry) throw notFound('This entry no longer exists');
  const clean = label?.trim() || null;
  // A locked entry's version carries its text and label only encrypted (sent by the browser).
  if (entry.locked && (clean || !sealed))
    throw badRequest('This entry is locked: its versions are saved encrypted, label included');
  if (!entry.locked && sealed) throw badRequest('This entry is not locked');
  const id = await versions.add(ctx.userId, kind, entry, clean, sealed);
  return {
    id,
    entryId,
    kind,
    title: entry.title,
    wordCount: entry.wordCount,
    savedAt: entry.updatedAt,
    label: clean,
  };
}
