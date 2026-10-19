import { FieldValue } from 'firebase-admin/firestore';
import type { IncomeStatus, IncomeSummary } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

export interface IncomeRecord {
  id: string;
  date: string;
  source: string;
  sourceKey: string;
  amountMinor: number;
  currency: string;
  description: string;
  status: IncomeStatus;
  /** `${date}|${createdAt}|${id}`: one orderBy for a stable newest-first history. */
  sortKey: string;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string) => userDoc(uid).collection('income');
const summaryDoc = (uid: string) => userDoc(uid).collection('meta').doc('income');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): IncomeRecord => ({
  id,
  date: d.date,
  source: d.source,
  sourceKey: d.sourceKey,
  amountMinor: d.amountMinor,
  currency: d.currency,
  description: d.description ?? '',
  status: d.status,
  sortKey: d.sortKey,
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

/**
 * Running totals in meta/income, adjusted with increments in the same transaction as the entry
 * itself, so every summary (Home, charts, by source) costs a single document read.
 */
function applyToSummary(w: Writer, uid: string, r: IncomeRecord, sign: 1 | -1) {
  const month = r.date.slice(0, 7);
  const amount = FieldValue.increment(sign * r.amountMinor);
  const totals: Record<string, unknown> =
    r.status === 'received'
      ? { received: amount, sources: { [r.sourceKey]: amount } }
      : { pending: amount };
  w.set(
    summaryDoc(uid),
    {
      months: { [month]: { [r.currency]: totals } },
      ...(sign === 1 && { sourceLabels: { [r.sourceKey]: r.source } }),
    },
    { merge: true },
  );
}

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<IncomeRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function create(uid: string, r: IncomeRecord): Promise<void> {
  const { id, ...data } = r;
  await db().runTransaction(async (tx) => {
    tx.create(col(uid).doc(id), data);
    applyToSummary(tx, uid, r, 1);
  });
}

export async function update(
  uid: string,
  id: string,
  build: (current: IncomeRecord) => IncomeRecord,
): Promise<IncomeRecord | null> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = toRecord(snap.id, snap.data()!);
    const next = build(current);
    const { id: _id, ...data } = next;
    tx.set(ref, data);
    applyToSummary(tx, uid, current, -1);
    applyToSummary(tx, uid, next, 1);
    return next;
  });
}

export async function remove(uid: string, id: string): Promise<boolean> {
  const ref = col(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    applyToSummary(tx, uid, toRecord(snap.id, snap.data()!), -1);
    return true;
  });
}

/** Newest first; optional inclusive date range (e.g. one month). */
export async function list(
  uid: string,
  opts: { limit: number; cursor?: string; from?: string; to?: string },
) {
  let q = col(uid).orderBy('sortKey', 'desc');
  if (opts.from) q = q.where('sortKey', '>=', opts.from);
  if (opts.to) q = q.where('sortKey', '<=', `${opts.to}~`);
  if (opts.cursor) q = q.startAfter(opts.cursor);
  const docs = (await q.limit(opts.limit + 1).get()).docs;
  const items = docs.slice(0, opts.limit).map((d) => toRecord(d.id, d.data()));
  return { items, nextCursor: docs.length > opts.limit ? (items.at(-1)?.sortKey ?? null) : null };
}

export async function summary(uid: string): Promise<IncomeSummary> {
  const d = (await summaryDoc(uid).get()).data();
  return { months: d?.months ?? {}, sourceLabels: d?.sourceLabels ?? {} };
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
