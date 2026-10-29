import type {
  ActivityBeat,
  ActivityStats,
  ActionCount,
  UsageAction,
  UsageDay,
  UsageRange,
  UsageSection,
} from '../../../shared/types.js';
import * as activity from '../data/activityRepo.js';
import { logger } from '../lib/logger.js';
import type { Ctx } from './context.js';

// Written as records so the compiler checks that every section and action is listed.
const SECTION_KEYS: Record<UsageSection, true> = {
  home: true,
  inbox: true,
  journal: true,
  writing: true,
  thinking: true,
  reviews: true,
  timeline: true,
  ideas: true,
  money: true,
  expenses: true,
  moneyIdeas: true,
  tasks: true,
  projects: true,
  library: true,
  documents: true,
  vault: true,
  profile: true,
  settings: true,
  other: true,
};
const ACTION_KEYS: Record<UsageAction, true> = {
  'capture.created': true,
  'capture.filed': true,
  'journal.created': true,
  'journal.edited': true,
  'writing.created': true,
  'writing.edited': true,
  'note.created': true,
  'note.edited': true,
  'review.created': true,
  'review.edited': true,
  'moment.created': true,
  'project.created': true,
  'project.edited': true,
  'task.created': true,
  'task.completed': true,
  'book.created': true,
  'book.edited': true,
  'document.uploaded': true,
  'document.organized': true,
  'folder.created': true,
  'income.created': true,
  'expense.created': true,
  'subscription.created': true,
  'subscription.paid': true,
  'moneyIdea.created': true,
  'moneyIdea.edited': true,
  'vault.created': true,
  'vault.edited': true,
  'link.created': true,
};
/** Every section time can be recorded for (see `client/src/lib/sections.ts`). */
export const USAGE_SECTIONS = Object.keys(SECTION_KEYS) as [UsageSection, ...UsageSection[]];
/** Every action that is counted (see `UsageAction`). */
export const USAGE_ACTIONS = Object.keys(ACTION_KEYS) as [UsageAction, ...UsageAction[]];

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
  sections: {},
  sectionsSince: null,
  actions: {},
  recentSessions: [],
  recent: [],
  beatIds: [],
});

const newDay = (date: string, startIso: string, endIso: string): Day => ({
  date,
  seconds: 0,
  sessions: 0,
  firstAt: startIso,
  lastAt: endIso,
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
      const dayRecord: Day = day ?? newDay(b.date, startIso, endIso);
      // A day only becomes an active day with its first time (it may hold only actions so far).
      if (!dayRecord.seconds) {
        meta.days += 1;
        month.days += 1;
        dayRecord.firstAt = startIso;
        dayRecord.lastAt = endIso;
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

      if (b.section) {
        // A visit counts once its first stretch counts (not one wholly overlapping another tab).
        const visits = b.visit ? 1 : 0;
        const daySection = ((dayRecord.sections ??= {})[b.section] ??= {
          seconds: 0,
          visits: 0,
          lastAt: endIso,
        });
        daySection.seconds += seconds;
        daySection.visits += visits;
        daySection.lastAt = maxIso(daySection.lastAt, endIso);
        const total = ((meta.sections ??= {})[b.section] ??= {
          seconds: 0,
          visits: 0,
          lastAt: endIso,
        });
        total.seconds += seconds;
        total.visits += visits;
        total.lastAt = maxIso(total.lastAt, endIso);
        const monthSection = ((month.sections ??= {})[b.section] ??= { seconds: 0, visits: 0 });
        monthSection.seconds += seconds;
        monthSection.visits += visits;
        meta.sectionsSince = minIso(meta.sectionsSince ?? null, startIso);
      }

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
      .map(([month, t]) => ({
        month,
        seconds: t.seconds,
        days: t.days,
        sections: sectionList(t.sections),
        actions: actionList(t.actions),
      }))
      .filter((t) => t.seconds > 0 || t.actions.length > 0)
      .sort((a, b) => b.month.localeCompare(a.month)),
    sections: Object.entries(m.sections ?? {})
      .filter(([key, t]) => isSection(key) && t.seconds > 0)
      .map(([key, t]) => ({
        section: key as UsageSection,
        seconds: t.seconds,
        visits: t.visits,
        lastAt: t.lastAt ?? null,
      }))
      .sort((a, b) => b.seconds - a.seconds),
    sectionsSince: m.sectionsSince ?? null,
    actions: actionList(m.actions),
  };
}

const isSection = (key: string): key is UsageSection => Object.hasOwn(SECTION_KEYS, key);
const isAction = (key: string): key is UsageAction => Object.hasOwn(ACTION_KEYS, key);

function sectionList(sections: Record<string, { seconds: number; visits: number }> | undefined) {
  return Object.entries(sections ?? {})
    .filter(([key, t]) => isSection(key) && t.seconds > 0)
    .map(([key, t]) => ({ section: key as UsageSection, seconds: t.seconds, visits: t.visits }))
    .sort((a, b) => b.seconds - a.seconds);
}

function actionList(actions: Record<string, number> | undefined): ActionCount[] {
  return Object.entries(actions ?? {})
    .filter(([key, n]) => isAction(key) && n > 0)
    .map(([key, n]) => ({ action: key as UsageAction, count: n }));
}

const toUsageDay = (d: Day): UsageDay => ({
  date: d.date,
  seconds: d.seconds,
  sessions: d.sessions,
  sections: sectionList(d.sections),
  actions: actionList(
    Object.fromEntries(Object.entries(d.actions ?? {}).map(([k, ids]) => [k, ids.length])),
  ),
});

/** Longest range one request may ask for (about a year and a month). */
export const MAX_RANGE_DAYS = 400;

/** Every recorded day from `from` to `to` (local dates), oldest first. */
export async function usageRange(ctx: Ctx, from: string, to: string): Promise<UsageRange> {
  const days = await activity.listDays(ctx.userId, from, to);
  return {
    from,
    to,
    days: days
      .filter((d) => d.seconds > 0 || Object.keys(d.actions ?? {}).length > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(toUsageDay),
  };
}

// ---------------------------------------------------------------- actions

/**
 * Items already counted for an action on a day by this server process, so the autosave of an
 * open entry (a save every second or two) costs one write a day, not one per save. Losing it
 * on a restart only costs a read: the stored ids decide what counts.
 */
const counted = new Set<string>();
const COUNTED_LIMIT = 20_000;

/** The person's local date for an action: from the request, else the server's UTC date. */
export const actionDate = (ctx: Ctx, now = new Date()) =>
  ctx.localDate ?? now.toISOString().slice(0, 10);

const CREATED_OF: Partial<Record<UsageAction, UsageAction>> = {
  'journal.edited': 'journal.created',
  'writing.edited': 'writing.created',
  'note.edited': 'note.created',
  'review.edited': 'review.created',
  'project.edited': 'project.created',
  'book.edited': 'book.created',
  'moneyIdea.edited': 'moneyIdea.created',
  'vault.edited': 'vault.created',
};

/**
 * Counts an action done to `ids` once it has succeeded. An item counts once per action per
 * day, and an edit on the day an item was created counts only as creating it. Never throws:
 * a failure to count must not fail what was done.
 */
export async function recordAction(
  ctx: Ctx,
  action: UsageAction,
  ids: string | string[],
  now = new Date(),
): Promise<void> {
  const date = actionDate(ctx, now);
  const keyOf = (id: string) => `${ctx.userId}|${date}|${action}|${id}`;
  const fresh = [...new Set(Array.isArray(ids) ? ids : [ids])].filter(
    (id) => id && !counted.has(keyOf(id)),
  );
  if (!fresh.length) return;
  const created = CREATED_OF[action];
  const iso = now.toISOString();

  try {
    await activity.record(ctx.userId, [date], (stored, days) => {
      const day: Day = structuredClone(days.get(date)) ?? newDay(date, iso, iso);
      const done = new Set(day.actions?.[action] ?? []);
      const skip = new Set(created ? (day.actions?.[created] ?? []) : []);
      const added = fresh.filter((id) => !done.has(id) && !skip.has(id));
      if (!added.length) return null;

      const meta: Meta = structuredClone(stored ?? emptyMeta());
      (day.actions ??= {})[action] = [...done, ...added];
      const month = (meta.months[date.slice(0, 7)] ??= { seconds: 0, days: 0 });
      (month.actions ??= {})[action] = (month.actions[action] ?? 0) + added.length;
      (meta.actions ??= {})[action] = (meta.actions[action] ?? 0) + added.length;
      return { meta, days: [day] };
    });
    if (counted.size > COUNTED_LIMIT) counted.clear();
    fresh.forEach((id) => counted.add(keyOf(id)));
  } catch (err) {
    logger.warn({ err, action }, 'usage: action not counted');
  }
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
      sections: {},
      // When section time began can't be read from the days exactly; keep it once known.
      sectionsSince: stored?.sectionsSince ?? null,
      actions: {},
      firstActiveAt: null,
      lastActiveAt: null,
    };
    const knownSince = !!meta.sectionsSince;
    for (const d of days) {
      const month = (meta.months[d.date.slice(0, 7)] ??= { seconds: 0, days: 0 });
      for (const [action, ids] of Object.entries(d.actions ?? {})) {
        (month.actions ??= {})[action] = (month.actions[action] ?? 0) + ids.length;
        meta.actions![action] = (meta.actions![action] ?? 0) + ids.length;
      }
      if (d.seconds <= 0) continue;
      for (const [section, t] of Object.entries(d.sections ?? {})) {
        const total = (meta.sections![section] ??= { seconds: 0, visits: 0, lastAt: t.lastAt });
        total.seconds += t.seconds;
        total.visits += t.visits;
        total.lastAt = maxIso(total.lastAt, t.lastAt);
        const m = ((month.sections ??= {})[section] ??= { seconds: 0, visits: 0 });
        m.seconds += t.seconds;
        m.visits += t.visits;
        if (!knownSince) meta.sectionsSince = minIso(meta.sectionsSince ?? null, d.firstAt);
      }
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
