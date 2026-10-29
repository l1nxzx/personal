import type { LinkedItem, Ref, RefType } from '../../../shared/types.js';
import * as books from '../data/bookRepo.js';
import * as documents from '../data/documentRepo.js';
import * as entries from '../data/entryRepo.js';
import * as folders from '../data/folderRepo.js';
import * as links from '../data/linkRepo.js';
import * as projects from '../data/projectRepo.js';
import * as moneyIdeas from '../data/moneyIdeaRepo.js';
import * as tasks from '../data/taskRepo.js';
import { anchorKeys } from '../lib/anchors.js';
import { badRequest, notFound } from '../lib/errors.js';
import { notifyChange, type Ctx } from './context.js';
import { folderNames } from './folderService.js';
import { recordAction } from './activityService.js';

export const refKey = (r: Ref) => `${r.type}:${r.id}`;
const parseKey = (key: string): Ref => {
  const i = key.indexOf(':');
  return { type: key.slice(0, i) as RefType, id: key.slice(i + 1) };
};

const NOTE_TYPE_LABEL = {
  note: 'Note',
  question: 'Question',
  belief: 'Belief',
  quote: 'Quote',
  decision: 'Decision',
} as const;

/** Looks up a title and a short subtitle for each ref; missing items are left out. */
export async function describe(
  uid: string,
  refs: Ref[],
): Promise<Map<string, { title: string; subtitle: string }>> {
  const byType = new Map<RefType, string[]>();
  for (const r of refs) byType.set(r.type, [...(byType.get(r.type) ?? []), r.id]);
  const out = new Map<string, { title: string; subtitle: string }>();
  const put = (type: RefType, id: string, title: string, subtitle: string) =>
    out.set(`${type}:${id}`, { title, subtitle });

  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      switch (type) {
        case 'journal':
        case 'writing':
        case 'note': {
          for (const [id, r] of await entries.getTitles(uid, type, ids)) {
            const subtitle =
              type === 'journal'
                ? (r.date ?? '')
                : type === 'note'
                  ? [NOTE_TYPE_LABEL[r.noteType ?? 'note'], r.topic].filter(Boolean).join(' · ')
                  : '';
            put(type, id, r.title || r.excerpt.slice(0, 80), subtitle);
          }
          break;
        }
        case 'book':
          for (const [id, b] of await books.getTitles(uid, ids)) put(type, id, b.title, b.author);
          break;
        case 'project':
          for (const [id, p] of await projects.getMany(uid, ids)) put(type, id, p.name, p.status);
          break;
        case 'document': {
          const docs = await documents.getMany(uid, ids);
          const names = await folderNames(
            uid,
            [...docs.values()].map((d) => d.folderId),
          );
          for (const [id, d] of docs)
            put(type, id, d.name, (d.folderId && names.get(d.folderId)) || '');
          break;
        }
        case 'folder': {
          const found = await folders.getMany(uid, ids);
          const parents = await folderNames(
            uid,
            [...found.values()].map((f) => f.parentId),
          );
          for (const [id, f] of found) {
            const parent = f.parentId && parents.get(f.parentId);
            put(type, id, f.name, parent ? `Folder in ${parent}` : 'Folder');
          }
          break;
        }
        case 'moneyIdea':
          for (const [id, i] of await moneyIdeas.getMany(uid, ids)) put(type, id, i.name, i.status);
          break;
        case 'task':
          await Promise.all(
            ids.map(async (id) => {
              const t = await tasks.get(uid, id);
              if (t) put(type, id, t.title, t.status === 'done' ? 'done' : (t.dueDate ?? ''));
            }),
          );
          break;
      }
    }),
  );
  return out;
}

export async function listLinks(ctx: Ctx, ref: Ref): Promise<LinkedItem[]> {
  const key = refKey(ref);
  let records = await links.listFor(ctx.userId, key);
  // An entry's list is checked against its text (cleans up links left from before this sync).
  if (ref.type === 'journal' || ref.type === 'writing' || ref.type === 'note') {
    const entry = await entries.get(ctx.userId, ref.type, ref.id);
    if (entry) records = await syncTextLinks(ctx, ref, entry.body, records);
  }
  const others = new Map<string, 'out' | 'in'>();
  for (const l of records) {
    const otherKey = l.from === key ? l.to : l.from;
    if (!others.has(otherKey) || l.from === key)
      others.set(otherKey, l.from === key ? 'out' : 'in');
  }
  const refs = [...others.keys()].map(parseKey);
  const info = await describe(ctx.userId, refs);
  return refs
    .filter((r) => info.has(refKey(r)))
    .map((r) => ({ ref: r, ...info.get(refKey(r))!, direction: others.get(refKey(r))! }))
    .sort((a, b) => a.ref.type.localeCompare(b.ref.type) || a.title.localeCompare(b.title));
}

export async function addLink(ctx: Ctx, from: Ref, to: Ref): Promise<void> {
  if (refKey(from) === refKey(to)) throw badRequest('An item cannot link to itself');
  const info = await describe(ctx.userId, [from, to]);
  if (!info.has(refKey(from)) || !info.has(refKey(to)))
    throw notFound('One of these items no longer exists');
  await links.add(ctx.userId, refKey(from), refKey(to), 'manual');
  notifyChange(ctx, 'link');
  await recordAction(ctx, 'link.created', [refKey(from), refKey(to)].sort().join('~'));
}

/**
 * Links stored without a `source` after linked words existed (they shipped at this moment)
 * were made by the text; older ones were added by hand and are never touched.
 */
const TEXT_LINKS_SINCE = '2026-10-29T11:02:47.000Z';
const fromText = (l: links.LinkRecord) =>
  l.source === 'text' || (!l.source && l.createdAt >= TEXT_LINKS_SINCE);

/**
 * Keeps an entry's links to files and folders in step with the words linked in its text:
 * every file or folder it links words to is linked to the entry (so the file lists it too),
 * and one whose words are all gone is unlinked again, unless it was linked by hand.
 * Returns the entry's link records as they are afterwards.
 */
export async function syncTextLinks(
  ctx: Ctx,
  entry: Ref,
  body: string,
  records?: links.LinkRecord[],
  /** Files whose linked words this save removed: unlinked however the link was made. */
  unlinked: Set<string> = new Set(),
): Promise<links.LinkRecord[]> {
  const self = refKey(entry);
  const anchored = anchorKeys(body);
  const current = records ?? (await links.listFor(ctx.userId, self));
  const other = (l: links.LinkRecord) => (l.from === self ? l.to : l.from);
  const stale = current.filter((l) => {
    const key = other(l);
    if (!/^(document|folder):/.test(key) || anchored.has(key)) return false;
    return unlinked.has(key) || fromText(l);
  });
  const linked = new Set(current.map(other));
  const missing = [...anchored].filter((key) => !linked.has(key));
  if (!stale.length && !missing.length) return current;

  await Promise.all([
    ...stale.map((l) => links.remove(ctx.userId, l.from, l.to)),
    ...missing.map((key) => links.add(ctx.userId, self, key, 'text')),
  ]);
  notifyChange(ctx, 'link');
  const now = new Date().toISOString();
  return [
    ...current.filter((l) => !stale.includes(l)),
    ...missing.map((key) => ({ from: self, to: key, createdAt: now, source: 'text' as const })),
  ];
}

/** Removes the link in both directions (lists show them as one connection). */
export async function removeLink(ctx: Ctx, a: Ref, b: Ref): Promise<void> {
  await Promise.all([
    links.remove(ctx.userId, refKey(a), refKey(b)),
    links.remove(ctx.userId, refKey(b), refKey(a)),
  ]);
  notifyChange(ctx, 'link');
}
