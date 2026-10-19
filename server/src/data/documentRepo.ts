import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';

/** Metadata for uploaded files; the bytes live in Cloud Storage at `storagePath`. */
export interface DocumentRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder: string | null;
  tags: string[];
  favorite: boolean;
  storagePath: string;
  thumbPath: string | null;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string) => userDoc(uid).collection('documents');
const foldersDoc = (uid: string) => userDoc(uid).collection('meta').doc('folders');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): DocumentRecord => ({
  id,
  name: d.name,
  mime: d.mime,
  size: d.size,
  folder: d.folder ?? null,
  tags: d.tags ?? [],
  favorite: d.favorite ?? false,
  storagePath: d.storagePath,
  thumbPath: d.thumbPath ?? null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

/** Anything that can queue a merge-set: a batch or a transaction. */
type Writer = {
  set(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.DocumentData,
    options: FirebaseFirestore.SetOptions,
  ): unknown;
};

function folderDelta(w: Writer, uid: string, before: string | null, after: string | null) {
  if (before === after) return;
  const delta: Record<string, FieldValue> = {};
  if (before) delta[before] = FieldValue.increment(-1);
  if (after) delta[after] = FieldValue.increment(1);
  w.set(foldersDoc(uid), { counts: delta }, { merge: true });
}

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<DocumentRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getMany(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, DocumentRecord>();
  const snaps = await db().getAll(...ids.map((id) => col(uid).doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toRecord(s.id, s.data()!)]));
}

export async function create(uid: string, doc: DocumentRecord): Promise<void> {
  const { id, ...data } = doc;
  const batch = db().batch();
  batch.create(col(uid).doc(id), data);
  folderDelta(batch, uid, null, doc.folder);
  await batch.commit();
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
    if (patch.folder !== undefined) folderDelta(tx, uid, current.folder, patch.folder);
    return { ...current, ...data };
  });
}

export async function remove(uid: string, id: string): Promise<DocumentRecord | null> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = toRecord(snap.id, snap.data()!);
    tx.delete(ref);
    folderDelta(tx, uid, current.folder, null);
    return current;
  });
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

/** One equality filter (folder, favorite, tag); the caller sorts. */
export async function listWhere(
  uid: string,
  field: 'folder' | 'favorite' | 'tags',
  value: string | boolean,
) {
  const snap = await col(uid)
    .where(field, field === 'tags' ? 'array-contains' : '==', value)
    .limit(1000)
    .get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function folderCounts(uid: string): Promise<Record<string, number>> {
  return ((await foldersDoc(uid).get()).data()?.counts as Record<string, number>) ?? {};
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
