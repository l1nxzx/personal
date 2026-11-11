import type {
  CreateEntryRequest,
  DecisionMeta,
  Entry,
  EntryKind,
  EntryMeta,
  EntrySummary,
  LockEntryRequest,
  ResealEntryRequest,
  NoteType,
  Page,
  Perspective,
  Source,
  TagCount,
  TopicCount,
  UnlockEntryRequest,
  UpdateEntryRequest,
} from '../../../shared/types.js';
import * as entries from '../data/entryRepo.js';
import * as links from '../data/linkRepo.js';
import * as versions from '../data/versionRepo.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { buildSearchTerms, excerpt, normalizeTags, wordCount } from '../lib/text.js';
import { anchorKeys } from '../lib/anchors.js';
import { syncTextLinks } from './linkService.js';
import { notifyChange, type Ctx } from './context.js';
import { textStatsOf } from './textStats.js';
import { recordAction } from './activityService.js';

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
const shouldSnapshot = (
  current: entries.EntryRecord,
  next: { title?: string; body?: string; sealed?: unknown },
) =>
  (current.locked ? !!current.sealed : current.body.trim().length > 0) &&
  ((next.body !== undefined && next.body !== current.body) ||
    (next.sealed !== undefined && next.sealed !== current.sealed) ||
    (next.title !== undefined && next.title !== current.title)) &&
  Date.now() - Date.parse(current.lastSnapshotAt ?? current.createdAt) > SNAPSHOT_EVERY_MS;

/** Only journal entries and writings can be locked. */
function assertLockable(kind: EntryKind) {
  if (kind === 'note') throw badRequest('Only journal entries and writings can be locked');
}

/**
 * A locked entry's searchable and listed fields: the title only. Its text, tags and word count
 * exist only inside `sealed`, so nothing derived from them is stored readable either.
 */
function lockedDerived(kind: EntryKind, title: string) {
  return {
    excerpt: '',
    wordCount: 0,
    ...textStatsOf(kind, { body: '', perspectives: [], decision: null }),
    searchTerms: buildSearchTerms(title),
  };
}

/** Link keys as Markdown, so the text-link sync can work from a locked entry's anchors. */
const anchorText = (anchors: string[]) =>
  anchors
    .map((k) => k.split(':'))
    .map(([type, id]) => `[](${type === 'document' ? 'doc' : 'folder'}:${id})`)
    .join(' ');
const linkTextOf = (r: Pick<entries.EntryRecord, 'locked' | 'anchors' | 'body'>) =>
  r.locked ? anchorText(r.anchors) : r.body;

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
  // A belief is about where you stand: lists show the latest position before any notes.
  const stand = [...r.perspectives].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return {
    excerpt: excerpt(stand?.position.trim() ? stand.position : r.body),
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
  locked: r.locked,
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
    sealed: r.sealed,
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
  const locked = !!input.sealed;
  if (locked) {
    assertLockable(kind);
    if (input.body || input.tags?.length)
      throw badRequest('A locked entry is sent encrypted, without readable text or tags');
  }
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
    perspectives:
      isNote && input.noteType === 'belief' ? (input.perspectives ?? []) : ([] as Perspective[]),
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
    lastConsidered: latestDate(base.perspectives),
    decision:
      isNote && input.noteType === 'decision'
        ? cleanDecision({ madeOn: null } as DecisionMeta)
        : null,
    revisitOn: null,
    decided: false,
    monthDay: date ? date.slice(5) : isNote ? now.slice(5, 10) : null,
    lastSnapshotAt: null,
    locked,
    sealed: input.sealed ?? null,
    anchors: locked ? (input.anchors ?? []) : [],
    ...(locked ? lockedDerived(kind, base.title) : derived(kind, base)),
  };
  await entries.create(ctx.userId, kind, record);
  notifyChange(ctx, kind, id);
  const linkText = linkTextOf(record);
  if (anchorKeys(linkText).size) await syncTextLinks(ctx, { type: kind, id }, linkText);
  // Encrypted entries leave no trace in usage statistics (like the vault).
  if (!locked) await recordAction(ctx, `${kind}.created`, id);
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
export async function updateEntry(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  input: UpdateEntryRequest,
): Promise<EntryMeta> {
  const content = [input.title, input.body, input.date, input.tags, input.sealed].some(
    (v) => v !== undefined,
  );
  const details =
    kind === 'note' &&
    [input.noteType, input.topic, input.sources, input.perspectives, input.decision].some(
      (v) => v !== undefined,
    );
  const meta =
    kind === 'note' && input.topic
      ? await canonicalTopic(ctx, input.topic).then(({ topic }) =>
          updateEntryWith(ctx, kind, id, input.rev ?? null, () => ({ ...input, topic }), content),
        )
      : await updateEntryWith(ctx, kind, id, input.rev ?? null, () => input, content);
  // Pinning and archiving are not editing.
  if ((content || details) && !meta.locked) await recordAction(ctx, `${kind}.edited`, id);
  return meta;
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
  let bodyBefore: string | null = null;
  const withBefore = (current: entries.EntryRecord) => {
    bodyBefore = linkTextOf(current);
    return makeInput(current);
  };
  const result = await entries.update(
    ctx.userId,
    kind,
    id,
    expectedRev,
    (current) => {
      const input = withBefore(current);
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
      if (current.locked) {
        if (input.body !== undefined || input.tags !== undefined)
          throw badRequest('This entry is locked: its text and tags are saved encrypted');
        const title = input.title ?? current.title;
        return {
          title,
          sealed: input.sealed ?? current.sealed,
          anchors: input.anchors ?? current.anchors,
          date,
          ...(date &&
            date !== current.date && {
              sortKey: journalSortKey(date, current.createdAt, id),
              monthDay: date.slice(5),
            }),
          ...flags,
          updatedAt: new Date().toISOString(),
          ...lockedDerived(kind, title),
        };
      }
      if (input.sealed !== undefined || input.anchors !== undefined)
        throw badRequest('This entry is not locked');
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
  // Linked words added or removed: keep the entry's links to those files in step.
  const before = anchorKeys(bodyBefore ?? '');
  const after = anchorKeys(linkTextOf(result.record));
  if (before.size !== after.size || [...after].some((k) => !before.has(k)))
    await syncTextLinks(
      ctx,
      { type: kind, id },
      linkTextOf(result.record),
      undefined,
      new Set([...before].filter((k) => !after.has(k))),
    );
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
  // A locked entry can't be added to here (its text is encrypted); the capture starts a new,
  // unlocked entry for the day instead.
  const sameDay = (await entries.listByDate(ctx.userId, date))
    .filter((r) => !r.locked)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const target = sameDay[0];
  if (!target) return (await createEntry(ctx, 'journal', { date, body: text })).id;

  await updateEntryWith(ctx, 'journal', target.id, null, (current) => ({
    body: current.body.trim() ? `${current.body.trimEnd()}\n\n*${time}* — ${text}` : text,
  }));
  await recordAction(ctx, 'journal.edited', target.id);
  return target.id;
}

function conflictError(kind: EntryKind, current: entries.EntryRecord) {
  return new AppError(409, 'EDIT_CONFLICT', 'This entry was changed somewhere else', {
    current: toEntry(kind, current),
  });
}

/**
 * Locks an existing entry. The browser sends the text and every earlier version encrypted;
 * the versions are overwritten first, then the entry itself (its readable body, tags, excerpt
 * and search terms are replaced in the same write). Afterwards no readable copy of the text is
 * left in the database. Refused if a version the browser didn't send exists.
 */
export async function lockEntry(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  input: LockEntryRequest,
): Promise<Entry> {
  assertLockable(kind);
  const current = await entries.get(ctx.userId, kind, id);
  if (!current) throw notFound('This entry no longer exists');
  if (current.locked) throw new AppError(409, 'ALREADY_LOCKED', 'This entry is already locked');
  if (current.rev !== input.rev) throw conflictError(kind, current);

  const states = await versions.sealStates(ctx.userId, id);
  const sent = new Map(input.versions.map((v) => [v.id, v.sealed]));
  const readable = states.filter((s) => !s.sealed);
  if (
    readable.some((s) => !sent.has(s.id)) ||
    input.versions.some((v) => !states.some((s) => s.id === v.id))
  )
    throw new AppError(409, 'VERSIONS_CHANGED', 'The version history changed; try again');
  await versions.rewrite(
    ctx.userId,
    // The label and word count go too: they are inside the sealed box.
    readable.map((s) => ({
      id: s.id,
      body: '',
      tags: [],
      sealed: sent.get(s.id)!,
      wordCount: 0,
      label: null,
    })),
  );

  const result = await entries.update(ctx.userId, kind, id, input.rev, (c) => {
    if (c.locked) throw new AppError(409, 'ALREADY_LOCKED', 'This entry is already locked');
    return {
      body: '',
      tags: [],
      locked: true,
      sealed: input.sealed,
      anchors: input.anchors,
      updatedAt: new Date().toISOString(),
      ...lockedDerived(kind, c.title),
    };
  });
  if (result.status === 'missing') throw notFound('This entry no longer exists');
  if (result.status === 'conflict') throw conflictError(kind, result.current);
  notifyChange(ctx, kind, id);
  await syncTextLinks(ctx, { type: kind, id }, linkTextOf(result.record));
  return toEntry(kind, result.record);
}

/** Removes the lock: the text and every earlier version, decrypted in the browser, readable again. */
export async function unlockEntry(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  input: UnlockEntryRequest,
): Promise<Entry> {
  const current = await entries.get(ctx.userId, kind, id);
  if (!current) throw notFound('This entry no longer exists');
  if (!current.locked) throw new AppError(409, 'NOT_LOCKED', 'This entry is not locked');
  if (current.rev !== input.rev) throw conflictError(kind, current);

  const states = await versions.sealStates(ctx.userId, id);
  const sent = new Map(input.versions.map((v) => [v.id, v]));
  const sealed = states.filter((s) => s.sealed);
  if (
    sealed.some((s) => !sent.has(s.id)) ||
    input.versions.some((v) => !states.some((s) => s.id === v.id))
  )
    throw new AppError(409, 'VERSIONS_CHANGED', 'The version history changed; try again');

  const result = await entries.update(ctx.userId, kind, id, input.rev, (c) => {
    if (!c.locked) throw new AppError(409, 'NOT_LOCKED', 'This entry is not locked');
    const next = {
      title: c.title,
      body: input.body,
      tags: normalizeTags(input.tags),
      topic: null,
      topicKey: null,
      sources: [] as Source[],
      perspectives: [] as Perspective[],
    };
    return {
      body: next.body,
      tags: next.tags,
      locked: false,
      sealed: null,
      anchors: [],
      updatedAt: new Date().toISOString(),
      ...derived(kind, next),
    };
  });
  if (result.status === 'missing') throw notFound('This entry no longer exists');
  if (result.status === 'conflict') throw conflictError(kind, result.current);
  await versions.rewrite(
    ctx.userId,
    sealed.map((s) => {
      const v = sent.get(s.id)!;
      return {
        id: s.id,
        body: v.body,
        tags: normalizeTags(v.tags),
        sealed: null,
        wordCount: wordCount(v.body),
        label: v.label?.trim() || null,
      };
    }),
  );
  notifyChange(ctx, kind, id);
  await syncTextLinks(ctx, { type: kind, id }, result.record.body);
  return toEntry(kind, result.record);
}

/**
 * Migration: an encrypted entry and its versions, re-sealed in the browser with the entries
 * key, replace the copies sealed with the vault key. Refused if a version sealed with another
 * key was left out. Not an edit: rev and updatedAt stay.
 */
export async function resealEntry(
  ctx: Ctx,
  kind: EntryKind,
  id: string,
  input: ResealEntryRequest,
): Promise<Entry> {
  assertLockable(kind);
  const keyId = input.sealed.k;
  if (!keyId || input.versions.some((v) => v.sealed.k !== keyId))
    throw badRequest('Re-sealed text must name the entries key');
  const current = await entries.get(ctx.userId, kind, id);
  if (!current) throw notFound('This entry no longer exists');
  if (!current.locked) throw new AppError(409, 'NOT_LOCKED', 'This entry is not locked');
  if (current.rev !== input.rev) throw conflictError(kind, current);

  const states = await versions.sealStates(ctx.userId, id);
  const sent = new Map(input.versions.map((v) => [v.id, v.sealed]));
  const stale = states.filter((s) => s.sealed && s.keyId !== keyId);
  if (
    stale.some((s) => !sent.has(s.id)) ||
    input.versions.some((v) => !states.some((s) => s.id === v.id && s.sealed))
  )
    throw new AppError(409, 'VERSIONS_CHANGED', 'The version history changed; try again');
  await versions.rewrite(
    ctx.userId,
    input.versions.map((v) => ({
      id: v.id,
      body: '',
      tags: [],
      sealed: v.sealed,
      wordCount: 0,
      label: null,
    })),
  );
  const result = await entries.update(
    ctx.userId,
    kind,
    id,
    input.rev,
    (c) => {
      if (!c.locked) throw new AppError(409, 'NOT_LOCKED', 'This entry is not locked');
      return { sealed: input.sealed };
    },
    false,
  );
  if (result.status === 'missing') throw notFound('This entry no longer exists');
  if (result.status === 'conflict') throw conflictError(kind, result.current);
  notifyChange(ctx, kind, id);
  return toEntry(kind, result.record);
}
