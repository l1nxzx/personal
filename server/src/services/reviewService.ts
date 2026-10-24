import type { WeekContext, WeeklyReview, WeeklyReviewAnswers } from '../../../shared/types.js';
import * as entries from '../data/entryRepo.js';
import * as expenses from '../data/expenseRepo.js';
import * as income from '../data/incomeRepo.js';
import * as reviews from '../data/reviewRepo.js';
import * as tasks from '../data/taskRepo.js';
import { badRequest } from '../lib/errors.js';
import { notifyChange, type Ctx } from './context.js';
import { textStatsOf } from './textStats.js';

const EMPTY: WeeklyReviewAnswers = {
  happened: '',
  learned: '',
  accomplished: '',
  work: '',
  focus: '',
};

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function assertMonday(weekStart: string) {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 1)
    throw badRequest('A week starts on a Monday');
}

const toReview = (r: reviews.ReviewRecord): WeeklyReview => ({
  ...r,
  answers: { ...EMPTY, ...r.answers },
});

/**
 * What the app already knows about a week, so the review can start from facts.
 * Times are compared as ISO strings; the week runs Monday 00:00 to the next Monday (UTC).
 */
export async function weekContext(ctx: Ctx, weekStart: string): Promise<WeekContext> {
  const end = addDays(weekStart, 7);
  const lastDay = addDays(weekStart, 6);
  const [done, journal, notes, inc, exp] = await Promise.all([
    tasks.listDoneBetween(ctx.userId, weekStart, end),
    entries.listJournal(ctx.userId, { limit: 50, from: weekStart, to: lastDay }),
    entries.listUpdatedBetween(ctx.userId, 'note', weekStart, end),
    income.list(ctx.userId, { limit: 200, from: weekStart, to: lastDay }),
    expenses.list(ctx.userId, { limit: 200, from: weekStart, to: lastDay }),
  ]);
  const sum = (rows: { amountMinor: number; currency: string; status?: string }[]) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      if (r.status === 'pending') return acc;
      acc[r.currency] = (acc[r.currency] ?? 0) + r.amountMinor;
      return acc;
    }, {});
  return {
    tasksDone: done.map((t) => ({ id: t.id, title: t.title })),
    journal: journal.items.map((e) => ({
      id: e.id,
      title: e.title || e.excerpt.slice(0, 60),
      date: e.date!,
    })),
    notes: notes
      .filter((n) => n.createdAt >= weekStart)
      .map((n) => ({
        id: n.id,
        title: n.title || n.excerpt.slice(0, 60),
        noteType: n.noteType ?? 'note',
      })),
    perspectives: notes
      .filter((n) => n.perspectives.some((p) => p.date >= weekStart && p.date <= lastDay))
      .map((n) => ({ noteId: n.id, title: n.title })),
    income: sum(inc.items),
    expenses: sum(exp.items),
  };
}

export async function getReview(
  ctx: Ctx,
  weekStart: string,
): Promise<{ review: WeeklyReview | null; context: WeekContext }> {
  assertMonday(weekStart);
  const [r, context] = await Promise.all([
    reviews.get(ctx.userId, weekStart),
    weekContext(ctx, weekStart),
  ]);
  return { review: r ? toReview(r) : null, context };
}

/** Saves whatever was answered; every question is optional. An all-empty review is removed. */
export async function saveReview(
  ctx: Ctx,
  weekStart: string,
  answers: Partial<WeeklyReviewAnswers>,
): Promise<WeeklyReview | null> {
  assertMonday(weekStart);
  const current = await reviews.get(ctx.userId, weekStart);
  const merged = { ...EMPTY, ...current?.answers, ...answers };
  notifyChange(ctx, 'review', weekStart);
  if (Object.values(merged).every((v) => !v.trim())) {
    if (current) await reviews.remove(ctx.userId, weekStart);
    return null;
  }
  const now = new Date().toISOString();
  const record = {
    weekStart,
    answers: merged,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    ...textStatsOf('review', { answers: merged }),
  };
  await reviews.save(ctx.userId, record);
  return toReview(record);
}

export async function listReviews(ctx: Ctx): Promise<WeeklyReview[]> {
  return (await reviews.list(ctx.userId, 200)).map(toReview);
}
