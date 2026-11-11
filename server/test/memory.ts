/** In-memory stand-ins for the Firestore / Storage data layer, used by all route tests. */
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  BookStatus,
  EntryKind,
  ExpenseSummary,
  IncomeSummary,
  Prefs,
  VaultMeta,
} from '../../shared/types.js';
import { conflict } from '../src/lib/errors.js';
import type { ActivityDayRecord, ActivityMetaRecord } from '../src/data/activityRepo.js';
import type { BookRecord } from '../src/data/bookRepo.js';
import type { DocumentRecord } from '../src/data/documentRepo.js';
import type { FolderRecord } from '../src/data/folderRepo.js';
import type { EntryRecord, EntrySummaryRecord, UpdateResult } from '../src/data/entryRepo.js';
import type { ExpenseRecord, SubscriptionRecord } from '../src/data/expenseRepo.js';
import type { MomentRecord } from '../src/data/momentRepo.js';
import type { MoneyIdeaRecord } from '../src/data/moneyIdeaRepo.js';
import type { ReviewRecord } from '../src/data/reviewRepo.js';
import type { StatsMeta } from '../src/data/statsRepo.js';
import type { VaultItemRecord } from '../src/data/vaultRepo.js';
import type { VersionRecord } from '../src/data/versionRepo.js';
import type { CaptureRecord } from '../src/data/inboxRepo.js';
import type { IncomeRecord } from '../src/data/incomeRepo.js';
import type { LinkRecord } from '../src/data/linkRepo.js';
import type { ProjectRecord } from '../src/data/projectRepo.js';
import type { TaskRecord } from '../src/data/taskRepo.js';
import type { EntryKeyRecord, PinDeviceRecord } from '../src/data/entryLockRepo.js';
import type { NewUser, UserPatch, UserRecord } from '../src/data/userRepo.js';

const stores = {
  users: new Map<string, UserRecord>(),
  tokens: new Map<string, { userId: string; expiresAt: Date }>(),
  entries: new Map<string, Map<string, EntryRecord>>(), // `${uid}/${kind}` → id → record
  tags: new Map<string, Record<string, number>>(), // `${uid}/${kind}`
  topics: new Map<string, { counts: Record<string, number>; labels: Record<string, string> }>(),
  tasks: new Map<string, Map<string, TaskRecord>>(),
  inbox: new Map<string, Map<string, CaptureRecord>>(),
  prefs: new Map<string, Partial<Prefs>>(),
  links: new Map<string, Map<string, LinkRecord>>(),
  books: new Map<string, Map<string, BookRecord>>(),
  projects: new Map<string, Map<string, ProjectRecord>>(),
  documents: new Map<string, Map<string, DocumentRecord>>(),
  folders: new Map<string, Map<string, FolderRecord>>(),
  libraryMigrated: new Set<string>(),
  income: new Map<string, Map<string, IncomeRecord>>(),
  incomeSummary: new Map<string, IncomeSummary>(),
  files: new Map<string, { data: Buffer; contentType: string }>(),
  versions: new Map<string, VersionRecord>(),
  moneyIdeas: new Map<string, Map<string, MoneyIdeaRecord>>(),
  expenses: new Map<string, Map<string, ExpenseRecord>>(),
  expenseSummary: new Map<string, ExpenseSummary>(),
  subscriptions: new Map<string, Map<string, SubscriptionRecord>>(),
  reviews: new Map<string, Map<string, ReviewRecord>>(),
  moments: new Map<string, Map<string, MomentRecord>>(),
  vaultMeta: new Map<string, VaultMeta>(),
  vaultItems: new Map<string, Map<string, VaultItemRecord>>(),
  statsMeta: new Map<string, StatsMeta>(),
  activityMeta: new Map<string, ActivityMetaRecord>(),
  activityDays: new Map<string, Map<string, ActivityDayRecord>>(),
  entryKeys: new Map<string, EntryKeyRecord>(),
  pinDevices: new Map<string, Map<string, PinDeviceRecord>>(),
};

export function resetMemory() {
  for (const m of Object.values(stores)) m.clear();
}

export const memoryFiles = stores.files;
/** Shared with memory3.ts (phase 3 doubles). */
export { stores };

export const bucket = <T>(store: Map<string, Map<string, T>>, key: string) => {
  let m = store.get(key);
  if (!m) store.set(key, (m = new Map()));
  return m;
};
export const clone = <T>(v: T): T => structuredClone(v);
export const newId = () => randomUUID().replace(/-/g, '');
export const byDesc =
  <T>(key: (x: T) => string) =>
  (a: T, b: T) =>
    key(b).localeCompare(key(a));

export function page<T>(all: T[], limit: number, cursorOf: (x: T) => string | null) {
  const items = all.slice(0, limit).map(clone);
  return { items, nextCursor: all.length > limit ? (cursorOf(items.at(-1)!) ?? null) : null };
}

// ---------------------------------------------------------------- users & sessions
export const userRepo = {
  async findById(id: string) {
    return stores.users.get(id) ?? null;
  },
  async findByEmail(email: string) {
    return [...stores.users.values()].find((u) => u.email === email) ?? null;
  },
  async create(data: NewUser) {
    if ([...stores.users.values()].some((u) => u.email === data.email)) {
      throw conflict('Email is already registered', 'EMAIL_TAKEN');
    }
    const user = { id: randomUUID(), ...data };
    stores.users.set(user.id, user);
    return user;
  },
  async update(id: string, patch: UserPatch) {
    stores.users.set(id, { ...stores.users.get(id)!, ...patch });
  },
  async list(limit: number, cursor?: string) {
    const all = [...stores.users.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .filter((u) => !cursor || u.createdAt > cursor);
    return page(all, limit, (u) => u.createdAt);
  },
};

export const refreshTokenRepo = {
  async save(jti: string, userId: string, expiresAt: Date) {
    stores.tokens.set(jti, { userId, expiresAt });
  },
  async consume(jti: string) {
    const t = stores.tokens.get(jti);
    if (!t) return null;
    stores.tokens.delete(jti);
    return t.expiresAt.getTime() > Date.now() ? { userId: t.userId } : null;
  },
  async revokeAllForUser(userId: string) {
    for (const [jti, t] of stores.tokens) if (t.userId === userId) stores.tokens.delete(jti);
  },
};

// ---------------------------------------------------------------- journal, writing, notes
type Countable = Pick<EntryRecord, 'tags' | 'topic' | 'topicKey'> | null;

function countDeltas(uid: string, kind: EntryKind, before: Countable, after: Countable) {
  const counts = stores.tags.get(`${uid}/${kind}`) ?? {};
  const b = before?.tags ?? [];
  const a = after?.tags ?? [];
  for (const t of b) if (!a.includes(t)) counts[t] = (counts[t] ?? 0) - 1;
  for (const t of a) if (!b.includes(t)) counts[t] = (counts[t] ?? 0) + 1;
  stores.tags.set(`${uid}/${kind}`, counts);
  if (kind !== 'note' || before?.topicKey === after?.topicKey) return;
  const topics = stores.topics.get(uid) ?? { counts: {}, labels: {} };
  if (before?.topicKey) topics.counts[before.topicKey] = (topics.counts[before.topicKey] ?? 0) - 1;
  if (after?.topicKey && after.topic) {
    topics.counts[after.topicKey] = (topics.counts[after.topicKey] ?? 0) + 1;
    topics.labels[after.topicKey] = after.topic;
  }
  stores.topics.set(uid, topics);
}

const entries = (uid: string, kind: EntryKind) => bucket(stores.entries, `${uid}/${kind}`);
// Same shape as entryRepo.versionOf (the real module is mocked away in tests).
const versionOf = (kind: EntryKind, r: EntryRecord, label: string | null) => ({
  entryId: r.id,
  kind,
  title: r.title,
  body: r.body,
  tags: r.tags,
  wordCount: r.wordCount,
  savedAt: r.updatedAt,
  label,
  sealed: r.sealed ?? null,
});
const summary = ({
  body: _b,
  searchTerms: _s,
  sources: _so,
  perspectives: _p,
  decision: _d,
  lastSnapshotAt: _l,
  sealed: _se,
  anchors: _a,
  ...rest
}: EntryRecord): EntrySummaryRecord => rest;

export const entryRepo = {
  newId,
  async get(uid: string, kind: EntryKind, id: string) {
    const r = entries(uid, kind).get(id);
    return r ? clone(r) : null;
  },
  async getTitles(uid: string, kind: EntryKind, ids: string[]) {
    const out = new Map<string, EntrySummaryRecord>();
    for (const id of ids) {
      const r = entries(uid, kind).get(id);
      if (r) out.set(id, summary(clone(r)));
    }
    return out;
  },
  async create(uid: string, kind: EntryKind, record: EntryRecord) {
    entries(uid, kind).set(record.id, clone(record));
    countDeltas(uid, kind, null, record);
  },
  async update(
    uid: string,
    kind: EntryKind,
    id: string,
    expectedRev: number | null,
    build: (current: EntryRecord) => Partial<EntryRecord>,
    bumpRev = true,
    snapshotIf?: (current: EntryRecord) => boolean,
  ): Promise<UpdateResult> {
    const current = entries(uid, kind).get(id);
    if (!current) return { status: 'missing' };
    if (expectedRev !== null && current.rev !== expectedRev)
      return { status: 'conflict', current: clone(current) };
    const patch: Partial<EntryRecord> = {
      ...build(clone(current)),
      rev: bumpRev ? current.rev + 1 : current.rev,
    };
    if (snapshotIf?.(clone(current))) {
      const vid = newId();
      stores.versions.set(vid, { id: vid, ...versionOf(kind, clone(current), null) });
      patch.lastSnapshotAt = new Date().toISOString();
    }
    const record = { ...current, ...patch, id };
    countDeltas(uid, kind, current, record);
    entries(uid, kind).set(id, record);
    return { status: 'ok', record: clone(record) };
  },
  async remove(uid: string, kind: EntryKind, id: string) {
    const r = entries(uid, kind).get(id);
    if (!r) return false;
    entries(uid, kind).delete(id);
    countDeltas(uid, kind, r, null);
    return true;
  },
  async listJournal(
    uid: string,
    opts: { limit: number; cursor?: string; from?: string; to?: string },
  ) {
    const all = [...entries(uid, 'journal').values()]
      .filter(
        (r) =>
          (!opts.from || r.sortKey >= opts.from) &&
          (!opts.to || r.sortKey <= `${opts.to}~`) &&
          (!opts.cursor || r.sortKey < opts.cursor),
      )
      .sort(byDesc((r) => r.sortKey))
      .map(summary);
    return page(all, opts.limit, (r) => r.sortKey);
  },
  async listByUpdated(uid: string, kind: EntryKind, opts: { limit: number; cursor?: string }) {
    const all = [...entries(uid, kind).values()]
      .filter((r) => !opts.cursor || r.updatedAt < opts.cursor)
      .sort(byDesc((r) => r.updatedAt))
      .map(summary);
    return page(all, opts.limit, (r) => r.updatedAt);
  },
  async listWhere(
    uid: string,
    kind: EntryKind,
    field: 'tags' | 'archived' | 'topicKey' | 'noteType',
    value: string | boolean,
  ) {
    return [...entries(uid, kind).values()]
      .filter((r) => (field === 'tags' ? r.tags.includes(value as string) : r[field] === value))
      .map(summary);
  },
  async listRecent(uid: string, kind: EntryKind, limit: number) {
    return [...entries(uid, kind).values()]
      .sort(byDesc((r) => r.updatedAt))
      .slice(0, limit)
      .map(summary);
  },
  async listByDate(uid: string, date: string) {
    return [...entries(uid, 'journal').values()].filter((r) => r.date === date).map(clone);
  },
  async search(uid: string, kind: EntryKind, term: string, limit: number) {
    return [...entries(uid, kind).values()]
      .filter((r) => r.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
  async tagCounts(uid: string, kind: EntryKind) {
    return { ...(stores.tags.get(`${uid}/${kind}`) ?? {}) };
  },
  async topicCounts(uid: string) {
    return clone(stores.topics.get(uid) ?? { counts: {}, labels: {} });
  },
  async listByMonthDay(uid: string, kind: EntryKind, monthDay: string) {
    return [...entries(uid, kind).values()].filter((r) => r.monthDay === monthDay).map(summary);
  },
  async listUpdatedBetween(uid: string, kind: EntryKind, fromIso: string, toIso: string) {
    return [...entries(uid, kind).values()]
      .filter((r) => r.updatedAt >= fromIso && r.updatedAt < toIso)
      .sort(byDesc((r) => r.updatedAt))
      .map((r) => ({ ...summary(clone(r)), perspectives: clone(r.perspectives) }));
  },
  async lockedIds(uid: string) {
    return (['journal', 'writing'] as const).flatMap((kind) =>
      [...entries(uid, kind).values()].filter((r) => r.locked).map((r) => ({ kind, id: r.id })),
    );
  },
};

/** Test helper: make an entry look as if its last snapshot was long ago. */
export function ageEntry(uid: string, kind: EntryKind, id: string, ms: number) {
  const r = entries(uid, kind).get(id)!;
  r.lastSnapshotAt = new Date(Date.now() - ms).toISOString();
  r.createdAt = new Date(Date.now() - ms).toISOString();
}

export const versionRepo = {
  async add(
    uid: string,
    kind: EntryKind,
    entry: EntryRecord,
    label: string | null,
    sealed?: VersionRecord['sealed'],
  ) {
    const id = newId();
    stores.versions.set(id, {
      id,
      ...versionOf(kind, clone(entry), label),
      ...(sealed && { sealed: clone(sealed) }),
    });
    return id;
  },
  async listFor(_uid: string, entryId: string) {
    return [...stores.versions.values()].filter((v) => v.entryId === entryId).map(clone);
  },
  async get(_uid: string, id: string) {
    const v = stores.versions.get(id);
    return v ? clone(v) : null;
  },
  async removeAllFor(_uid: string, entryId: string) {
    for (const [id, v] of stores.versions) if (v.entryId === entryId) stores.versions.delete(id);
  },
  async sealStates(_uid: string, entryId: string) {
    return [...stores.versions.values()]
      .filter((v) => v.entryId === entryId)
      .map((v) => ({ id: v.id, sealed: !!v.sealed, keyId: v.sealed?.k ?? null }));
  },
  async rewrite(
    _uid: string,
    patches: {
      id: string;
      body: string;
      tags: string[];
      sealed: VersionRecord['sealed'];
      wordCount: number;
      label: string | null;
    }[],
  ) {
    for (const { id, ...fields } of patches) {
      const v = stores.versions.get(id);
      if (v) stores.versions.set(id, { ...v, ...clone(fields) });
    }
  },
  /** Test helper: every stored version of an entry, as stored. */
  all: (entryId: string) => [...stores.versions.values()].filter((v) => v.entryId === entryId),
};

// ---------------------------------------------------------------- links
const links = (uid: string) => bucket(stores.links, uid);

export const linkRepo = {
  async add(uid: string, from: string, to: string, source: 'manual' | 'text') {
    links(uid).set(`${from}__${to}`, { from, to, createdAt: new Date().toISOString(), source });
  },
  async remove(uid: string, from: string, to: string) {
    links(uid).delete(`${from}__${to}`);
  },
  async listFor(uid: string, key: string) {
    return [...links(uid).values()].filter((l) => l.from === key || l.to === key).map(clone);
  },
  async removeAllFor(uid: string, key: string) {
    for (const [id, l] of links(uid)) if (l.from === key || l.to === key) links(uid).delete(id);
  },
  /** Test helper. */
  count: (uid: string) => links(uid).size,
  /** Test helper: a link as stored before `source` was recorded. */
  seedLegacy(uid: string, from: string, to: string, createdAt: string) {
    links(uid).set(`${from}__${to}`, { from, to, createdAt });
  },
};

// ---------------------------------------------------------------- tasks
const tasks = (uid: string) => bucket(stores.tasks, uid);

export const taskRepo = {
  newId,
  async get(uid: string, id: string) {
    const t = tasks(uid).get(id);
    return t ? clone(t) : null;
  },
  async create(uid: string, task: TaskRecord) {
    tasks(uid).set(task.id, clone(task));
  },
  async update(uid: string, id: string, patch: Partial<TaskRecord>) {
    tasks(uid).set(id, { ...tasks(uid).get(id)!, ...clone(patch), id });
  },
  async remove(uid: string, id: string) {
    tasks(uid).delete(id);
  },
  async listOpen(uid: string) {
    return [...tasks(uid).values()].filter((t) => t.status === 'open').map(clone);
  },
  async listDone(uid: string, limit: number, cursor?: string) {
    const all = [...tasks(uid).values()]
      .filter((t) => t.completedAt && (!cursor || t.completedAt < cursor))
      .sort(byDesc((t) => t.completedAt!));
    return page(all, limit, (t) => t.completedAt);
  },
  async search(uid: string, term: string, limit: number) {
    return [...tasks(uid).values()]
      .filter((t) => t.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
  async listByProject(uid: string, projectId: string) {
    return [...tasks(uid).values()].filter((t) => t.projectId === projectId).map(clone);
  },
  async countByProject(uid: string, projectId: string) {
    return [...tasks(uid).values()].filter((t) => t.projectId === projectId).length;
  },
  async listDoneBetween(uid: string, fromIso: string, toIso: string) {
    return [...tasks(uid).values()]
      .filter((t) => t.completedAt && t.completedAt >= fromIso && t.completedAt < toIso)
      .map(clone);
  },
  async clearProject(uid: string, projectId: string) {
    for (const t of tasks(uid).values()) if (t.projectId === projectId) t.projectId = null;
  },
};

// ---------------------------------------------------------------- inbox & prefs
const inbox = (uid: string) => bucket(stores.inbox, uid);

export const inboxRepo = {
  newId,
  async get(uid: string, id: string) {
    const c = inbox(uid).get(id);
    return c ? clone(c) : null;
  },
  async create(uid: string, capture: CaptureRecord) {
    inbox(uid).set(capture.id, clone(capture));
  },
  async remove(uid: string, id: string) {
    inbox(uid).delete(id);
  },
  async list(uid: string, limit: number) {
    return [...inbox(uid).values()]
      .sort(byDesc((c) => c.createdAt))
      .slice(0, limit)
      .map(clone);
  },
  async count(uid: string) {
    return inbox(uid).size;
  },
  async search(uid: string, term: string, limit: number) {
    return [...inbox(uid).values()]
      .filter((c) => c.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

export const prefsRepo = {
  async get(uid: string) {
    return { ...(stores.prefs.get(uid) ?? {}) };
  },
  async update(uid: string, patch: Partial<Prefs>) {
    stores.prefs.set(uid, { ...(stores.prefs.get(uid) ?? {}), ...patch });
  },
};

// ---------------------------------------------------------------- books & projects
const books = (uid: string) => bucket(stores.books, uid);
const bookSummary = ({ notes: _n, quotes: _q, searchTerms: _s, ...rest }: BookRecord) => rest;

export const bookRepo = {
  newId,
  async get(uid: string, id: string) {
    const b = books(uid).get(id);
    return b ? clone(b) : null;
  },
  async getTitles(uid: string, ids: string[]) {
    return new Map(
      ids
        .filter((id) => books(uid).has(id))
        .map((id) => [id, bookSummary(clone(books(uid).get(id)!))]),
    );
  },
  async create(uid: string, book: BookRecord) {
    books(uid).set(book.id, clone(book));
  },
  async update(uid: string, id: string, patch: Partial<BookRecord>) {
    books(uid).set(id, { ...books(uid).get(id)!, ...clone(patch), id });
  },
  async remove(uid: string, id: string) {
    books(uid).delete(id);
  },
  async listByStatus(uid: string, status: BookStatus) {
    return [...books(uid).values()]
      .filter((b) => b.status === status)
      .map((b) => bookSummary(clone(b)));
  },
  async listRecent(uid: string, limit: number) {
    return [...books(uid).values()]
      .sort(byDesc((b) => b.createdAt))
      .slice(0, limit)
      .map((b) => bookSummary(clone(b)));
  },
  async search(uid: string, term: string, limit: number) {
    return [...books(uid).values()]
      .filter((b) => b.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

const projects = (uid: string) => bucket(stores.projects, uid);

export const projectRepo = {
  newId,
  async get(uid: string, id: string) {
    const p = projects(uid).get(id);
    return p ? clone(p) : null;
  },
  async getMany(uid: string, ids: string[]) {
    return new Map(
      ids.filter((id) => projects(uid).has(id)).map((id) => [id, clone(projects(uid).get(id)!)]),
    );
  },
  async create(uid: string, p: ProjectRecord) {
    projects(uid).set(p.id, clone(p));
  },
  async update(uid: string, id: string, patch: Partial<ProjectRecord>) {
    projects(uid).set(id, { ...projects(uid).get(id)!, ...clone(patch), id });
  },
  async remove(uid: string, id: string) {
    projects(uid).delete(id);
  },
  async listAll(uid: string) {
    return [...projects(uid).values()].map(clone);
  },
  async listRecent(uid: string, limit: number) {
    return [...projects(uid).values()]
      .sort(byDesc((p) => p.createdAt))
      .slice(0, limit)
      .map(clone);
  },
  async search(uid: string, term: string, limit: number) {
    return [...projects(uid).values()]
      .filter((p) => p.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- documents
const docs = (uid: string) => bucket(stores.documents, uid);

/** Like Firestore, a missing `folderId` field never equals anything (not even null). */
const inFolder = (d: DocumentRecord, folderId: string | null) =>
  d.folderId !== undefined && d.folderId === folderId;

/** Stores a file the way it looked before folder documents: a `folder` name, no `folderId`. */
export function seedLegacyDocument(
  uid: string,
  d: Omit<DocumentRecord, 'folderId'> & { folder: string | null },
) {
  docs(uid).set(d.id, clone(d) as unknown as DocumentRecord);
}

export const documentRepo = {
  newId,
  async get(uid: string, id: string) {
    const d = docs(uid).get(id);
    return d ? clone(d) : null;
  },
  async getMany(uid: string, ids: string[]) {
    return new Map(
      ids.filter((id) => docs(uid).has(id)).map((id) => [id, clone(docs(uid).get(id)!)]),
    );
  },
  async create(uid: string, d: DocumentRecord) {
    docs(uid).set(d.id, clone(d));
  },
  async update(uid: string, id: string, patch: Partial<DocumentRecord>) {
    const current = docs(uid).get(id);
    if (!current) return null;
    const next = { ...current, ...clone(patch), id };
    docs(uid).set(id, next);
    return clone(next);
  },
  async remove(uid: string, id: string) {
    const current = docs(uid).get(id);
    if (!current) return null;
    docs(uid).delete(id);
    return clone(current);
  },
  async setFolder(uid: string, ids: string[], folderId: string | null, updatedAt: string) {
    for (const id of ids) {
      const d = docs(uid).get(id);
      if (!d) throw new Error(`NOT_FOUND: no document to update: ${id}`);
      docs(uid).set(id, { ...d, folderId, updatedAt });
    }
  },
  async list(uid: string, limit: number, cursor?: string) {
    const all = [...docs(uid).values()]
      .filter((d) => !cursor || d.createdAt < cursor)
      .sort(byDesc((d) => d.createdAt));
    return page(all, limit, (d) => d.createdAt);
  },
  async listWhere(
    uid: string,
    field: 'folderId' | 'favorite' | 'tags',
    value: string | boolean | null,
  ) {
    return [...docs(uid).values()]
      .filter((d) =>
        field === 'tags'
          ? d.tags.includes(value as string)
          : field === 'folderId'
            ? inFolder(d, value as string | null)
            : d[field] === value,
      )
      .map(clone);
  },
  async listInFolders(uid: string, folderIds: string[]) {
    return [...docs(uid).values()].filter((d) => folderIds.some((f) => inFolder(d, f))).map(clone);
  },
  async listSizes(uid: string) {
    return [...docs(uid).values()].map((d) => ({ folderId: d.folderId ?? null, size: d.size }));
  },
  async countInFolders(uid: string, folderIds: string[]) {
    return [...docs(uid).values()].filter((d) => folderIds.some((f) => inFolder(d, f))).length;
  },
  async listUnplaced(uid: string) {
    return [...docs(uid).values()]
      .filter((d) => d.folderId === undefined)
      .map((d) => ({
        id: d.id,
        name: d.name,
        tags: [...d.tags],
        legacyFolder: (d as unknown as { folder?: string | null }).folder ?? null,
      }));
  },
  async placeMany(
    uid: string,
    updates: { id: string; folderId: string | null; searchTerms: string[] }[],
  ) {
    for (const { id, ...data } of updates) docs(uid).set(id, { ...docs(uid).get(id)!, ...data });
  },
  async search(uid: string, term: string, limit: number) {
    return [...docs(uid).values()]
      .filter((d) => d.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- library folders
const folderStore = (uid: string) => bucket(stores.folders, uid);

export const folderRepo = {
  newId,
  async get(uid: string, id: string) {
    const f = folderStore(uid).get(id);
    return f ? clone(f) : null;
  },
  async getMany(uid: string, ids: string[]) {
    return new Map(
      ids
        .filter((id) => folderStore(uid).has(id))
        .map((id) => [id, clone(folderStore(uid).get(id)!)]),
    );
  },
  async listAll(uid: string) {
    return [...folderStore(uid).values()].map(clone);
  },
  async listChildren(uid: string, parentId: string | null) {
    return [...folderStore(uid).values()].filter((f) => f.parentId === parentId).map(clone);
  },
  async create(uid: string, f: FolderRecord) {
    if (folderStore(uid).has(f.id)) throw new Error('ALREADY_EXISTS');
    folderStore(uid).set(f.id, clone(f));
  },
  async putMany(uid: string, list: FolderRecord[]) {
    for (const f of list) folderStore(uid).set(f.id, clone(f));
  },
  async update(uid: string, id: string, patch: Partial<Omit<FolderRecord, 'id'>>) {
    const current = folderStore(uid).get(id);
    if (!current) return null;
    const next = { ...current, ...clone(patch), id };
    folderStore(uid).set(id, next);
    return clone(next);
  },
  async removeMany(uid: string, ids: string[]) {
    for (const id of ids) folderStore(uid).delete(id);
  },
  async isMigrated(uid: string) {
    return stores.libraryMigrated.has(uid);
  },
  async markMigrated(uid: string) {
    stores.libraryMigrated.add(uid);
  },
};

// ---------------------------------------------------------------- income
const income = (uid: string) => bucket(stores.income, uid);

function applyToSummary(uid: string, r: IncomeRecord, sign: 1 | -1) {
  const s = stores.incomeSummary.get(uid) ?? { months: {}, sourceLabels: {} };
  const month = (s.months[r.date.slice(0, 7)] ??= {});
  const t = (month[r.currency] ??= { received: 0, pending: 0, sources: {} });
  if (r.status === 'received') {
    t.received += sign * r.amountMinor;
    t.sources[r.sourceKey] = (t.sources[r.sourceKey] ?? 0) + sign * r.amountMinor;
  } else {
    t.pending += sign * r.amountMinor;
  }
  if (sign === 1) s.sourceLabels[r.sourceKey] = r.source;
  stores.incomeSummary.set(uid, s);
}

export const incomeRepo = {
  newId,
  async get(uid: string, id: string) {
    const r = income(uid).get(id);
    return r ? clone(r) : null;
  },
  async create(uid: string, r: IncomeRecord) {
    income(uid).set(r.id, clone(r));
    applyToSummary(uid, r, 1);
  },
  async update(uid: string, id: string, build: (current: IncomeRecord) => IncomeRecord) {
    const current = income(uid).get(id);
    if (!current) return null;
    const next = build(clone(current));
    applyToSummary(uid, current, -1);
    applyToSummary(uid, next, 1);
    income(uid).set(id, clone(next));
    return clone(next);
  },
  async remove(uid: string, id: string) {
    const current = income(uid).get(id);
    if (!current) return false;
    income(uid).delete(id);
    applyToSummary(uid, current, -1);
    return true;
  },
  async list(uid: string, opts: { limit: number; cursor?: string; from?: string; to?: string }) {
    const all = [...income(uid).values()]
      .filter(
        (r) =>
          (!opts.from || r.sortKey >= opts.from) &&
          (!opts.to || r.sortKey <= `${opts.to}~`) &&
          (!opts.cursor || r.sortKey < opts.cursor),
      )
      .sort(byDesc((r) => r.sortKey));
    return page(all, opts.limit, (r) => r.sortKey);
  },
  async summary(uid: string) {
    return clone(stores.incomeSummary.get(uid) ?? { months: {}, sourceLabels: {} });
  },
  async search(uid: string, term: string, limit: number) {
    return [...income(uid).values()]
      .filter((r) => r.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- storage
export const storage = {
  async uploadFile(path: string, data: Buffer, contentType: string) {
    stores.files.set(path, { data, contentType });
  },
  async openFile(path: string, range?: { start: number; end?: number }) {
    const f = stores.files.get(path);
    if (!f) return null;
    const size = f.data.length;
    const r =
      range && range.start < size
        ? { start: range.start, end: Math.min(range.end ?? size - 1, size - 1) }
        : null;
    const data = r ? f.data.subarray(r.start, r.end + 1) : f.data;
    return { stream: Readable.from(data), contentType: f.contentType, size, range: r };
  },
  async deleteFile(path: string) {
    stores.files.delete(path);
  },
};
