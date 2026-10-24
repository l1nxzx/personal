import type {
  CreateEntryRequest,
  DecisionMeta,
  Entry,
  EntryKind,
  EntryMeta,
  EntrySummary,
  NoteType,
  Page,
  Perspective,
  Source,
  TagCount,
  TopicCount,
  UpdateEntryRequest,
} from '../../../shared/types.js';
import * as entries from '../data/entryRepo.js';
import * as links from '../data/linkRepo.js';
import * as versions from '../data/versionRepo.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { buildSearchTerms, excerpt, normalizeTags, wordCount } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { textStatsOf } from './textStats.js';

const journalSortKey = (date: string, createdAt: string, id: string) =>
  `${date}|${createdAt}|${id}`;

export function normalizeTopic(topic: string | null | undefined): {
  topic: string | null;
  topicKey: string | null;
} {
  const t = topic?.trim().replace(/\s+/g, ' ').slice(0, 60);
  return t ? { topic: t, topicKey: t.toLowerCase() } : { topic: null, topicKey: null };
}

/** Uses the spelling a topic was first given, so "religion" files under an existing "Religion". */
async function canonicalTopic(ctx: Ctx, raw: string | null | undefined) {
  const t = normalizeTopic(raw);
  if (!t.topicKey) return t;
  const { labels } = await entries.topicCounts(ctx.userId);
  return { topic: labels[t.topicKey] ?? t.topic, topicKey: t.topicKey };
}

const cleanSources = (sources: Source[]): Source[] =>
  sources
    .map((s) => ({ id: s.id, label: s.label.trim(), url: s.url?.trim() || null }))
    .filter((s) => s.label || s.url)
    .slice(0, 50);

const latestDate = (ps: Perspective[]) =>
  ps.reduce<string | null>((max, p) => (!max || p.date > max ? p.date : max), null);

/** Version history: keep the stored text before overwriting it, at most every 30 minutes. */
const SNAPSHOT_EVERY_MS = 30 * 60 * 1000;
const shouldSnapshot = (current: entries.EntryRecord, next: { title?: string; body?: string }) =>
  current.body.trim().length > 0 &&
  ((next.body !== undefined && next.body !== current.body) ||
    (next.title !== undefined && next.title !== current.title)) &&
  Date.now() - Date.parse(current.lastSnapshotAt ?? current.createdAt) > SNAPSHOT_EVERY_MS;

function cleanDecision(d: DecisionMeta): DecisionMeta {
  return {
    madeOn: d.madeOn ?? null,
    reasons: d.reasons ?? '',
    expected: d.expected ?? '',
    revisitOn: d.revisitOn ?? null,
    outcome: d.outcome ?? '',
    outcomeOn: d.outcomeOn ?? null,
  };
}

/** Fields derived from the content, recomputed whenever it changes. */
function derived(
  kind: EntryKind,
  r: Pick<entries.EntryRecord, 'title' | 'body' | 'tags' | 'topic' | 'sources' | 'perspectives'> & {
    decision?: DecisionMeta | null;
  },
) {
  const d = r.decision;
  return {
    excerpt: excerpt(r.body),
    wordCount: wordCount(r.body),
    ...textStatsOf(kind, r),
    searchTerms: buildSearchTerms(
      r.title,
      r.body,
      r.tags.join(' '),
      r.topic ?? '',
      r.sources.map((s) => s.label).join(' '),
      r.perspectives
        .map((p) => `${p.position} ${p.reasons} ${p.influences} ${p.uncertainties}`)
        .join(' '),
      d ? `${d.reasons} ${d.expected} ${d.outcome}` : '',
    ),
  };
}

export const toSummary = (kind: EntryKind, r: entries.EntrySummaryRecord): EntrySummary => ({
  id: r.id,
  kind,
  title: r.title,
  excerpt: r.excerpt,
  date: r.date,
  tags: r.tags,
  pinned: r.pinned,
  archived: r.archived,
  wordCount: r.wordCount,
  rev: r.rev,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  note:
    kind === 'note'
      ? {
          noteType: r.noteType ?? 'note',
          topic: r.topic,
          lastConsidered: r.lastConsidered,
          revisitOn: r.revisitOn,
          decided: r.decided,
        }
      : null,
});

const toMeta = (kind: EntryKind, r: entries.EntryRecord): EntryMeta => {
  const { excerpt: _excerpt, note: _note, ...summary } = toSummary(kind, r);
  return {
    ...summary,
    note:
      kind === 'note'
        ? {
            noteType: r.noteType ?? 'note',
            topic: r.topic,
            sources: r.sources,
            perspectives: r.perspectives,
            decision: r.decision,
          }
        : null,
  };
};

export const toEntry = (kind: EntryKind, r: entries.EntryRecord): Entry => ({
  ...toMeta(kind, r),
  body: r.body,
});

export async function createEntry(
  ctx: Ctx,
  kind: EntryKind,
  input: CreateEntryRequest,
): Promise<Entry> {
  if (kind === 'journal' && !input.date) throw badRequest('Journal entries need a date');
  const id = entries.newId(ctx.userId, kind);
  const now = new Date().toISOString();
  const date = kind === 'journal' ? input.date! : null;
  const isNote = kind === 'note';

  const base = {
    title: input.title ?? '',
    body: input.body ?? '',
    tags: normalizeTags(input.tags ?? []),
    ...(isNote ? await canonicalTopic(ctx, input.topic) : { topic: null, topicKey: null }),
    sources: isNote ? cleanSources(input.sources ?? []) : [],
    perspectives: [] as Perspective[],
  };
  const record: entries.EntryRecord = {
    id,
    ...base,
    date,
    sortKey: date ? journalSortKey(date, now, id) : now,
    pinned: false,
    archived: false,
    rev: 1,
    createdAt: now,
    updatedAt: now,
    noteType: isNote ? (input.noteType ?? 'note') : null,
    lastConsidered: null,
    decision:
      isNote && input.noteType === 'decision'
        ? cleanDecision({ madeOn: null } as DecisionMeta)
        : null,
    revisitOn: null,
    decided: false,
    monthDay: date ? date.slice(5) : isNote ? now.slice(5, 10) : null,
    lastSnapshotAt: null,
    ...derived(kind, base),
  };
  await entries.create(ctx.userId, kind, record);
  notifyChange(ctx, kind, id);
  return toEntry(kind, record);
}

export async function getEntry(ctx: Ctx, kind: EntryKind, id: string): Promise<Entry> {
  const record = await entries.get(ctx.userId, kind, id);
  if (!record) throw notFound('This entry no longer exists');
  return toEntry(kind, record);
}

/**
 * Three kinds of change:
 * - content (title, body, date, tags): bumps rev (edit-conflict detection) and updatedAt
 * - note details (type, topic, sources, perspectives): updatedAt only, so they never conflict
 *   with the text being edited in an open editor
 * - flags (pinned, archived): neither
 */
export function updateEntry(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  input: UpdateEntryRequest,
): Promise<EntryMeta> {
  const content = [input.title, input.body, input.date, input.tags].some((v) => v !== undefined);
  if (kind === 'note' && input.topic) {
    return canonicalTopic(ctx, input.topic).then(({ topic }) =>
      updateEntryWith(ctx, kind, id, input.rev ?? null, () => ({ ...input, topic }), content),
    );
  }
  return updateEntryWith(ctx, kind, id, input.rev ?? null, () => input, content);
}

/** `makeInput` runs inside the transaction, so it can build on the stored entry atomically. */
async function updateEntryWith(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  expectedRev: number | null,
  makeInput: (current: entries.EntryRecord) => UpdateEntryRequest,
  contentChange = true,
): Promise<EntryMeta> {
  const result = await entries.update(
    ctx.userId,
    kind,
    id,
    expectedRev,
    (current) => {
      const input = makeInput(current);
      const flags = {
        pinned: input.pinned ?? current.pinned,
        archived: input.archived ?? current.archived,
      };
      const noteChange =
        kind === 'note' &&
        [input.noteType, input.topic, input.sources, input.perspectives, input.decision].some(
          (v) => v !== undefined,
        );
      if (!contentChange && !noteChange) return flags;
      const decision =
        kind === 'note' && input.decision !== undefined
          ? input.decision && cleanDecision(input.decision)
          : current.decision;

      const date = kind === 'journal' ? (input.date ?? current.date) : null;
      const next = {
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        tags: input.tags ? normalizeTags(input.tags) : current.tags,
        ...(kind === 'note' && input.topic !== undefined
          ? normalizeTopic(input.topic)
          : { topic: current.topic, topicKey: current.topicKey }),
        sources: kind === 'note' && input.sources ? cleanSources(input.sources) : current.sources,
        perspectives:
          kind === 'note' && input.perspectives ? input.perspectives : current.perspectives,
      };
      return {
        ...next,
        date,
        ...(date &&
          date !== current.date && {
            sortKey: journalSortKey(date, current.createdAt, id),
            monthDay: date.slice(5),
          }),
        ...(kind === 'note' && {
          noteType: (input.noteType ?? current.noteType ?? 'note') as NoteType,
          lastConsidered: latestDate(next.perspectives),
          decision,
          revisitOn: decision?.revisitOn ?? null,
          decided: !!decision?.outcome.trim(),
        }),
        ...flags,
        updatedAt: new Date().toISOString(),
        ...derived(kind, { ...next, decision }),
      };
    },
    contentChange,
    // Only text edits make versions; note details and flags never do.
    (current) => contentChange && shouldSnapshot(current, makeInput(current)),
  );

  if (result.status === 'missing') throw notFound('This entry no longer exists');
  if (result.status === 'conflict') {
    throw new AppError(409, 'EDIT_CONFLICT', 'This entry was changed somewhere else', {
      current: toEntry(kind, result.current),
    });
  }
  notifyChange(ctx, kind, id);
  return toMeta(kind, result.record);
}

export async function deleteEntry(ctx: Ctx, kind: EntryKind, id: string): Promise<void> {
  if (!(await entries.remove(ctx.userId, kind, id))) throw notFound('This entry no longer exists');
  await Promise.all([
    links.removeAllFor(ctx.userId, `${kind}:${id}`),
    versions.removeAllFor(ctx.userId, id),
  ]);
  notifyChange(ctx, kind, id);
}

export async function listJournal(
  ctx: Ctx,
  opts: { limit: number; cursor?: string; from?: string; to?: string; tag?: string },
): Promise<Page<EntrySummary>> {
  if (opts.tag) {
    // Tag filter: equality query, then date filtering and ordering in memory.
    const items = (await entries.listWhere(ctx.userId, 'journal', 'tags', opts.tag))
      .filter((r) => (!opts.from || r.date! >= opts.from) && (!opts.to || r.date! <= opts.to))
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return { items: items.map((r) => toSummary('journal', r)), nextCursor: null };
  }
  const page = await entries.listJournal(ctx.userId, opts);
  return { items: page.items.map((r) => toSummary('journal', r)), nextCursor: page.nextCursor };
}

const pinnedThenRecent = (a: entries.EntrySummaryRecord, b: entries.EntrySummaryRecord) =>
  Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt);

/** Pinned first, then most recently edited. */
export async function listWritings(
  ctx: Ctx,
  opts: { archived: boolean; tag?: string },
): Promise<EntrySummary[]> {
  const records = opts.tag
    ? (await entries.listWhere(ctx.userId, 'writing', 'tags', opts.tag)).filter(
        (r) => r.archived === opts.archived,
      )
    : await entries.listWhere(ctx.userId, 'writing', 'archived', opts.archived);
  return records.sort(pinnedThenRecent).map((r) => toSummary('writing', r));
}

/**
 * Knowledge notes. One equality query on the most specific filter (topic > type > tag),
 * the other filters applied in memory; without filters, paginated by last edit.
 */
export async function listNotes(
  ctx: Ctx,
  opts: { topic?: string; type?: NoteType; tag?: string; limit: number; cursor?: string },
): Promise<Page<EntrySummary>> {
  const topicKey = normalizeTopic(opts.topic).topicKey;
  if (!topicKey && !opts.type && !opts.tag) {
    const page = await entries.listByUpdated(ctx.userId, 'note', opts);
    return { items: page.items.map((r) => toSummary('note', r)), nextCursor: page.nextCursor };
  }
  const records = topicKey
    ? await entries.listWhere(ctx.userId, 'note', 'topicKey', topicKey)
    : opts.type
      ? await entries.listWhere(ctx.userId, 'note', 'noteType', opts.type)
      : await entries.listWhere(ctx.userId, 'note', 'tags', opts.tag!);
  const items = records
    .filter(
      (r) =>
        (!opts.type || (r.noteType ?? 'note') === opts.type) &&
        (!opts.tag || r.tags.includes(opts.tag)),
    )
    .sort(pinnedThenRecent)
    .map((r) => toSummary('note', r));
  return { items, nextCursor: null };
}

export async function listTags(ctx: Ctx, kind: EntryKind): Promise<TagCount[]> {
  const counts = await entries.tagCounts(ctx.userId, kind);
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function listTopics(ctx: Ctx): Promise<TopicCount[]> {
  const { counts, labels } = await entries.topicCounts(ctx.userId);
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ topic: labels[key] ?? key, count }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

export async function recentEntries(ctx: Ctx, limit: number): Promise<EntrySummary[]> {
  const kinds: EntryKind[] = ['journal', 'writing', 'note'];
  const lists = await Promise.all(kinds.map((k) => entries.listRecent(ctx.userId, k, limit)));
  return lists
    .flatMap((list, i) => list.filter((r) => !r.archived).map((r) => toSummary(kinds[i]!, r)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/**
 * Adds text to the most recent journal entry of `date` (with a small time stamp),
 * or starts that day's entry. Used by Quick Capture.
 */
export async function appendToJournalDay(
  ctx: Ctx,
  date: string,
  time: string,
  text: string,
): Promise<string> {
  const sameDay = (await entries.listByDate(ctx.userId, date)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const target = sameDay[0];
  if (!target) return (await createEntry(ctx, 'journal', { date, body: text })).id;

  await updateEntryWith(ctx, 'journal', target.id, null, (current) => ({
    body: current.body.trim() ? `${current.body.trimEnd()}\n\n*${time}* — ${text}` : text,
  }));
  return target.id;
}
