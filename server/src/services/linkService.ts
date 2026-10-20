import type { LinkedItem, Ref, RefType } from '../../../shared/types.js';
import * as books from '../data/bookRepo.js';
import * as documents from '../data/documentRepo.js';
import * as entries from '../data/entryRepo.js';
import * as folders from '../data/folderRepo.js';
import * as links from '../data/linkRepo.js';
import * as projects from '../data/projectRepo.js';
import * as moneyIdeas from '../data/moneyIdeaRepo.js';
import * as tasks from '../data/taskRepo.js';
import { badRequest, notFound } from '../lib/errors.js';
import { notifyChange, type Ctx } from './context.js';
import { folderNames } from './folderService.js';

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
  const records = await links.listFor(ctx.userId, key);
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
  await links.add(ctx.userId, refKey(from), refKey(to));
  notifyChange(ctx, 'link');
}

/** Removes the link in both directions (lists show them as one connection). */
export async function removeLink(ctx: Ctx, a: Ref, b: Ref): Promise<void> {
  await Promise.all([
    links.remove(ctx.userId, refKey(a), refKey(b)),
    links.remove(ctx.userId, refKey(b), refKey(a)),
  ]);
  notifyChange(ctx, 'link');
}
