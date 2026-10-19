import type { Task } from '../../../../shared/types';

/**
 * Two different ideas, kept apart on purpose:
 *  - dueDate:     a real deadline. Only these can be overdue.
 *  - plannedDate: "I'd like to work on this that day". Never overdue; carries over quietly.
 */

const PRIORITY_ORDER = { high: 0, low: 2, none: 1 } as const;
const byPriority = (a: Task, b: Task) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

export const isOverdue = (t: Task, today: string) => !!t.dueDate && t.dueDate < today;
export const isDueToday = (t: Task, today: string) => t.dueDate === today;

export function inToday(t: Task, today: string): boolean {
  return (!!t.dueDate && t.dueDate <= today) || (!!t.plannedDate && t.plannedDate <= today);
}

export function todayGroups(tasks: Task[], today: string) {
  const due = tasks
    .filter((t) => t.dueDate && t.dueDate <= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byPriority(a, b));
  const planned = tasks
    .filter((t) => !(t.dueDate && t.dueDate <= today) && t.plannedDate && t.plannedDate <= today)
    .sort((a, b) => byPriority(a, b) || a.createdAt.localeCompare(b.createdAt));
  return { due, planned };
}

/**
 * The order in which to do a set of open tasks, so the first is "the next action": deadlines
 * first (soonest first), then what's planned for today, then high priority, then planned
 * dates, then the order they were added (which is usually the order they were thought of).
 */
export function byNextAction(today: string) {
  const rank = (t: Task) =>
    t.dueDate ? 0 : t.plannedDate && t.plannedDate <= today ? 1 : t.priority === 'high' ? 2 : 3;
  return (a: Task, b: Task) =>
    rank(a) - rank(b) ||
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
    byPriority(a, b) ||
    (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') ||
    a.createdAt.localeCompare(b.createdAt);
}

/** Open tasks of each project, in next-action order. */
export function openByProject(tasks: Task[], today: string): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.status !== 'open' || !t.projectId) continue;
    map.set(t.projectId, [...(map.get(t.projectId) ?? []), t]);
  }
  for (const list of map.values()) list.sort(byNextAction(today));
  return map;
}

/** Future tasks grouped by their nearest date, plus undated ones ("Anytime"). */
export function upcomingGroups(tasks: Task[], today: string) {
  const byDate = new Map<string, Task[]>();
  const anytime: Task[] = [];
  for (const t of tasks) {
    if (inToday(t, today)) continue;
    const dates = [t.dueDate, t.plannedDate].filter((d): d is string => !!d && d > today);
    if (!dates.length) {
      anytime.push(t);
      continue;
    }
    const key = dates.sort()[0]!;
    byDate.set(key, [...(byDate.get(key) ?? []), t]);
  }
  return {
    dated: [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => [date, list.sort(byPriority)] as const),
    anytime: anytime.sort((a, b) => byPriority(a, b) || a.createdAt.localeCompare(b.createdAt)),
  };
}
