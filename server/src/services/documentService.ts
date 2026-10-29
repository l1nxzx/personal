import type { DocumentFile, Page, UpdateDocumentRequest } from '../../../shared/types.js';
import * as documents from '../data/documentRepo.js';
import * as folders from '../data/folderRepo.js';
import * as links from '../data/linkRepo.js';
import * as storage from '../data/storage.js';
import { notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { matchesAll, normalizeTags, queryTokens } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { isImage, processDocumentImage } from './imageService.js';
import { documentTerms as terms, ensureLibraryMigrated } from './libraryMigration.js';
import { recordAction } from './activityService.js';

/**
 * Shown inline in the browser. Everything else (including SVG and HTML) is download-only.
 * Audio and video can't run script, so they are safe to play on this origin.
 */
const INLINE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'text/plain',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
]);

export const toDocument = (r: documents.DocumentRecord): DocumentFile => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: r.size,
  folderId: r.folderId,
  tags: r.tags,
  favorite: r.favorite,
  hasThumb: !!r.thumbPath,
  previewable: INLINE.has(r.mime),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // Drop control characters (anything below U+0020, and DEL).
  const cleaned = [...base]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .trim()
    .slice(0, 200);
  return cleaned || 'file';
}

/** 404s unless `folderId` is null (top level) or an existing folder. */
export async function requireFolderOrRoot(uid: string, folderId: string | null): Promise<void> {
  if (folderId && !(await folders.get(uid, folderId))) {
    throw notFound('That folder no longer exists');
  }
}

export async function uploadDocument(
  ctx: Ctx,
  file: { buffer: Buffer; originalname: string; mimetype: string },
  opts: { folderId?: string | null },
): Promise<DocumentFile> {
  const folderId = opts.folderId || null;
  // Checked before anything is stored, so a bad target never leaves orphaned bytes.
  await requireFolderOrRoot(ctx.userId, folderId);

  const id = documents.newId(ctx.userId);
  const dir = `users/${ctx.userId}/documents/${id}`;
  let data = file.buffer;
  let mime = file.mimetype || 'application/octet-stream';
  let thumbPath: string | null = null;

  if (isImage(mime)) {
    const processed = await processDocumentImage(file.buffer, mime);
    data = processed.data;
    mime = processed.mime;
    thumbPath = `${dir}/thumb.webp`;
    await storage.uploadFile(thumbPath, processed.thumb, 'image/webp');
  }
  const storagePath = `${dir}/file`;
  await storage.uploadFile(storagePath, data, mime);

  const now = new Date().toISOString();
  const base = { name: cleanName(file.originalname), tags: [] as string[] };
  const record: documents.DocumentRecord = {
    id,
    ...base,
    folderId,
    mime,
    size: data.length,
    favorite: false,
    storagePath,
    thumbPath,
    createdAt: now,
    updatedAt: now,
    searchTerms: terms(base),
  };
  try {
    await documents.create(ctx.userId, record);
  } catch (err) {
    await Promise.all([
      storage.deleteFile(storagePath),
      thumbPath && storage.deleteFile(thumbPath),
    ]).catch((e) => logger.warn({ e }, 'orphan cleanup failed'));
    throw err;
  }
  notifyChange(ctx, 'document', id);
  await recordAction(ctx, 'document.uploaded', id);
  return toDocument(record);
}

export async function getDocument(ctx: Ctx, id: string): Promise<DocumentFile> {
  const r = await documents.get(ctx.userId, id);
  if (!r) throw notFound('This file no longer exists');
  return toDocument(r);
}

const newestFirst = (a: documents.DocumentRecord, b: documents.DocumentRecord) =>
  b.createdAt.localeCompare(a.createdAt);

/**
 * - `folderId`: everything directly in that folder (`root` = top level), unpaginated.
 * - `q`: files anywhere whose name or tags match every word.
 * - `favorite` / `tag`: those files, anywhere.
 * - nothing: every file, newest first, paginated ("Recent").
 */
export async function listDocuments(
  ctx: Ctx,
  opts: {
    folderId?: string;
    q?: string;
    favorite?: boolean;
    tag?: string;
    limit: number;
    cursor?: string;
  },
): Promise<Page<DocumentFile>> {
  const uid = ctx.userId;
  let records: documents.DocumentRecord[];
  if (opts.q !== undefined) {
    const tokens = queryTokens(opts.q);
    records = tokens.length
      ? (await documents.search(uid, tokens[0]!, 300)).filter((r) =>
          matchesAll(r.searchTerms, tokens),
        )
      : [];
  } else if (opts.folderId) {
    await ensureLibraryMigrated(uid);
    const folderId = opts.folderId === 'root' ? null : opts.folderId;
    await requireFolderOrRoot(uid, folderId);
    records = await documents.listWhere(uid, 'folderId', folderId);
  } else if (opts.favorite || opts.tag) {
    records = opts.favorite
      ? await documents.listWhere(uid, 'favorite', true)
      : await documents.listWhere(uid, 'tags', opts.tag!);
    records = records.filter(
      (r) => (!opts.favorite || r.favorite) && (!opts.tag || r.tags.includes(opts.tag)),
    );
  } else {
    const page = await documents.list(uid, opts.limit, opts.cursor);
    return { items: page.items.map(toDocument), nextCursor: page.nextCursor };
  }
  return { items: records.sort(newestFirst).map(toDocument), nextCursor: null };
}

export async function updateDocument(
  ctx: Ctx,
  id: string,
  input: UpdateDocumentRequest,
): Promise<DocumentFile> {
  const current = await documents.get(ctx.userId, id);
  if (!current) throw notFound('This file no longer exists');
  if (input.folderId !== undefined) await requireFolderOrRoot(ctx.userId, input.folderId);
  const next = {
    name: input.name !== undefined ? cleanName(input.name) : current.name,
    folderId: input.folderId !== undefined ? input.folderId : current.folderId,
    tags: input.tags ? normalizeTags(input.tags) : current.tags,
    favorite: input.favorite ?? current.favorite,
  };
  const saved = await documents.update(ctx.userId, id, {
    ...next,
    updatedAt: new Date().toISOString(),
    searchTerms: terms(next),
  });
  if (!saved) throw notFound('This file no longer exists');
  notifyChange(ctx, 'document', id);
  // Renamed, moved, starred or tagged.
  if (
    next.name !== current.name ||
    next.folderId !== current.folderId ||
    next.favorite !== current.favorite ||
    next.tags.join() !== current.tags.join()
  )
    await recordAction(ctx, 'document.organized', id);
  return toDocument(saved);
}

/**
 * Deletes one file: its record, stored bytes and links. Returns false if it was already gone.
 * The record goes first, so a storage hiccup can leave orphaned bytes but never a broken file.
 */
export async function removeStoredDocument(uid: string, id: string): Promise<boolean> {
  const removed = await documents.remove(uid, id);
  if (!removed) return false;
  await Promise.all([
    storage.deleteFile(removed.storagePath),
    removed.thumbPath ? storage.deleteFile(removed.thumbPath) : null,
    links.removeAllFor(uid, `document:${id}`),
  ]);
  return true;
}

export async function deleteDocument(ctx: Ctx, id: string): Promise<void> {
  if (!(await removeStoredDocument(ctx.userId, id))) throw notFound('This file no longer exists');
  notifyChange(ctx, 'document', id);
}

/** Opens the stored bytes (or the thumbnail) along with how the browser should treat them. */
export async function openDocument(
  ctx: Ctx,
  id: string,
  which: 'file' | 'thumb',
  range?: { start: number; end?: number },
): Promise<storage.StoredFile & { mime: string; name: string; inline: boolean }> {
  const r = await documents.get(ctx.userId, id);
  const path = which === 'thumb' ? r?.thumbPath : r?.storagePath;
  if (!r || !path) throw notFound('This file no longer exists');
  const found = await storage.openFile(path, range);
  if (!found) throw notFound('This file is missing from storage');
  const mime = which === 'thumb' ? 'image/webp' : r.mime;
  return { ...found, mime, name: r.name, inline: INLINE.has(mime) };
}
