import type { AddedItem, EntrySummary, HomeData, OnThisDayItem } from '../../../shared/types.js';
import * as books from '../data/bookRepo.js';
import * as documents from '../data/documentRepo.js';
import * as entries from '../data/entryRepo.js';
import * as projects from '../data/projectRepo.js';
import { inboxCount } from './captureService.js';
import type { Ctx } from './context.js';
import { folderNames } from './folderService.js';
import { recentEntries, toSummary } from './entryService.js';

/** Recently added books, documents and projects: a short, quiet list. */
async function recentlyAdded(ctx: Ctx, limit: number): Promise<AddedItem[]> {
  const [b, d, p] = await Promise.all([
    books.listRecent(ctx.userId, limit),
    documents.list(ctx.userId, limit),
    projects.listRecent(ctx.userId, limit),
  ]);
  const names = await folderNames(
    ctx.userId,
    d.items.map((x) => x.folderId),
  );
  return [
    ...b.map((x) => ({
      ref: { type: 'book' as const, id: x.id },
      title: x.title,
      subtitle: x.author,
      createdAt: x.createdAt,
    })),
    ...d.items.map((x) => ({
      ref: { type: 'document' as const, id: x.id },
      title: x.name,
      subtitle: (x.folderId && names.get(x.folderId)) || '',
      createdAt: x.createdAt,
    })),
    ...p.map((x) => ({
      ref: { type: 'project' as const, id: x.id },
      title: x.name,
      subtitle: '',
      createdAt: x.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Journal entries and notes from this calendar day in earlier years (not this year). */
async function onThisDay(ctx: Ctx, today: string): Promise<OnThisDayItem[]> {
  const monthDay = today.slice(5);
  const year = today.slice(0, 4);
  const [journal, notes] = await Promise.all([
    entries.listByMonthDay(ctx.userId, 'journal', monthDay),
    entries.listByMonthDay(ctx.userId, 'note', monthDay),
  ]);
  return [
    ...journal
      .filter((e) => e.date && e.date.slice(0, 4) < year)
      .map((e) => ({
        ref: { type: 'journal' as const, id: e.id },
        title: e.title,
        excerpt: e.excerpt,
        date: e.date!,
      })),
    ...notes
      .filter((n) => n.createdAt.slice(0, 4) < year)
      .map((n) => ({
        ref: { type: 'note' as const, id: n.id },
        title: n.title,
        excerpt: n.excerpt,
        date: n.createdAt.slice(0, 10),
      })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
}

/** Decisions whose revisit date has come and whose outcome isn't written yet. */
async function toRevisit(ctx: Ctx, today: string): Promise<EntrySummary[]> {
  return (await entries.listWhere(ctx.userId, 'note', 'noteType', 'decision'))
    .filter((d) => d.revisitOn && d.revisitOn <= today && !d.decided)
    .sort((a, b) => a.revisitOn!.localeCompare(b.revisitOn!))
    .slice(0, 3)
    .map((r) => toSummary('note', r));
}

/** Everything Home needs beyond tasks, prefs and income (which have their own cached queries). */
export async function getHome(
  ctx: Ctx,
  today = new Date().toISOString().slice(0, 10),
): Promise<HomeData> {
  const [recent, added, count, past, revisit] = await Promise.all([
    recentEntries(ctx, 5),
    recentlyAdded(ctx, 3),
    inboxCount(ctx),
    onThisDay(ctx, today),
    toRevisit(ctx, today),
  ]);
  return { recent, added, inboxCount: count, onThisDay: past, toRevisit: revisit };
}
