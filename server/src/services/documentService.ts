import type { Readable } from 'node:stream';
import type {
  DocumentFile,
  FolderCount,
  Page,
  UpdateDocumentRequest,
} from '../../../shared/types.js';
import * as documents from '../data/documentRepo.js';
import * as links from '../data/linkRepo.js';
import * as storage from '../data/storage.js';
import { notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildSearchTerms, normalizeTags } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { isImage, processDocumentImage } from './imageService.js';

/** Shown inline in the browser. Everything else (including SVG and HTML) is download-only. */
const INLINE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'text/plain',
]);

export const toDocument = (r: documents.DocumentRecord): DocumentFile => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: r.size,
  folder: r.folder,
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

export const cleanFolder = (f: string | null | undefined) =>
  f?.trim().replace(/\s+/g, ' ').slice(0, 60) || null;

const terms = (d: Pick<documents.DocumentRecord, 'name' | 'folder' | 'tags'>) =>
  buildSearchTerms(d.name.replace(/[._-]+/g, ' '), d.folder ?? '', d.tags.join(' '));

export async function uploadDocument(
  ctx: Ctx,
  file: { buffer: Buffer; originalname: string; mimetype: string },
  opts: { folder?: string | null },
): Promise<DocumentFile> {
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
  const base = {
    name: cleanName(file.originalname),
    folder: cleanFolder(opts.folder),
    tags: [] as string[],
  };
  const record: documents.DocumentRecord = {
    id,
    ...base,
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
  return toDocument(record);
}

export async function getDocument(ctx: Ctx, id: string): Promise<DocumentFile> {
  const r = await documents.get(ctx.userId, id);
  if (!r) throw notFound('This file no longer exists');
  return toDocument(r);
}

export async function listDocuments(
  ctx: Ctx,
  opts: { folder?: string; favorite?: boolean; tag?: string; limit: number; cursor?: string },
): Promise<Page<DocumentFile>> {
  const folder = cleanFolder(opts.folder);
  if (!folder && !opts.favorite && !opts.tag) {
    const page = await documents.list(ctx.userId, opts.limit, opts.cursor);
    return { items: page.items.map(toDocument), nextCursor: page.nextCursor };
  }
  const records = folder
    ? await documents.listWhere(ctx.userId, 'folder', folder)
    : opts.favorite
      ? await documents.listWhere(ctx.userId, 'favorite', true)
      : await documents.listWhere(ctx.userId, 'tags', opts.tag!);
  const items = records
    .filter((r) => (!opts.favorite || r.favorite) && (!opts.tag || r.tags.includes(opts.tag)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toDocument);
  return { items, nextCursor: null };
}

export async function listFolders(ctx: Ctx): Promise<FolderCount[]> {
  return Object.entries(await documents.folderCounts(ctx.userId))
    .filter(([, n]) => n > 0)
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

export async function updateDocument(
  ctx: Ctx,
  id: string,
  input: UpdateDocumentRequest,
): Promise<DocumentFile> {
  const current = await documents.get(ctx.userId, id);
  if (!current) throw notFound('This file no longer exists');
  const next = {
    name: input.name !== undefined ? cleanName(input.name) : current.name,
    folder: input.folder !== undefined ? cleanFolder(input.folder) : current.folder,
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
  return toDocument(saved);
}

export async function deleteDocument(ctx: Ctx, id: string): Promise<void> {
  const removed = await documents.remove(ctx.userId, id);
  if (!removed) throw notFound('This file no longer exists');
  await Promise.all([
    storage.deleteFile(removed.storagePath),
    removed.thumbPath ? storage.deleteFile(removed.thumbPath) : null,
    links.removeAllFor(ctx.userId, `document:${id}`),
  ]);
  notifyChange(ctx, 'document', id);
}

/** Opens the stored bytes (or the thumbnail) along with how the browser should treat them. */
export async function openDocument(
  ctx: Ctx,
  id: string,
  which: 'file' | 'thumb',
): Promise<{ stream: Readable; mime: string; name: string; inline: boolean }> {
  const r = await documents.get(ctx.userId, id);
  const path = which === 'thumb' ? r?.thumbPath : r?.storagePath;
  if (!r || !path) throw notFound('This file no longer exists');
  const found = await storage.openFile(path);
  if (!found) throw notFound('This file is missing from storage');
  const mime = which === 'thumb' ? 'image/webp' : r.mime;
  return { stream: found.stream, mime, name: r.name, inline: INLINE.has(mime) };
}
