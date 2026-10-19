import type { BookStatus, Quote } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  notes: string;
  quotes: Quote[];
  quoteCount: number;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

export type BookSummaryRecord = Omit<BookRecord, 'notes' | 'quotes' | 'searchTerms'>;

const SUMMARY_FIELDS = [
  'title',
  'author',
  'status',
  'rating',
  'startedOn',
  'finishedOn',
  'quoteCount',
  'createdAt',
  'updatedAt',
] as const;

const col = (uid: string) => db().collection('users').doc(uid).collection('books');

const toSummary = (id: string, d: FirebaseFirestore.DocumentData): BookSummaryRecord => ({
  id,
  title: d.title,
  author: d.author ?? '',
  status: d.status,
  rating: d.rating ?? null,
  startedOn: d.startedOn ?? null,
  finishedOn: d.finishedOn ?? null,
  quoteCount: d.quoteCount ?? 0,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): BookRecord => ({
  ...toSummary(id, d),
  notes: d.notes ?? '',
  quotes: d.quotes ?? [],
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<BookRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getTitles(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, BookSummaryRecord>();
  const snaps = await db().getAll(...ids.map((id) => col(uid).doc(id)), {
    fieldMask: [...SUMMARY_FIELDS],
  });
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toSummary(s.id, s.data()!)]));
}

export async function create(uid: string, book: BookRecord): Promise<void> {
  const { id, ...data } = book;
  await col(uid).doc(id).create(data);
}

export async function update(uid: string, id: string, patch: Partial<BookRecord>): Promise<void> {
  const data = { ...patch };
  delete data.id;
  await col(uid).doc(id).update(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

/** Books with one status (equality query; the caller sorts). */
export async function listByStatus(uid: string, status: BookStatus): Promise<BookSummaryRecord[]> {
  const snap = await col(uid)
    .where('status', '==', status)
    .select(...SUMMARY_FIELDS)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function listRecent(uid: string, limit: number): Promise<BookSummaryRecord[]> {
  const snap = await col(uid)
    .orderBy('createdAt', 'desc')
    .select(...SUMMARY_FIELDS)
    .limit(limit)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
