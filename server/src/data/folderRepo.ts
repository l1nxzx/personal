import { db } from '../config/firebase.js';

/** A library folder. Nesting is a `parentId` pointer; null is the top level. */
export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string) => userDoc(uid).collection('documentFolders');
const libraryMeta = (uid: string) => userDoc(uid).collection('meta').doc('library');

const BATCH = 400;

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): FolderRecord => ({
  id,
  name: d.name,
  parentId: d.parentId ?? null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<FolderRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getMany(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, FolderRecord>();
  const snaps = await db().getAll(...[...new Set(ids)].map((id) => col(uid).doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toRecord(s.id, s.data()!)]));
}

/** Every folder (a personal library has tens to hundreds); the client builds the tree. */
export async function listAll(uid: string): Promise<FolderRecord[]> {
  const snap = await col(uid).limit(5000).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function listChildren(uid: string, parentId: string | null): Promise<FolderRecord[]> {
  const snap = await col(uid).where('parentId', '==', parentId).limit(2000).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function create(uid: string, folder: FolderRecord): Promise<void> {
  const { id, ...data } = folder;
  await col(uid).doc(id).create(data);
}

/** Idempotent writes with known ids (used by the one-time migration). */
export async function putMany(uid: string, folders: FolderRecord[]): Promise<void> {
  for (let i = 0; i < folders.length; i += BATCH) {
    const batch = db().batch();
    for (const { id, ...data } of folders.slice(i, i + BATCH)) batch.set(col(uid).doc(id), data);
    await batch.commit();
  }
}

export async function update(
  uid: string,
  id: string,
  patch: Partial<Omit<FolderRecord, 'id'>>,
): Promise<FolderRecord | null> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.update(ref, patch);
    return { ...toRecord(snap.id, snap.data()!), ...patch };
  });
}

export async function removeMany(uid: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = db().batch();
    for (const id of ids.slice(i, i + BATCH)) batch.delete(col(uid).doc(id));
    await batch.commit();
  }
}

/** Whether the old name-based folders have been turned into folder documents. */
export async function isMigrated(uid: string): Promise<boolean> {
  return (await libraryMeta(uid).get()).data()?.foldersVersion === 2;
}

export async function markMigrated(uid: string): Promise<void> {
  await libraryMeta(uid).set({ foldersVersion: 2 }, { merge: true });
}
