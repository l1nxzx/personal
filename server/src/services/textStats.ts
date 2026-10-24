import type { WritingStatKey } from '../../../shared/types.js';
import * as stats from '../data/statsRepo.js';
import { textStats, type TextStats } from '../lib/text.js';

/**
 * What counts as written text, per collection. Every save stores the result on the document
 * (`textWords`, `textChars`) and the profile sums them with aggregation queries, so edits and
 * deletes are always reflected and nothing has to be kept in step by hand.
 *
 * Rules: only text the owner wrote. Titles, names, one-line labels (next steps, goals), tags,
 * sources and quoted passages are left out, and so is version history (earlier copies of an
 * entry). Uploaded files and the end-to-end encrypted vault are never read.
 */

type Doc = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);
const obj = (v: unknown): Doc => (v && typeof v === 'object' ? (v as Doc) : {});

export interface WritingSource {
  key: WritingStatKey;
  collection: stats.StatCollection;
  /** `entries` are pieces of writing in their own right; `notes` are notes on other items. */
  group: 'entries' | 'notes';
  /** Stored fields the text comes from (read when recounting existing documents). */
  fields: string[];
  text: (d: Doc) => string[];
}

/** Journal entries, writings and knowledge notes: the body, plus belief and decision fields. */
const entryText = (d: Doc) => {
  const decision = obj(d.decision);
  return [
    str(d.body),
    ...list(d.perspectives).flatMap((p) => [
      str(p.position),
      str(p.reasons),
      str(p.influences),
      str(p.uncertainties),
    ]),
    str(decision.reasons),
    str(decision.expected),
    str(decision.outcome),
  ];
};
const entryFields = ['body', 'perspectives', 'decision'];

export const WRITING_SOURCES: WritingSource[] = [
  { key: 'journal', collection: 'journal', group: 'entries', fields: entryFields, text: entryText },
  { key: 'writing', collection: 'writing', group: 'entries', fields: entryFields, text: entryText },
  { key: 'note', collection: 'notes', group: 'entries', fields: entryFields, text: entryText },
  {
    key: 'review',
    collection: 'reviews',
    group: 'entries',
    fields: ['answers'],
    text: (d) => Object.values(obj(d.answers)).map(str),
  },
  {
    key: 'moment',
    collection: 'moments',
    group: 'entries',
    fields: ['description'],
    text: (d) => [str(d.description)],
  },
  // Book notes only: quotes are someone else's words.
  {
    key: 'book',
    collection: 'books',
    group: 'notes',
    fields: ['notes'],
    text: (d) => [str(d.notes)],
  },
  {
    key: 'project',
    collection: 'projects',
    group: 'notes',
    fields: ['description'],
    text: (d) => [str(d.description)],
  },
  {
    key: 'moneyIdea',
    collection: 'moneyIdeas',
    group: 'notes',
    fields: ['description', 'whyItMightWork', 'notes', 'experiments'],
    text: (d) => [
      str(d.description),
      str(d.whyItMightWork),
      str(d.notes),
      ...list(d.experiments).flatMap((e) => [str(e.tried), str(e.outcome), str(e.lessons)]),
    ],
  },
];

const source = (key: WritingStatKey) => WRITING_SOURCES.find((s) => s.key === key)!;

/** The stats to store on a document of `key` (call with the full record being saved). */
export const textStatsOf = (key: WritingStatKey, record: object): TextStats =>
  textStats(source(key).text(record as Doc));

/**
 * Bump when the counting rules change: the next profile visit recounts every stored document.
 * Version 1 counts the documents written before profile statistics existed.
 */
const TEXT_VERSION = 1;
const PAGE = 300;
const running = new Map<string, Promise<void>>();

/**
 * Makes sure every document carries current text stats. Runs once per user (and again on
 * request, to reconcile); documents saved meanwhile are skipped, as their save counted them.
 */
export async function ensureTextStats(uid: string, force = false): Promise<void> {
  if (!force && (await stats.getMeta(uid)).textVersion === TEXT_VERSION) return;
  let job = running.get(uid);
  if (!job) {
    job = recountAll(uid).finally(() => running.delete(uid));
    running.set(uid, job);
  }
  await job;
}

async function recountAll(uid: string): Promise<void> {
  for (const s of WRITING_SOURCES) {
    let after: string | undefined;
    for (;;) {
      const docs = await stats.scan(uid, s.collection, [...s.fields, 'textWords', 'textChars'], {
        after,
        limit: PAGE,
      });
      const updates = docs.flatMap((d) => {
        const next = textStats(s.text(d.data));
        const same = d.data.textWords === next.textWords && d.data.textChars === next.textChars;
        return same ? [] : [{ id: d.id, version: d.version, data: { ...next } }];
      });
      if (updates.length) await stats.setFields(uid, s.collection, updates);
      if (docs.length < PAGE) break;
      after = docs.at(-1)!.id;
    }
  }
  await stats.setMeta(uid, { textVersion: TEXT_VERSION, textCountedAt: new Date().toISOString() });
}
