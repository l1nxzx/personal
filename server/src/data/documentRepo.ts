import { db } from '../config/firebase.js';

/** Metadata for uploaded files; the bytes live in Cloud Storage at `storagePath`. */
export interface DocumentRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Containing folder (`documentFolders/{id}`); null = top level. */
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  storagePath: string;
  thumbPath: string | null;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

/** A file stored before folders were documents: it has only the old `folder` name. */
export interface UnplacedDocument {
  id: string;
  name: string;
  tags: string[];
  legacyFolder: string | null;
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string) => userDoc(uid).collection('documents');

const BATCH = 400;
/** Firestore's limit on values in one `in` filter. */
const IN_LIMIT = 30;

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): DocumentRecord => ({
  id,
  name: d.name,
  mime: d.mime,
  size: d.size,
  folderId: d.folderId ?? null,
  tags: d.tags ?? [],
  favorite: d.favorite ?? false,
  storagePath: d.storagePath,
  thumbPath: d.thumbPath ?? null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<DocumentRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getMany(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, DocumentRecord>();
  const snaps = await db().getAll(...[...new Set(ids)].map((id) => col(uid).doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toRecord(s.id, s.data()!)]));
}

export async function create(uid: string, doc: DocumentRecord): Promise<void> {
  const { id, ...data } = doc;
  await col(uid).doc(id).create(data);
}

export async function update(
  uid: string,
  id: string,
  patch: Partial<DocumentRecord>,
): Promise<DocumentRecord | null> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = toRecord(snap.id, snap.data()!);
    const data = { ...patch };
    delete data.id;
    tx.update(ref, data);
    return { ...current, ...data };
  });
}

export async function remove(uid: string, id: string): Promise<DocumentRecord | null> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    return toRecord(snap.id, snap.data()!);
  });
}

/** Moves existing files (the caller checked they exist) to `folderId`. Bytes are untouched. */
export async function setFolder(
  uid: string,
  ids: string[],
  folderId: string | null,
  updatedAt: string,
): Promise<void> {
  for (const part of chunks(ids, BATCH)) {
    const batch = db().batch();
    for (const id of part) batch.update(col(uid).doc(id), { folderId, updatedAt });
    await batch.commit();
  }
}

/** Newest first, paginated by createdAt. */
export async function list(uid: string, limit: number, cursor?: string) {
  let q = col(uid)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1);
  if (cursor) q = q.startAfter(cursor);
  const docs = (await q.get()).docs;
  const items = docs.slice(0, limit).map((d) => toRecord(d.id, d.data()));
  return { items, nextCursor: docs.length > limit ? (items.at(-1)?.createdAt ?? null) : null };
}

/** One equality filter (folder, favorite, tag); the caller sorts. `folderId: null` = top level. */
export async function listWhere(
  uid: string,
  field: 'folderId' | 'favorite' | 'tags',
  value: string | boolean | null,
) {
  const snap = await col(uid)
    .where(field, field === 'tags' ? 'array-contains' : '==', value)
    .limit(2000)
    .get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

/** Every file directly inside any of `folderIds`. */
export async function listInFolders(uid: string, folderIds: string[]) {
  const out: DocumentRecord[] = [];
  for (const part of chunks(folderIds, IN_LIMIT)) {
    const snap = await col(uid).where('folderId', 'in', part).get();
    out.push(...snap.docs.map((d) => toRecord(d.id, d.data())));
  }
  return out;
}

/** How many files sit directly inside any of `folderIds` (count aggregation, cheap). */
export async function countInFolders(uid: string, folderIds: string[]): Promise<number> {
  let total = 0;
  for (const part of chunks(folderIds, IN_LIMIT)) {
    total += (await col(uid).where('folderId', 'in', part).count().get()).data().count;
  }
  return total;
}

/** Files that predate folder documents (no `folderId` field at all). */
export async function listUnplaced(uid: string): Promise<UnplacedDocument[]> {
  const snap = await col(uid).select('name', 'tags', 'folder', 'folderId').get();
  return snap.docs
    .filter((d) => d.get('folderId') === undefined)
    .map((d) => ({
      id: d.id,
      name: d.get('name') ?? 'file',
      tags: d.get('tags') ?? [],
      legacyFolder: d.get('folder') ?? null,
    }));
}

/** Writes `folderId` (and fresh search terms) onto old files. The old `folder` field is kept. */
export async function placeMany(
  uid: string,
  updates: { id: string; folderId: string | null; searchTerms: string[] }[],
): Promise<void> {
  for (const part of chunks(updates, BATCH)) {
    const batch = db().batch();
    for (const { id, ...data } of part) batch.update(col(uid).doc(id), data);
    await batch.commit();
  }
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
