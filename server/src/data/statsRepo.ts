import {
  AggregateField,
  FieldPath,
  type AggregateFieldType,
  type Timestamp,
} from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';

/**
 * Counts and sums across a user's collections for the profile, using aggregation queries: one
 * read per 1,000 documents counted, whatever their size. No filters beyond one field, so no
 * composite indexes.
 */
export type StatCollection =
  | 'journal'
  | 'writing'
  | 'notes'
  | 'reviews'
  | 'moments'
  | 'projects'
  | 'tasks'
  | 'books'
  | 'documents'
  | 'documentFolders'
  | 'moneyIdeas'
  | 'income'
  | 'expenses'
  | 'subscriptions';

export interface StatsMeta {
  /** Version of the text counting rules every stored document has been counted with. */
  textVersion?: number;
  textCountedAt?: string;
}

/** A document read while recounting; `version` guards the write against a newer save. */
export interface ScannedDoc {
  id: string;
  data: Record<string, unknown>;
  version?: unknown;
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string, c: StatCollection) => userDoc(uid).collection(c);
const metaDoc = (uid: string) => userDoc(uid).collection('meta').doc('stats');

/**
 * Number of documents, plus the sum of each numeric field (documents without it add 0).
 * One aggregation per query: several sums in one query need a composite index over those
 * fields, while a single sum is served by the field's automatic index.
 */
export async function aggregate(
  uid: string,
  c: StatCollection,
  sumFields: string[] = [],
): Promise<{ count: number; sums: Record<string, number> }> {
  const run = async (field: AggregateFieldType) =>
    Number((await col(uid, c).aggregate({ v: field }).get()).data().v ?? 0);
  const [count, ...sums] = await Promise.all([
    run(AggregateField.count()),
    ...sumFields.map((f) => run(AggregateField.sum(f))),
  ]);
  return { count: count!, sums: Object.fromEntries(sumFields.map((f, i) => [f, sums[i]!])) };
}

export async function countWhere(
  uid: string,
  c: StatCollection,
  field: string,
  op: '==' | '>',
  value: string | number | boolean,
): Promise<number> {
  const snap = await col(uid, c).where(field, op, value).count().get();
  return snap.data().count;
}

/** A page of documents in id order, only the given fields. */
export async function scan(
  uid: string,
  c: StatCollection,
  fields: string[],
  opts: { after?: string; limit: number },
): Promise<ScannedDoc[]> {
  let q = col(uid, c)
    .orderBy(FieldPath.documentId())
    .select(...fields)
    .limit(opts.limit);
  if (opts.after) q = q.startAfter(opts.after);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data(), version: d.updateTime }));
}

/**
 * Writes derived fields onto documents. A document changed since it was scanned is skipped:
 * its own save already stored fresh values.
 */
export async function setFields(
  uid: string,
  c: StatCollection,
  updates: { id: string; version?: unknown; data: Record<string, number> }[],
): Promise<void> {
  const writer = db().bulkWriter();
  writer.onWriteError(() => false);
  for (const u of updates) {
    const ref = col(uid, c).doc(u.id);
    const precondition = u.version ? { lastUpdateTime: u.version as Timestamp } : {};
    writer.update(ref, u.data, precondition).catch(() => undefined);
  }
  await writer.close();
}

export async function getMeta(uid: string): Promise<StatsMeta> {
  return ((await metaDoc(uid).get()).data() as StatsMeta | undefined) ?? {};
}

export async function setMeta(uid: string, patch: StatsMeta): Promise<void> {
  await metaDoc(uid).set(patch, { merge: true });
}
