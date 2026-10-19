import { FieldValue } from 'firebase-admin/firestore';
import type { ExpenseSummary, Frequency } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

export interface ExpenseRecord {
  id: string;
  date: string;
  amountMinor: number;
  currency: string;
  category: string;
  categoryKey: string;
  description: string;
  moneyIdeaId: string | null;
  projectId: string | null;
  subscriptionId: string | null;
  /** `${date}|${createdAt}|${id}` for a stable newest-first history. */
  sortKey: string;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

export interface SubscriptionRecord {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  frequency: Frequency;
  nextRenewal: string | null;
  category: string;
  notes: string;
  active: boolean;
  moneyIdeaId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string) => userDoc(uid).collection('expenses');
const subs = (uid: string) => userDoc(uid).collection('subscriptions');
const summaryDoc = (uid: string) => userDoc(uid).collection('meta').doc('expenses');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): ExpenseRecord => ({
  id,
  date: d.date,
  amountMinor: d.amountMinor,
  currency: d.currency,
  category: d.category ?? '',
  categoryKey: d.categoryKey ?? 'other',
  description: d.description ?? '',
  moneyIdeaId: d.moneyIdeaId ?? null,
  projectId: d.projectId ?? null,
  subscriptionId: d.subscriptionId ?? null,
  sortKey: d.sortKey,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

const toSub = (id: string, d: FirebaseFirestore.DocumentData): SubscriptionRecord => ({
  id,
  name: d.name,
  amountMinor: d.amountMinor,
  currency: d.currency,
  frequency: d.frequency,
  nextRenewal: d.nextRenewal ?? null,
  category: d.category ?? '',
  notes: d.notes ?? '',
  active: d.active ?? true,
  moneyIdeaId: d.moneyIdeaId ?? null,
  projectId: d.projectId ?? null,
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

/** Running totals in meta/expenses, kept in step in the same transaction (like income). */
function applyToSummary(w: Writer, uid: string, r: ExpenseRecord, sign: 1 | -1) {
  const amount = FieldValue.increment(sign * r.amountMinor);
  w.set(
    summaryDoc(uid),
    {
      months: {
        [r.date.slice(0, 7)]: {
          [r.currency]: { total: amount, categories: { [r.categoryKey]: amount } },
        },
      },
      ...(sign === 1 && { categoryLabels: { [r.categoryKey]: r.category || 'Other' } }),
    },
    { merge: true },
  );
}

export const newId = (uid: string) => col(uid).doc().id;
export const newSubscriptionId = (uid: string) => subs(uid).doc().id;

export async function get(uid: string, id: string): Promise<ExpenseRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function create(uid: string, r: ExpenseRecord): Promise<void> {
  const { id, ...data } = r;
  await db().runTransaction(async (tx) => {
    tx.create(col(uid).doc(id), data);
    applyToSummary(tx, uid, r, 1);
  });
}

export async function update(
  uid: string,
  id: string,
  build: (current: ExpenseRecord) => ExpenseRecord,
): Promise<ExpenseRecord | null> {
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

/** Expenses connected to one idea or project (equality query). */
export async function listWhere(uid: string, field: 'moneyIdeaId' | 'projectId', value: string) {
  const snap = await col(uid).where(field, '==', value).limit(500).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function summary(uid: string): Promise<ExpenseSummary> {
  const d = (await summaryDoc(uid).get()).data();
  return { months: d?.months ?? {}, categoryLabels: d?.categoryLabels ?? {} };
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

// ---------------------------------------------------------------- subscriptions

export async function getSubscription(uid: string, id: string): Promise<SubscriptionRecord | null> {
  const snap = await subs(uid).doc(id).get();
  return snap.exists ? toSub(snap.id, snap.data()!) : null;
}

export async function createSubscription(uid: string, r: SubscriptionRecord): Promise<void> {
  const { id, ...data } = r;
  await subs(uid).doc(id).create(data);
}

export async function updateSubscription(
  uid: string,
  id: string,
  patch: Partial<SubscriptionRecord>,
): Promise<void> {
  const data = { ...patch };
  delete data.id;
  await subs(uid).doc(id).update(data);
}

export async function removeSubscription(uid: string, id: string): Promise<void> {
  await subs(uid).doc(id).delete();
}

export async function listSubscriptions(uid: string): Promise<SubscriptionRecord[]> {
  return (await subs(uid).get()).docs.map((d) => toSub(d.id, d.data()));
}

export async function searchSubscriptions(uid: string, term: string, limit: number) {
  const snap = await subs(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toSub(d.id, d.data()));
}
