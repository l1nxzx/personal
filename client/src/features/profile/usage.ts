import type {
  ActionCount,
  ActivityStats,
  UsageAction,
  UsageDay,
  UsageSection,
} from '../../../../shared/types';
import { addDays, daysBetween, parseLocalDate, toLocalDate } from '../../lib/dates';

/**
 * The usage history's arithmetic, kept apart from the page so the rules are in one place:
 * periods by the device's local dates (weeks start on Monday), totals as plain sums of the
 * recorded days, and comparisons only where the earlier period was fully recorded.
 */

export type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last7'
  | 'last30'
  | 'all';

export interface Period {
  key: PeriodKey;
  label: string;
  /** Inclusive local dates; null for all time. */
  from: string | null;
  to: string | null;
  /** The equivalent period before it (the same days of the week or month when partial). */
  prev: { from: string; to: string; label: string } | null;
  /** A percentage against `prev` is fair (both equally long and equally complete). */
  comparable: boolean;
}

export const PERIOD_KEYS: PeriodKey[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'last7',
  'last30',
  'all',
];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  all: 'All time',
};

/** Monday of the week `date` is in. */
export const mondayOf = (date: string) => addDays(date, -((parseLocalDate(date).getDay() + 6) % 7));
const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const lastOfMonth = (date: string) => {
  const d = parseLocalDate(firstOfMonth(date));
  return toLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const monthBefore = (date: string) => addDays(firstOfMonth(date), -1);
/** The same day of an earlier month, or its last day if that month is shorter. */
const sameDayIn = (month: string, day: string) => {
  const last = lastOfMonth(month);
  return `${month.slice(0, 8)}${String(Math.min(Number(day.slice(8)), Number(last.slice(8)))).padStart(2, '0')}`;
};

export function periodOf(key: PeriodKey, today: string): Period {
  const label = PERIOD_LABELS[key];
  const span = (from: string, to: string, prevFrom: string, prevTo: string, prevLabel: string) => ({
    key,
    label,
    from,
    to,
    prev: { from: prevFrom, to: prevTo, label: prevLabel },
  });
  const yesterday = addDays(today, -1);
  switch (key) {
    case 'today':
      // Today isn't over, so yesterday is shown beside it, not compared.
      return { ...span(today, today, yesterday, yesterday, 'yesterday'), comparable: false };
    case 'yesterday':
      return {
        ...span(yesterday, yesterday, addDays(today, -2), addDays(today, -2), 'the day before'),
        comparable: true,
      };
    case 'thisWeek': {
      const mon = mondayOf(today);
      return {
        ...span(mon, today, addDays(mon, -7), addDays(today, -7), 'the same days last week'),
        comparable: true,
      };
    }
    case 'lastWeek': {
      const mon = addDays(mondayOf(today), -7);
      return {
        ...span(mon, addDays(mon, 6), addDays(mon, -7), addDays(mon, -1), 'the week before'),
        comparable: true,
      };
    }
    case 'thisMonth': {
      const prevMonth = firstOfMonth(monthBefore(today));
      return {
        ...span(
          firstOfMonth(today),
          today,
          prevMonth,
          sameDayIn(prevMonth, today),
          'the same days last month',
        ),
        comparable: true,
      };
    }
    case 'lastMonth': {
      const last = monthBefore(today);
      const before = monthBefore(last);
      return {
        ...span(firstOfMonth(last), last, firstOfMonth(before), before, 'the month before'),
        // Months differ in length by up to three days; close enough to compare.
        comparable: true,
      };
    }
    case 'last7':
      return {
        ...span(
          addDays(today, -6),
          today,
          addDays(today, -13),
          addDays(today, -7),
          'the 7 days before',
        ),
        comparable: true,
      };
    case 'last30':
      return {
        ...span(
          addDays(today, -29),
          today,
          addDays(today, -59),
          addDays(today, -30),
          'the 30 days before',
        ),
        comparable: true,
      };
    case 'all':
      return { key, label, from: null, to: null, prev: null, comparable: false };
  }
}

/** Weeks shown in the week-by-week summary and the section trends. */
export const WEEKS = 12;

/** One request covers every period (and the one before it) and the last `WEEKS` weeks. */
export function usageWindow(today: string): { from: string; to: string } {
  const starts = PERIOD_KEYS.flatMap((k) => {
    const p = periodOf(k, today);
    return [p.from, p.prev?.from].filter((d): d is string => !!d);
  });
  starts.push(addDays(mondayOf(today), -7 * (WEEKS - 1)));
  return { from: starts.sort()[0]!, to: today };
}

export interface Totals {
  seconds: number;
  /** Time recorded with a section (time from before section tracking has none). */
  sectionSeconds: number;
  sessions: number;
  activeDays: number;
  visits: number;
  sections: Map<UsageSection, { seconds: number; visits: number }>;
  actions: Map<UsageAction, number>;
}

const emptyTotals = (): Totals => ({
  seconds: 0,
  sectionSeconds: 0,
  sessions: 0,
  activeDays: 0,
  visits: 0,
  sections: new Map(),
  actions: new Map(),
});

/** Plain sums of the recorded days from `from` to `to`. */
export function totalsOf(days: UsageDay[], from: string, to: string): Totals {
  const t = emptyTotals();
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    t.seconds += d.seconds;
    t.sessions += d.sessions;
    if (d.seconds > 0) t.activeDays += 1;
    for (const s of d.sections) {
      const cur = t.sections.get(s.section) ?? { seconds: 0, visits: 0 };
      cur.seconds += s.seconds;
      cur.visits += s.visits;
      t.sections.set(s.section, cur);
      t.sectionSeconds += s.seconds;
      t.visits += s.visits;
    }
    addActions(t.actions, d.actions);
  }
  return t;
}

function addActions(into: Map<UsageAction, number>, list: ActionCount[]) {
  for (const a of list) into.set(a.action, (into.get(a.action) ?? 0) + a.count);
}

/** All-time totals, from the running totals (no day records needed). */
export function allTimeTotals(a: ActivityStats): Totals {
  const t = emptyTotals();
  t.seconds = a.totalSeconds;
  t.sessions = a.sessions;
  t.activeDays = a.days;
  for (const s of a.sections) {
    t.sections.set(s.section, { seconds: s.seconds, visits: s.visits });
    t.sectionSeconds += s.seconds;
    t.visits += s.visits;
  }
  addActions(t.actions, a.actions);
  return t;
}

/** Every date from `from` to `to` with its recorded seconds (0 when nothing was recorded). */
export function dailySeries(days: UsageDay[], from: string, to: string) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => {
    const date = addDays(from, i);
    const d = byDate.get(date);
    return { date, seconds: d?.seconds ?? 0, sessions: d?.sessions ?? 0, day: d ?? null };
  });
}

/** The last `WEEKS` weeks, oldest first, Monday to Sunday (the current one so far). */
export function weekSeries(days: UsageDay[], today: string) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: WEEKS }, (_, i) => {
    const from = addDays(thisMonday, -7 * (WEEKS - 1 - i));
    const to = addDays(from, 6);
    return { from, to, current: from === thisMonday, totals: totalsOf(days, from, to) };
  });
}

/**
 * Whether a period was recorded from its first day: `since` is when the relevant recording
 * began (an ISO time), compared by this device's local date.
 */
export const recordedThroughout = (from: string, since: string | null) =>
  !!since && toLocalDate(new Date(since)) <= from;

/** "+12%", "−40%", "new", or null when there is nothing to compare. */
export function change(now: number, before: number): string | null {
  if (before <= 0) return now > 0 ? 'new' : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'same';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

export interface ActionInfo {
  label: string;
  /** In a section's one-line summary: "3 created · 5 edited". */
  short: string;
  /** Where it is done; null for what happens anywhere (links). */
  section: UsageSection | null;
}

/** In the order of the navigation, creating before changing. */
export const ACTIONS: Record<UsageAction, ActionInfo> = {
  'capture.created': { label: 'Quick captures', short: 'captured', section: 'inbox' },
  'capture.filed': { label: 'Inbox items filed', short: 'filed', section: 'inbox' },
  'journal.created': { label: 'Journal entries started', short: 'started', section: 'journal' },
  'journal.edited': { label: 'Journal entries edited', short: 'edited', section: 'journal' },
  'writing.created': { label: 'Writings started', short: 'started', section: 'writing' },
  'writing.edited': { label: 'Writings edited', short: 'edited', section: 'writing' },
  'review.created': { label: 'Weekly reviews written', short: 'written', section: 'reviews' },
  'review.edited': { label: 'Weekly reviews revised', short: 'revised', section: 'reviews' },
  'moment.created': { label: 'Timeline moments added', short: 'added', section: 'timeline' },
  'note.created': { label: 'Notes created', short: 'created', section: 'ideas' },
  'note.edited': { label: 'Notes edited', short: 'edited', section: 'ideas' },
  'income.created': { label: 'Income records added', short: 'added', section: 'money' },
  'expense.created': { label: 'Expenses recorded', short: 'recorded', section: 'expenses' },
  'subscription.created': {
    label: 'Subscriptions added',
    short: 'subscriptions',
    section: 'expenses',
  },
  'subscription.paid': { label: 'Subscription payments noted', short: 'paid', section: 'expenses' },
  'moneyIdea.created': { label: 'Money-making ideas added', short: 'added', section: 'moneyIdeas' },
  'moneyIdea.edited': {
    label: 'Money-making ideas updated',
    short: 'updated',
    section: 'moneyIdeas',
  },
  'task.created': { label: 'Tasks added', short: 'added', section: 'tasks' },
  'task.completed': { label: 'Tasks completed', short: 'completed', section: 'tasks' },
  'project.created': { label: 'Projects created', short: 'created', section: 'projects' },
  'project.edited': { label: 'Projects updated', short: 'updated', section: 'projects' },
  'book.created': { label: 'Books added', short: 'added', section: 'library' },
  'book.edited': { label: 'Books updated', short: 'updated', section: 'library' },
  'document.uploaded': { label: 'Files uploaded', short: 'uploaded', section: 'documents' },
  'folder.created': { label: 'Folders created', short: 'folders', section: 'documents' },
  'document.organized': {
    label: 'Files and folders organised',
    short: 'organised',
    section: 'documents',
  },
  'vault.created': { label: 'Vault items added', short: 'added', section: 'vault' },
  'vault.edited': { label: 'Vault items changed', short: 'changed', section: 'vault' },
  'link.created': { label: 'Links made by hand', short: 'links', section: null },
};

export const ACTION_ORDER = Object.keys(ACTIONS) as UsageAction[];
