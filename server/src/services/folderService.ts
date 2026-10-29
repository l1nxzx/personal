import type {
  CreateFolderRequest,
  DocumentFolder,
  FolderSizes,
  FolderUsage,
  LibrarySelection,
  MoveItemsRequest,
  UpdateFolderRequest,
} from '../../../shared/types.js';
import * as documents from '../data/documentRepo.js';
import * as folders from '../data/folderRepo.js';
import * as links from '../data/linkRepo.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { buildSearchTerms, fold, matchesAll } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { removeStoredDocument, requireFolderOrRoot } from './documentService.js';
import { ensureLibraryMigrated } from './libraryMigration.js';

/** Deep enough for any real archive, shallow enough that walking up a path stays cheap. */
export const MAX_DEPTH = 20;

const toFolder = (r: folders.FolderRecord): DocumentFolder => ({
  id: r.id,
  name: r.name,
  parentId: r.parentId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export function cleanFolderName(name: string): string {
  const cleaned = [...name]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  if (!cleaned) throw badRequest('Give the folder a name');
  return cleaned;
}

const sameName = (a: string, b: string) => fold(a) === fold(b);

const nameTaken = (name: string) =>
  conflict(`A folder named “${name}” is already there`, 'FOLDER_NAME_TAKEN');

const invalidMove = (message: string) => new AppError(400, 'INVALID_MOVE', message);

async function requireFolder(uid: string, id: string): Promise<folders.FolderRecord> {
  const f = await folders.get(uid, id);
  if (!f) throw notFound('This folder no longer exists');
  return f;
}

/** `id` and every folder above it, nearest first. */
async function pathUp(uid: string, id: string): Promise<folders.FolderRecord[]> {
  const out = [await requireFolder(uid, id)];
  while (out.at(-1)!.parentId && out.length <= MAX_DEPTH + 1) {
    const parent = await folders.get(uid, out.at(-1)!.parentId!);
    if (!parent) break;
    out.push(parent);
  }
  return out;
}

/** `rootIds` plus every folder below them (unknown ids are skipped). */
function subtree(all: folders.FolderRecord[], rootIds: string[]): Set<string> {
  const known = new Set(all.map((f) => f.id));
  const children = new Map<string, string[]>();
  for (const f of all) {
    if (f.parentId) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  }
  const out = new Set<string>();
  const stack = rootIds.filter((id) => known.has(id));
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** How many levels a folder's subtree spans (1 = no subfolders). */
function height(all: folders.FolderRecord[], id: string): number {
  const kids = all.filter((f) => f.parentId === id);
  return 1 + Math.max(0, ...kids.map((k) => height(all, k.id)));
}

/** Names of the given folders (for subtitles in search, home and links); nulls are skipped. */
export async function folderNames(
  uid: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = ids.filter((x): x is string => !!x);
  if (!wanted.length) return new Map();
  return new Map([...(await folders.getMany(uid, wanted))].map(([fid, f]) => [fid, f.name]));
}

/**
 * Folders whose name matches every token. Folders carry no stored search terms; a personal
 * library has few enough of them to match in memory (one read of the folder list).
 */
export async function searchFolders(uid: string, tokens: string[]) {
  if (!tokens.length) return [];
  return (await folders.listAll(uid)).filter((f) => matchesAll(buildSearchTerms(f.name), tokens));
}

export async function listFolders(ctx: Ctx): Promise<DocumentFolder[]> {
  await ensureLibraryMigrated(ctx.userId);
  return (await folders.listAll(ctx.userId))
    .map(toFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(ctx: Ctx, input: CreateFolderRequest): Promise<DocumentFolder> {
  const uid = ctx.userId;
  await ensureLibraryMigrated(uid);
  const name = cleanFolderName(input.name);
  const parentId = input.parentId ?? null;
  if (parentId && (await pathUp(uid, parentId)).length >= MAX_DEPTH) {
    throw invalidMove(`Folders can be nested at most ${MAX_DEPTH} levels deep`);
  }
  if ((await folders.listChildren(uid, parentId)).some((f) => sameName(f.name, name))) {
    throw nameTaken(name);
  }
  const now = new Date().toISOString();
  const record = { id: folders.newId(uid), name, parentId, createdAt: now, updatedAt: now };
  await folders.create(uid, record);
  notifyChange(ctx, 'document');
  return toFolder(record);
}

/** Rename and/or move one folder. Moving goes through the same checks as `moveItems`. */
export async function updateFolder(
  ctx: Ctx,
  id: string,
  input: UpdateFolderRequest,
): Promise<DocumentFolder> {
  const uid = ctx.userId;
  const current = await requireFolder(uid, id);
  if (input.parentId !== undefined && input.parentId !== current.parentId) {
    await moveItems(ctx, { fileIds: [], folderIds: [id], targetId: input.parentId });
  }
  if (input.name !== undefined) {
    const name = cleanFolderName(input.name);
    if (name !== current.name) {
      const parentId = input.parentId !== undefined ? input.parentId : current.parentId;
      const siblings = await folders.listChildren(uid, parentId);
      if (siblings.some((f) => f.id !== id && sameName(f.name, name))) throw nameTaken(name);
      await folders.update(uid, id, { name, updatedAt: new Date().toISOString() });
    }
  }
  notifyChange(ctx, 'document');
  return toFolder(await requireFolder(uid, id));
}

/**
 * Moves files and folders into `targetId` (null = top level). Only pointers change; stored bytes
 * and file ids stay the same, so links, downloads and previews keep working.
 */
export async function moveItems(
  ctx: Ctx,
  input: MoveItemsRequest,
): Promise<{ files: number; folders: number }> {
  const uid = ctx.userId;
  await ensureLibraryMigrated(uid);
  const { targetId } = input;
  const now = new Date().toISOString();
  let movedFolders = 0;

  if (input.folderIds.length) {
    const all = await folders.listAll(uid);
    const byId = new Map(all.map((f) => [f.id, f]));
    if (targetId && !byId.has(targetId)) throw notFound('That folder no longer exists');
    const targetPath: string[] = [];
    for (let at = targetId; at && targetPath.length <= MAX_DEPTH + 1;) {
      targetPath.push(at);
      at = byId.get(at)?.parentId ?? null;
    }
    const moving = [...new Set(input.folderIds)]
      .map((fid) => byId.get(fid))
      .filter((f): f is folders.FolderRecord => !!f && f.parentId !== targetId);
    if (moving.some((f) => targetPath.includes(f.id))) {
      throw invalidMove('A folder can’t be moved into itself or one of its own folders');
    }
    const deepest = Math.max(0, ...moving.map((f) => height(all, f.id)));
    if (targetPath.length + deepest > MAX_DEPTH) {
      throw invalidMove(`Folders can be nested at most ${MAX_DEPTH} levels deep`);
    }
    const names = all.filter((f) => f.parentId === targetId).map((f) => f.name);
    for (const f of moving) {
      if (names.some((n) => sameName(n, f.name))) throw nameTaken(f.name);
      names.push(f.name);
    }
    for (const f of moving) await folders.update(uid, f.id, { parentId: targetId, updatedAt: now });
    movedFolders = moving.length;
  } else {
    await requireFolderOrRoot(uid, targetId);
  }

  const files = [...(await documents.getMany(uid, input.fileIds)).values()].filter(
    (d) => d.folderId !== targetId,
  );
  await documents.setFolder(
    uid,
    files.map((d) => d.id),
    targetId,
    now,
  );

  if (files.length || movedFolders) notifyChange(ctx, 'document');
  return { files: files.length, folders: movedFolders };
}

/** Everything inside the given folders, at any depth (the folders themselves aren't counted). */
export async function folderUsage(ctx: Ctx, folderIds: string[]): Promise<FolderUsage> {
  const all = await folders.listAll(ctx.userId);
  const ids = subtree(all, folderIds);
  const roots = folderIds.filter((id) => ids.has(id));
  return {
    files: ids.size ? await documents.countInFolders(ctx.userId, [...ids]) : 0,
    folders: ids.size - new Set(roots).size,
  };
}

/**
 * Bytes and files in every folder, including everything below it. One small read per file, so
 * the client keeps the answer cached until the library changes.
 */
export async function folderSizes(ctx: Ctx): Promise<FolderSizes> {
  const [all, files] = await Promise.all([
    folders.listAll(ctx.userId),
    documents.listSizes(ctx.userId),
  ]);
  const parent = new Map(all.map((f) => [f.id, f.parentId]));
  const out: FolderSizes = { folders: {}, total: { bytes: 0, files: 0 } };
  for (const file of files) {
    out.total.bytes += file.size;
    out.total.files += 1;
    // Count the file in its folder and every folder above it.
    const seen = new Set<string>();
    for (let id = file.folderId; id && parent.has(id) && !seen.has(id); id = parent.get(id)!) {
      seen.add(id);
      const s = (out.folders[id] ??= { bytes: 0, files: 0 });
      s.bytes += file.size;
      s.files += 1;
    }
  }
  return out;
}

/** "Item (2)", "Item (3)"… until the name is free among `taken`. */
function freeName(name: string, taken: string[]): string {
  if (!taken.some((t) => sameName(t, name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, 94)} (${n})`;
    if (!taken.some((t) => sameName(t, candidate))) return candidate;
  }
}

/**
 * Deletes one folder. An empty folder just goes. A folder with anything in it is refused
 * (409 FOLDER_NOT_EMPTY, with counts) unless the caller chose what happens to the contents:
 * - `move`: its files and subfolders move up into its parent first (clashing names get "(2)").
 * - `delete`: everything inside is deleted too, files and stored bytes included.
 */
export async function deleteFolder(
  ctx: Ctx,
  id: string,
  contents?: 'move' | 'delete',
): Promise<void> {
  const uid = ctx.userId;
  const folder = await requireFolder(uid, id);
  if (contents === 'delete') return deleteItems(ctx, { fileIds: [], folderIds: [id] });

  const [childFolders, childFiles] = await Promise.all([
    folders.listChildren(uid, id),
    documents.listWhere(uid, 'folderId', id),
  ]);
  if (!contents && (childFolders.length || childFiles.length)) {
    const usage = await folderUsage(ctx, [id]);
    throw new AppError(409, 'FOLDER_NOT_EMPTY', `“${folder.name}” isn’t empty`, usage);
  }
  if (contents === 'move') {
    const now = new Date().toISOString();
    const taken = (await folders.listChildren(uid, folder.parentId))
      .filter((f) => f.id !== id)
      .map((f) => f.name);
    for (const f of childFolders) {
      const name = freeName(f.name, taken);
      taken.push(name);
      await folders.update(uid, f.id, { parentId: folder.parentId, name, updatedAt: now });
    }
    await documents.setFolder(
      uid,
      childFiles.map((d) => d.id),
      folder.parentId,
      now,
    );
  }
  await removeFolders(uid, [id]);
  notifyChange(ctx, 'document');
}

/** Folder documents and anything linked to them. */
async function removeFolders(uid: string, ids: string[]) {
  await folders.removeMany(uid, ids);
  await Promise.all(ids.map((id) => links.removeAllFor(uid, `folder:${id}`)));
}

/**
 * Deletes files, and folders with everything inside them. Files go first; if any of them fails
 * the folders are kept, so nothing is left pointing at a folder that no longer exists.
 */
export async function deleteItems(ctx: Ctx, input: LibrarySelection): Promise<void> {
  const uid = ctx.userId;
  const folderIds = input.folderIds.length
    ? [...subtree(await folders.listAll(uid), input.folderIds)]
    : [];
  const inside = folderIds.length ? await documents.listInFolders(uid, folderIds) : [];
  const fileIds = [...new Set([...input.fileIds, ...inside.map((d) => d.id)])];

  const results: PromiseSettledResult<boolean>[] = [];
  for (let i = 0; i < fileIds.length; i += 10) {
    results.push(
      ...(await Promise.allSettled(
        fileIds.slice(i, i + 10).map((fid) => removeStoredDocument(uid, fid)),
      )),
    );
  }
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (results.length) notifyChange(ctx, 'document');
  if (failed) throw failed.reason;

  if (folderIds.length) {
    await removeFolders(uid, folderIds);
    notifyChange(ctx, 'document');
    notifyChange(ctx, 'link');
  }
}
