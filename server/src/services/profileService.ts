import type {
  ContentStat,
  ContentStatKey,
  NoteType,
  ProfileStats,
  WritingStat,
} from '../../../shared/types.js';
import * as stats from '../data/statsRepo.js';
import * as users from '../data/userRepo.js';
import { notFound } from '../lib/errors.js';
import { activityStats, reconcileActivity } from './activityService.js';
import type { Ctx } from './context.js';
import { ensureTextStats, WRITING_SOURCES } from './textStats.js';

/**
 * Lifetime statistics, read from the stored data itself: counts and text totals come from
 * aggregation queries over each collection, so they are never out of step with the content.
 */

/** Every kind of item, each counted once in the collection it lives in. */
const CONTENT: { key: ContentStatKey; collection: stats.StatCollection }[] = [
  { key: 'journal', collection: 'journal' },
  { key: 'writing', collection: 'writing' },
  { key: 'note', collection: 'notes' },
  { key: 'review', collection: 'reviews' },
  { key: 'moment', collection: 'moments' },
  { key: 'project', collection: 'projects' },
  { key: 'task', collection: 'tasks' },
  { key: 'book', collection: 'books' },
  { key: 'document', collection: 'documents' },
  { key: 'moneyIdea', collection: 'moneyIdeas' },
  { key: 'income', collection: 'income' },
  { key: 'expense', collection: 'expenses' },
  { key: 'subscription', collection: 'subscriptions' },
  { key: 'vault', collection: 'vault' },
];

/** Notes without a type are plain notes; the rest are counted by type. */
const TYPED_NOTES: NoteType[] = ['question', 'belief', 'quote', 'decision'];

export async function getProfile(ctx: Ctx): Promise<ProfileStats> {
  const uid = ctx.userId;
  await ensureTextStats(uid);

  const sumsFor = (c: stats.StatCollection) =>
    c === 'documents'
      ? ['size']
      : WRITING_SOURCES.some((s) => s.collection === c)
        ? ['textWords', 'textChars']
        : [];

  const [user, activity, totals, withText, typed, tasksDone, folders] = await Promise.all([
    users.findById(uid),
    activityStats(ctx),
    Promise.all(CONTENT.map((c) => stats.aggregate(uid, c.collection, sumsFor(c.collection)))),
    Promise.all(
      WRITING_SOURCES.map((s) => stats.countWhere(uid, s.collection, 'textChars', '>', 0)),
    ),
    Promise.all(TYPED_NOTES.map((t) => stats.countWhere(uid, 'notes', 'noteType', '==', t))),
    stats.countWhere(uid, 'tasks', 'status', '==', 'done'),
    stats.aggregate(uid, 'documentFolders'),
  ]);
  if (!user) throw notFound('Account not found');

  const totalOf = (c: stats.StatCollection) =>
    totals[CONTENT.findIndex((x) => x.collection === c)]!;
  const items: ContentStat[] = CONTENT.map((c, i) => ({ key: c.key, count: totals[i]!.count }));
  const notes = totalOf('notes').count;
  const typedTotal = typed.reduce((a, b) => a + b, 0);

  const writing: WritingStat[] = WRITING_SOURCES.map((s, i) => ({
    key: s.key,
    words: totalOf(s.collection).sums.textWords ?? 0,
    chars: totalOf(s.collection).sums.textChars ?? 0,
    items: withText[i]!,
  }));
  const entryKeys = new Set(WRITING_SOURCES.filter((s) => s.group === 'entries').map((s) => s.key));

  return {
    memberSince: user.createdAt,
    activity,
    content: {
      items,
      total: items.reduce((sum, c) => sum + c.count, 0),
      noteTypes: [
        { type: 'note' as NoteType, count: Math.max(0, notes - typedTotal) },
        ...TYPED_NOTES.map((type, i) => ({ type, count: typed[i]! })),
      ],
      tasksDone,
      documentBytes: totalOf('documents').sums.size ?? 0,
      folders: folders.count,
    },
    writing: {
      words: writing.reduce((sum, w) => sum + w.words, 0),
      chars: writing.reduce((sum, w) => sum + w.chars, 0),
      entries: writing.filter((w) => entryKeys.has(w.key)).reduce((sum, w) => sum + w.items, 0),
      items: writing,
    },
  };
}

/** Recounts every document's text and rebuilds the activity totals from the daily records. */
export async function recount(ctx: Ctx): Promise<ProfileStats> {
  await Promise.all([ensureTextStats(ctx.userId, true), reconcileActivity(ctx)]);
  return getProfile(ctx);
}
