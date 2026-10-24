import { db } from '../config/firebase.js';

/**
 * Time the site was open in a visible tab. One document per local day
 * (users/{uid}/activity/{YYYY-MM-DD}) and the running totals in meta/activity, always written
 * together in one transaction, so the totals equal the sum of the days.
 */
export interface ActivityDayRecord {
  date: string;
  seconds: number;
  /** Sessions that started on this day. */
  sessions: number;
  firstAt: string;
  lastAt: string;
}

export interface ActivityMetaRecord {
  totalSeconds: number;
  days: number;
  sessions: number;
  longestSessionSeconds: number;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  /** `YYYY-MM` → totals of that month. */
  months: Record<string, { seconds: number; days: number }>;
  /** The latest sessions, oldest first; times in ms since the epoch (server clock). */
  recentSessions: { startedAt: number; lastAt: number; seconds: number }[];
  /** Stretches counted in the last few minutes (ms, merged), so overlapping time counts once. */
  recent: { start: number; end: number }[];
  /** Ids of the latest stretches received, so one sent twice counts once. */
  beatIds: string[];
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const metaRef = (uid: string) => userDoc(uid).collection('meta').doc('activity');
const daysCol = (uid: string) => userDoc(uid).collection('activity');

export async function getMeta(uid: string): Promise<ActivityMetaRecord | null> {
  const snap = await metaRef(uid).get();
  return snap.exists ? (snap.data() as ActivityMetaRecord) : null;
}

/**
 * Reads the totals and the given days, and writes back what `build` returns (nothing if it
 * returns null). Runs in a transaction, so concurrent tabs and devices never lose an update.
 */
export async function record(
  uid: string,
  dates: string[],
  build: (
    meta: ActivityMetaRecord | null,
    days: Map<string, ActivityDayRecord>,
  ) => { meta: ActivityMetaRecord; days: ActivityDayRecord[] } | null,
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const [metaSnap, ...daySnaps] = await tx.getAll(
      metaRef(uid),
      ...dates.map((d) => daysCol(uid).doc(d)),
    );
    const days = new Map<string, ActivityDayRecord>();
    for (const s of daySnaps) if (s.exists) days.set(s.id, s.data() as ActivityDayRecord);
    const next = build(metaSnap!.exists ? (metaSnap!.data() as ActivityMetaRecord) : null, days);
    if (!next) return;
    tx.set(metaRef(uid), next.meta);
    for (const d of next.days) tx.set(daysCol(uid).doc(d.date), d);
  });
}

/** Recomputes the totals from every stored day (reconciliation). */
export async function rebuild(
  uid: string,
  build: (meta: ActivityMetaRecord | null, days: ActivityDayRecord[]) => ActivityMetaRecord,
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const [metaSnap, daySnap] = await Promise.all([tx.get(metaRef(uid)), tx.get(daysCol(uid))]);
    const meta = metaSnap.exists ? (metaSnap.data() as ActivityMetaRecord) : null;
    tx.set(
      metaRef(uid),
      build(
        meta,
        daySnap.docs.map((d) => d.data() as ActivityDayRecord),
      ),
    );
  });
}
