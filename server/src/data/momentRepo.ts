import type { Ref } from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import type { TextStats } from '../lib/text.js';

/** Life timeline: moments chosen by hand, in users/{uid}/moments. */
export interface MomentRecord extends Partial<TextStats> {
  id: string;
  date: string;
  title: string;
  description: string;
  ref: Ref | null;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const col = (uid: string) => db().collection('users').doc(uid).collection('moments');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): MomentRecord => ({
  id,
  date: d.date,
  title: d.title,
  description: d.description ?? '',
  ref: d.ref ?? null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<MomentRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function create(uid: string, m: MomentRecord): Promise<void> {
  const { id, ...data } = m;
  await col(uid).doc(id).create(data);
}

export async function update(uid: string, id: string, patch: Partial<MomentRecord>): Promise<void> {
  const data = { ...patch };
  delete data.id;
  await col(uid).doc(id).update(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

/** The whole timeline, newest first. Moments are chosen by hand, so there are few. */
export async function listAll(uid: string): Promise<MomentRecord[]> {
  const snap = await col(uid).orderBy('date', 'desc').limit(2000).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
