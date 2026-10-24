import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type {
  DecisionMeta,
  EntryKind,
  NoteType,
  Perspective,
  Source,
} from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import type { TextStats } from '../lib/text.js';

/**
 * Journal entries, writings and knowledge notes live in users/{uid}/journal, /writing and /notes.
 * Separate collections keep every list a single-field query (no composite indexes).
 */
export interface EntryRecord extends Partial<TextStats> {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  date: string | null;
  /** Journal: `${date}|${createdAt}|${id}` so one orderBy gives a stable chronological order. */
  sortKey: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  wordCount: number;
  rev: number;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
  // Knowledge notes only (null/empty for other kinds).
  noteType: NoteType | null;
  topic: string | null;
  /** Lower-cased topic, for equality queries and counting. */
  topicKey: string | null;
  sources: Source[];
  perspectives: Perspective[];
  lastConsidered: string | null;
  decision: DecisionMeta | null;
  /** Decisions: denormalised for lists (revisit date; outcome recorded). */
  revisitOn: string | null;
  decided: boolean;
  /** `MM-DD` of the journal date (or a note's creation), for "On this day". */
  monthDay: string | null;
  /** When the last version snapshot was taken. */
  lastSnapshotAt: string | null;
}

export type EntrySummaryRecord = Omit<
  EntryRecord,
  'body' | 'searchTerms' | 'sources' | 'perspectives' | 'decision' | 'lastSnapshotAt'
>;

const SUMMARY_FIELDS = [
  'title',
  'excerpt',
  'date',
  'sortKey',
  'tags',
  'pinned',
  'archived',
  'wordCount',
  'rev',
  'createdAt',
  'updatedAt',
  'noteType',
  'topic',
  'topicKey',
  'lastConsidered',
  'revisitOn',
  'decided',
  'monthDay',
] as const;

const COLLECTION: Record<EntryKind, string> = {
  journal: 'journal',
  writing: 'writing',
  note: 'notes',
};

const userDoc = (uid: string) => db().collection('users').doc(uid);
const col = (uid: string, kind: EntryKind) => userDoc(uid).collection(COLLECTION[kind]);
const tagsDoc = (uid: string) => userDoc(uid).collection('meta').doc('tags');
const versionsCol = (uid: string) => userDoc(uid).collection('versions');

/** Earlier text of an entry, kept in users/{uid}/versions (see versionRepo). */
export function versionOf(kind: EntryKind, r: EntryRecord, label: string | null) {
  return {
    entryId: r.id,
    kind,
    title: r.title,
    body: r.body,
    tags: r.tags,
    wordCount: r.wordCount,
    savedAt: r.updatedAt,
    label,
  };
}
const topicsDoc = (uid: string) => userDoc(uid).collection('meta').doc('topics');

function toSummary(id: string, d: FirebaseFirestore.DocumentData): EntrySummaryRecord {
  return {
    id,
    title: d.title ?? '',
    excerpt: d.excerpt ?? '',
    date: d.date ?? null,
    sortKey: d.sortKey ?? '',
    tags: d.tags ?? [],
    pinned: d.pinned ?? false,
    archived: d.archived ?? false,
    wordCount: d.wordCount ?? 0,
    rev: d.rev ?? 1,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    noteType: d.noteType ?? null,
    topic: d.topic ?? null,
    topicKey: d.topicKey ?? null,
    lastConsidered: d.lastConsidered ?? null,
    revisitOn: d.revisitOn ?? null,
    decided: d.decided ?? false,
    monthDay: d.monthDay ?? null,
  };
}

function toRecord(id: string, d: FirebaseFirestore.DocumentData): EntryRecord {
  return {
    ...toSummary(id, d),
    body: d.body ?? '',
    searchTerms: d.searchTerms ?? [],
    sources: d.sources ?? [],
    perspectives: d.perspectives ?? [],
    decision: d.decision ?? null,
    lastSnapshotAt: d.lastSnapshotAt ?? null,
  };
}

/** Anything that can queue a merge-set: a batch or a transaction. */
type Writer = {
  set(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.DocumentData,
    options: FirebaseFirestore.SetOptions,
  ): unknown;
};

/** Keeps per-kind tag counters (meta/tags) and topic counters (meta/topics) in step. */
function countDeltas(
  w: Writer,
  uid: string,
  kind: EntryKind,
  before: Pick<EntryRecord, 'tags' | 'topic' | 'topicKey'> | null,
  after: Pick<EntryRecord, 'tags' | 'topic' | 'topicKey'> | null,
) {
  const b = before?.tags ?? [];
  const a = after?.tags ?? [];
  const delta: Record<string, FieldValue> = {};
  for (const t of b) if (!a.includes(t)) delta[t] = FieldValue.increment(-1);
  for (const t of a) if (!b.includes(t)) delta[t] = FieldValue.increment(1);
  if (Object.keys(delta).length) w.set(tagsDoc(uid), { [kind]: delta }, { merge: true });

  if (kind !== 'note' || before?.topicKey === after?.topicKey) return;
  const counts: Record<string, FieldValue> = {};
  const labels: Record<string, string> = {};
  if (before?.topicKey) counts[before.topicKey] = FieldValue.increment(-1);
  if (after?.topicKey && after.topic) {
    counts[after.topicKey] = FieldValue.increment(1);
    labels[after.topicKey] = after.topic;
  }
  w.set(topicsDoc(uid), { counts, labels }, { merge: true });
}

export const newId = (uid: string, kind: EntryKind) => col(uid, kind).doc().id;

export async function get(uid: string, kind: EntryKind, id: string): Promise<EntryRecord | null> {
  const snap = await col(uid, kind).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

/** Title-only lookups for many entries at once (link lists). */
export async function getTitles(uid: string, kind: EntryKind, ids: string[]) {
  if (!ids.length) return new Map<string, EntrySummaryRecord>();
  const snaps = await db().getAll(...ids.map((id) => col(uid, kind).doc(id)), {
    fieldMask: [...SUMMARY_FIELDS],
  });
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toSummary(s.id, s.data()!)]));
}

export async function create(uid: string, kind: EntryKind, record: EntryRecord): Promise<void> {
  const { id, ...data } = record;
  const batch = db().batch();
  batch.create(col(uid, kind).doc(id), data);
  countDeltas(batch, uid, kind, null, record);
  await batch.commit();
}

export type UpdateResult =
  | { status: 'ok'; record: EntryRecord }
  | { status: 'conflict'; current: EntryRecord }
  | { status: 'missing' };

/**
 * Optimistic concurrency: applies `build(current)` only if the stored rev equals `expectedRev`
 * (pass null to skip the check). Increments rev when `bumpRev` (content changes).
 */
export async function update(
  uid: string,
  kind: EntryKind,
  id: string,
  expectedRev: number | null,
  build: (current: EntryRecord) => Partial<EntryRecord>,
  bumpRev = true,
  /** Return true to keep the stored text as a version before it is overwritten. */
  snapshotIf?: (current: EntryRecord) => boolean,
): Promise<UpdateResult> {
  const ref = col(uid, kind).doc(id);
  return db().runTransaction(async (tx): Promise<UpdateResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'missing' };
    const current = toRecord(snap.id, snap.data()!);
    if (expectedRev !== null && current.rev !== expectedRev) return { status: 'conflict', current };

    const patch: Partial<EntryRecord> = {
      ...build(current),
      rev: bumpRev ? current.rev + 1 : current.rev,
    };
    delete patch.id;
    if (snapshotIf?.(current)) {
      tx.set(versionsCol(uid).doc(), versionOf(kind, current, null));
      patch.lastSnapshotAt = new Date().toISOString();
    }
    tx.update(ref, patch);
    const next = { ...current, ...patch };
    countDeltas(tx, uid, kind, current, next);
    return { status: 'ok', record: next };
  });
}

export async function remove(uid: string, kind: EntryKind, id: string): Promise<boolean> {
  const ref = col(uid, kind).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    countDeltas(tx, uid, kind, toRecord(snap.id, snap.data()!), null);
    return true;
  });
}

/** Journal, newest first, paginated by sortKey. Optional inclusive date range. */
export async function listJournal(
  uid: string,
  opts: { limit: number; cursor?: string; from?: string; to?: string },
) {
  let q = col(uid, 'journal')
    .orderBy('sortKey', 'desc')
    .select(...SUMMARY_FIELDS);
  if (opts.from) q = q.where('sortKey', '>=', opts.from);
  if (opts.to) q = q.where('sortKey', '<=', `${opts.to}~`);
  if (opts.cursor) q = q.startAfter(opts.cursor);
  const docs = (await q.limit(opts.limit + 1).get()).docs;
  const items = docs.slice(0, opts.limit).map((d) => toSummary(d.id, d.data()));
  return { items, nextCursor: docs.length > opts.limit ? (items.at(-1)?.sortKey ?? null) : null };
}

/** Newest-edited first, paginated by updatedAt (knowledge notes). */
export async function listByUpdated(
  uid: string,
  kind: EntryKind,
  opts: { limit: number; cursor?: string },
) {
  let q = col(uid, kind)
    .orderBy('updatedAt', 'desc')
    .select(...SUMMARY_FIELDS);
  if (opts.cursor) q = q.startAfter(opts.cursor);
  const docs = (await q.limit(opts.limit + 1).get()).docs;
  const items = docs.slice(0, opts.limit).map((d) => toSummary(d.id, d.data()));
  return { items, nextCursor: docs.length > opts.limit ? (items.at(-1)?.updatedAt ?? null) : null };
}

/** One equality filter (tag, archived, topic, note type); the caller sorts. Capped for safety. */
export async function listWhere(
  uid: string,
  kind: EntryKind,
  field: 'tags' | 'archived' | 'topicKey' | 'noteType',
  value: string | boolean,
  cap = 500,
) {
  const snap = await col(uid, kind)
    .where(field, field === 'tags' ? 'array-contains' : '==', value)
    .select(...SUMMARY_FIELDS)
    .limit(cap)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function listRecent(uid: string, kind: EntryKind, limit: number) {
  const snap = await col(uid, kind)
    .orderBy('updatedAt', 'desc')
    .select(...SUMMARY_FIELDS)
    .limit(limit)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function listByDate(uid: string, date: string) {
  const snap = await col(uid, 'journal').where('date', '==', date).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function search(uid: string, kind: EntryKind, term: string, limit: number) {
  const snap = await col(uid, kind).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function tagCounts(uid: string, kind: EntryKind): Promise<Record<string, number>> {
  const snap = await tagsDoc(uid).get();
  return (snap.get(new FieldPath(kind)) as Record<string, number> | undefined) ?? {};
}

export async function topicCounts(
  uid: string,
): Promise<{ counts: Record<string, number>; labels: Record<string, string> }> {
  const d = (await topicsDoc(uid).get()).data();
  return { counts: d?.counts ?? {}, labels: d?.labels ?? {} };
}

/** Entries written on this calendar day (any year): equality on `monthDay`. */
export async function listByMonthDay(uid: string, kind: EntryKind, monthDay: string) {
  const snap = await col(uid, kind)
    .where('monthDay', '==', monthDay)
    .select(...SUMMARY_FIELDS)
    .limit(50)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

/** Entries last edited within [fromIso, toIso): a range on one field. */
export async function listUpdatedBetween(
  uid: string,
  kind: EntryKind,
  fromIso: string,
  toIso: string,
) {
  const snap = await col(uid, kind)
    .where('updatedAt', '>=', fromIso)
    .where('updatedAt', '<', toIso)
    .orderBy('updatedAt', 'desc')
    .select(...SUMMARY_FIELDS, 'perspectives')
    .limit(200)
    .get();
  return snap.docs.map((d) => ({
    ...toSummary(d.id, d.data()),
    perspectives: (d.get('perspectives') ?? []) as Perspective[],
  }));
}
