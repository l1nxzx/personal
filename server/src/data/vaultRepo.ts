import type { VaultMeta } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

/**
 * Private Vault storage. Everything here is ciphertext produced in the browser; the server only
 * stores and returns it. Meta: users/{uid}/meta/vault. Items: users/{uid}/vault/{id}.
 */
export interface VaultItemRecord {
  id: string;
  iv: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const metaDoc = (uid: string) => userDoc(uid).collection('meta').doc('vault');
const col = (uid: string) => userDoc(uid).collection('vault');

const toItem = (id: string, d: FirebaseFirestore.DocumentData): VaultItemRecord => ({
  id,
  iv: d.iv,
  data: d.data,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export async function getMeta(uid: string): Promise<VaultMeta | null> {
  const snap = await metaDoc(uid).get();
  return snap.exists ? (snap.data() as VaultMeta) : null;
}

export async function setMeta(uid: string, meta: VaultMeta): Promise<void> {
  await metaDoc(uid).set(meta);
}

export const newId = (uid: string) => col(uid).doc().id;

export async function listItems(uid: string): Promise<VaultItemRecord[]> {
  return (await col(uid).get()).docs.map((d) => toItem(d.id, d.data()));
}

export async function getItem(uid: string, id: string): Promise<VaultItemRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toItem(snap.id, snap.data()!) : null;
}

export async function createItem(uid: string, item: VaultItemRecord): Promise<void> {
  const { id, ...data } = item;
  await col(uid).doc(id).create(data);
}

export type VaultUpdateResult =
  { status: 'ok'; item: VaultItemRecord } | { status: 'missing' } | { status: 'conflict' };

/** Replaces the ciphertext, refusing if it changed since `expectedUpdatedAt` (another device). */
export async function updateItem(
  uid: string,
  id: string,
  next: { iv: string; data: string; updatedAt: string },
  expectedUpdatedAt?: string,
): Promise<VaultUpdateResult> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx): Promise<VaultUpdateResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'missing' };
    const current = toItem(snap.id, snap.data()!);
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) return { status: 'conflict' };
    tx.update(ref, next);
    return { status: 'ok', item: { ...current, ...next } };
  });
}

export async function removeItem(uid: string, id: string): Promise<boolean> {
  const ref = col(uid).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

/** Deletes every item and the key material (vault reset). */
export async function removeAll(uid: string): Promise<string[]> {
  const docs = (await col(uid).get()).docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await metaDoc(uid).delete();
  return docs.map((d) => d.id);
}
