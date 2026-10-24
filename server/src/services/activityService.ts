import type { ActivityBeat, ActivityStats } from '../../../shared/types.js';
import * as activity from '../data/activityRepo.js';
import type { Ctx } from './context.js';

/**
 * Active time: how long the site was open in a visible browser tab. Each tab sends the stretches
 * it was visible ("beats"); the server places them on its own clock, drops time already counted
 * by another tab or device, and ignores beats it has seen before.
 *
 * A session is a run of use with no gap of 30 minutes or more; navigating, reloading or opening
 * another tab never starts a new one.
 */
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** How long counted stretches are remembered for overlap checks (beats arrive within ~1 min). */
const OVERLAP_WINDOW_MS = 15 * 60 * 1000;
const KEEP_BEAT_IDS = 200;
const KEEP_SESSIONS = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;

type Meta = activity.ActivityMetaRecord;
type Day = activity.ActivityDayRecord;
type Span = { start: number; end: number };

const emptyMeta = (): Meta => ({
  totalSeconds: 0,
  days: 0,
  sessions: 0,
  longestSessionSeconds: 0,
  firstActiveAt: null,
  lastActiveAt: null,
  months: {},
  recentSessions: [],
  recent: [],
  beatIds: [],
});

/** Milliseconds of [start, end] already covered by `spans`. */
export function overlapMs(spans: readonly Span[], start: number, end: number): number {
  return spans.reduce(
    (sum, s) => sum + Math.max(0, Math.min(end, s.end) - Math.max(start, s.start)),
    0,
  );
}

/** `spans` plus [start, end], merged and sorted, without the ones that ended before `since`. */
export function addSpan(spans: readonly Span[], start: number, end: number, since: number): Span[] {
  const all = [...spans, { start, end }]
    .filter((s) => s.end >= since)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of all) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/**
 * A local date covers at most from UTC−12 to UTC+14 around the same UTC date, so a beat whose
 * end lies outside that (plus an hour of slack) has a wrong date and is dropped.
 */
function plausibleDate(date: string, end: number): boolean {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  return end >= midnightUtc - 15 * HOUR_MS && end <= midnightUtc + 37 * HOUR_MS;
}

const minIso = (a: string | null, b: string) => (a && a < b ? a : b);
const maxIso = (a: string | null, b: string) => (a && a > b ? a : b);

/** Adds the beats to the totals. Returns how many seconds were newly counted. */
export async function recordActivity(
  ctx: Ctx,
  beats: ActivityBeat[],
  now = Date.now(),
): Promise<{ counted: number }> {
  const spans = beats
    .map((b) => {
      const end = now - b.ago * 1000;
      return { ...b, end, start: end - b.seconds * 1000 };
    })
    .filter((b) => plausibleDate(b.date, b.end))
    .sort((a, b) => a.end - b.end);
  if (!spans.length) return { counted: 0 };

  let counted = 0;
  await activity.record(ctx.userId, [...new Set(spans.map((b) => b.date))], (stored, days) => {
    counted = 0; // the transaction may run more than once
    const meta: Meta = structuredClone(stored ?? emptyMeta());
    const changed = new Map<string, Day>();
    const seen = new Set(meta.beatIds);

    for (const b of spans) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      meta.beatIds.push(b.id);

      const fresh = b.seconds * 1000 - overlapMs(meta.recent, b.start, b.end);
      meta.recent = addSpan(meta.recent, b.start, b.end, now - OVERLAP_WINDOW_MS);
      const day = changed.get(b.date) ?? structuredClone(days.get(b.date)) ?? null;
      const seconds = Math.min(Math.round(fresh / 1000), DAY_SECONDS - (day?.seconds ?? 0));
      if (seconds <= 0) continue;

      const startIso = new Date(b.start).toISOString();
      const endIso = new Date(b.end).toISOString();
      const month = (meta.months[b.date.slice(0, 7)] ??= { seconds: 0, days: 0 });
      const dayRecord: Day = day ?? {
        date: b.date,
        seconds: 0,
        sessions: 0,
        firstAt: startIso,
        lastAt: endIso,
      };
      if (!day) {
        meta.days += 1;
        month.days += 1;
      }

      // Join the session this stretch is within 30 minutes of (a late one, sent after a crash,
      // may belong to an earlier session), or start a new one.
      let session = meta.recentSessions.find(
        (s) => b.start <= s.lastAt + SESSION_GAP_MS && b.end >= s.startedAt - SESSION_GAP_MS,
      );
      if (session) {
        session.startedAt = Math.min(session.startedAt, b.start);
        session.lastAt = Math.max(session.lastAt, b.end);
        session.seconds += seconds;
      } else {
        session = { startedAt: b.start, lastAt: b.end, seconds };
        meta.recentSessions = [...meta.recentSessions, session]
          .sort((x, y) => x.lastAt - y.lastAt)
          .slice(-KEEP_SESSIONS);
        meta.sessions += 1;
        dayRecord.sessions += 1;
      }
      meta.longestSessionSeconds = Math.max(meta.longestSessionSeconds, session.seconds);

      dayRecord.seconds += seconds;
      dayRecord.firstAt = minIso(dayRecord.firstAt, startIso);
      dayRecord.lastAt = maxIso(dayRecord.lastAt, endIso);
      month.seconds += seconds;
      meta.totalSeconds += seconds;
      meta.firstActiveAt = minIso(meta.firstActiveAt, startIso);
      meta.lastActiveAt = maxIso(meta.lastActiveAt, endIso);
      changed.set(b.date, dayRecord);
      counted += seconds;
    }

    meta.beatIds = meta.beatIds.slice(-KEEP_BEAT_IDS);
    return { meta, days: [...changed.values()] };
  });
  return { counted };
}

export async function activityStats(ctx: Ctx): Promise<ActivityStats> {
  const m = (await activity.getMeta(ctx.userId)) ?? emptyMeta();
  return {
    totalSeconds: m.totalSeconds,
    days: m.days,
    sessions: m.sessions,
    longestSessionSeconds: m.longestSessionSeconds,
    firstActiveAt: m.firstActiveAt,
    lastActiveAt: m.lastActiveAt,
    months: Object.entries(m.months)
      .map(([month, t]) => ({ month, seconds: t.seconds, days: t.days }))
      .filter((t) => t.seconds > 0)
      .sort((a, b) => b.month.localeCompare(a.month)),
  };
}

/** Recomputes the totals from the day documents (the record they are kept in step with). */
export async function reconcileActivity(ctx: Ctx): Promise<void> {
  await activity.rebuild(ctx.userId, (stored, days) => {
    const meta: Meta = {
      ...(stored ?? emptyMeta()),
      totalSeconds: 0,
      days: 0,
      sessions: 0,
      months: {},
      firstActiveAt: null,
      lastActiveAt: null,
    };
    for (const d of days) {
      if (d.seconds <= 0) continue;
      const month = (meta.months[d.date.slice(0, 7)] ??= { seconds: 0, days: 0 });
      month.seconds += d.seconds;
      month.days += 1;
      meta.totalSeconds += d.seconds;
      meta.days += 1;
      meta.sessions += d.sessions;
      meta.firstActiveAt = minIso(meta.firstActiveAt, d.firstAt);
      meta.lastActiveAt = maxIso(meta.lastActiveAt, d.lastAt);
    }
    return meta;
  });
}
