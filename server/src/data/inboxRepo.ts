import { db } from '../config/firebase.js';

export interface CaptureRecord {
  id: string;
  text: string;
  kind: 'note' | 'idea' | null;
  createdAt: string;
  searchTerms: string[];
}

const col = (uid: string) => db().collection('users').doc(uid).collection('inbox');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): CaptureRecord => ({
  id,
  text: d.text,
  kind: d.kind ?? null,
  createdAt: d.createdAt,
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<CaptureRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function create(uid: string, capture: CaptureRecord): Promise<void> {
  const { id, ...data } = capture;
  await col(uid).doc(id).create(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

export async function list(uid: string, limit: number): Promise<CaptureRecord[]> {
  const snap = await col(uid).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

/** Aggregation query: billed as one read per 1000 documents counted. */
export async function count(uid: string): Promise<number> {
  return (await col(uid).count().get()).data().count;
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
