/**
 * In-memory doubles for the phase 3 data modules (money ideas, expenses, reviews, timeline, vault)
 * and for profile statistics (aggregations over the other stores, active time).
 */
import type { VaultMeta } from '../../shared/types.js';
import type { ActivityDayRecord, ActivityMetaRecord } from '../src/data/activityRepo.js';
import type { ExpenseRecord, SubscriptionRecord } from '../src/data/expenseRepo.js';
import type { MomentRecord } from '../src/data/momentRepo.js';
import type { MoneyIdeaRecord } from '../src/data/moneyIdeaRepo.js';
import type { ReviewRecord } from '../src/data/reviewRepo.js';
import type { ScannedDoc, StatCollection, StatsMeta } from '../src/data/statsRepo.js';
import type { VaultItemRecord } from '../src/data/vaultRepo.js';
import { bucket, byDesc, clone, newId, page, stores } from './memory.js';

// ---------------------------------------------------------------- money ideas
const ideas = (uid: string) => bucket(stores.moneyIdeas, uid);
const ideaSummary = ({
  notes: _n,
  experiments: _e,
  description: _d,
  whyItMightWork: _w,
  searchTerms: _s,
  ...rest
}: MoneyIdeaRecord) => rest;

export const moneyIdeaRepo = {
  newId,
  async get(uid: string, id: string) {
    const r = ideas(uid).get(id);
    return r ? clone(r) : null;
  },
  async getMany(uid: string, ids: string[]) {
    return new Map(
      ids
        .filter((id) => ideas(uid).has(id))
        .map((id) => [id, ideaSummary(clone(ideas(uid).get(id)!))]),
    );
  },
  async create(uid: string, r: MoneyIdeaRecord) {
    ideas(uid).set(r.id, clone(r));
  },
  async update(uid: string, id: string, patch: Partial<MoneyIdeaRecord>) {
    ideas(uid).set(id, { ...ideas(uid).get(id)!, ...clone(patch), id });
  },
  async remove(uid: string, id: string) {
    ideas(uid).delete(id);
  },
  async listAll(uid: string) {
    return [...ideas(uid).values()].map((r) => ideaSummary(clone(r)));
  },
  async listByProject(uid: string, projectId: string) {
    return [...ideas(uid).values()]
      .filter((r) => r.projectId === projectId)
      .map((r) => ideaSummary(clone(r)));
  },
  async clearProject(uid: string, projectId: string) {
    for (const r of ideas(uid).values()) if (r.projectId === projectId) r.projectId = null;
  },
  async search(uid: string, term: string, limit: number) {
    return [...ideas(uid).values()]
      .filter((r) => r.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- expenses & subscriptions
const exps = (uid: string) => bucket(stores.expenses, uid);
const subsOf = (uid: string) => bucket(stores.subscriptions, uid);

function applyExpense(uid: string, r: ExpenseRecord, sign: 1 | -1) {
  const s = stores.expenseSummary.get(uid) ?? { months: {}, categoryLabels: {} };
  const month = (s.months[r.date.slice(0, 7)] ??= {});
  const t = (month[r.currency] ??= { total: 0, categories: {} });
  t.total += sign * r.amountMinor;
  t.categories[r.categoryKey] = (t.categories[r.categoryKey] ?? 0) + sign * r.amountMinor;
  if (sign === 1) s.categoryLabels[r.categoryKey] = r.category || 'Other';
  stores.expenseSummary.set(uid, s);
}

export const expenseRepo = {
  newId,
  newSubscriptionId: newId,
  async get(uid: string, id: string) {
    const r = exps(uid).get(id);
    return r ? clone(r) : null;
  },
  async create(uid: string, r: ExpenseRecord) {
    exps(uid).set(r.id, clone(r));
    applyExpense(uid, r, 1);
  },
  async update(uid: string, id: string, build: (c: ExpenseRecord) => ExpenseRecord) {
    const current = exps(uid).get(id);
    if (!current) return null;
    const next = build(clone(current));
    applyExpense(uid, current, -1);
    applyExpense(uid, next, 1);
    exps(uid).set(id, clone(next));
    return clone(next);
  },
  async remove(uid: string, id: string) {
    const current = exps(uid).get(id);
    if (!current) return false;
    exps(uid).delete(id);
    applyExpense(uid, current, -1);
    return true;
  },
  async list(uid: string, opts: { limit: number; cursor?: string; from?: string; to?: string }) {
    const all = [...exps(uid).values()]
      .filter(
        (r) =>
          (!opts.from || r.sortKey >= opts.from) &&
          (!opts.to || r.sortKey <= `${opts.to}~`) &&
          (!opts.cursor || r.sortKey < opts.cursor),
      )
      .sort(byDesc((r) => r.sortKey));
    return page(all, opts.limit, (r) => r.sortKey);
  },
  async listWhere(uid: string, field: 'moneyIdeaId' | 'projectId', value: string) {
    return [...exps(uid).values()].filter((r) => r[field] === value).map(clone);
  },
  async summary(uid: string) {
    return clone(stores.expenseSummary.get(uid) ?? { months: {}, categoryLabels: {} });
  },
  async search(uid: string, term: string, limit: number) {
    return [...exps(uid).values()]
      .filter((r) => r.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
  async getSubscription(uid: string, id: string) {
    const s = subsOf(uid).get(id);
    return s ? clone(s) : null;
  },
  async createSubscription(uid: string, s: SubscriptionRecord) {
    subsOf(uid).set(s.id, clone(s));
  },
  async updateSubscription(uid: string, id: string, patch: Partial<SubscriptionRecord>) {
    subsOf(uid).set(id, { ...subsOf(uid).get(id)!, ...clone(patch), id });
  },
  async removeSubscription(uid: string, id: string) {
    subsOf(uid).delete(id);
  },
  async listSubscriptions(uid: string) {
    return [...subsOf(uid).values()].map(clone);
  },
  async searchSubscriptions(uid: string, term: string, limit: number) {
    return [...subsOf(uid).values()]
      .filter((s) => s.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- reviews & timeline
const reviewsOf = (uid: string) => bucket(stores.reviews, uid);

export const reviewRepo = {
  async get(uid: string, weekStart: string) {
    const r = reviewsOf(uid).get(weekStart);
    return r ? clone(r) : null;
  },
  async save(uid: string, r: ReviewRecord) {
    reviewsOf(uid).set(r.weekStart, clone(r));
  },
  async remove(uid: string, weekStart: string) {
    reviewsOf(uid).delete(weekStart);
  },
  async list(uid: string, limit: number) {
    return [...reviewsOf(uid).values()]
      .sort(byDesc((r) => r.weekStart))
      .slice(0, limit)
      .map(clone);
  },
};

const momentsOf = (uid: string) => bucket(stores.moments, uid);

export const momentRepo = {
  newId,
  async get(uid: string, id: string) {
    const m = momentsOf(uid).get(id);
    return m ? clone(m) : null;
  },
  async create(uid: string, m: MomentRecord) {
    momentsOf(uid).set(m.id, clone(m));
  },
  async update(uid: string, id: string, patch: Partial<MomentRecord>) {
    momentsOf(uid).set(id, { ...momentsOf(uid).get(id)!, ...clone(patch), id });
  },
  async remove(uid: string, id: string) {
    momentsOf(uid).delete(id);
  },
  async listAll(uid: string) {
    return [...momentsOf(uid).values()].sort(byDesc((m) => m.date)).map(clone);
  },
  async search(uid: string, term: string, limit: number) {
    return [...momentsOf(uid).values()]
      .filter((m) => m.searchTerms.includes(term))
      .slice(0, limit)
      .map(clone);
  },
};

// ---------------------------------------------------------------- vault
const vaultOf = (uid: string) => bucket(stores.vaultItems, uid);

export const vaultRepo = {
  async getMeta(uid: string) {
    const m = stores.vaultMeta.get(uid);
    return m ? clone(m) : null;
  },
  async setMeta(uid: string, meta: VaultMeta) {
    stores.vaultMeta.set(uid, clone(meta));
  },
  newId,
  async listItems(uid: string) {
    return [...vaultOf(uid).values()].map(clone);
  },
  async getItem(uid: string, id: string) {
    const i = vaultOf(uid).get(id);
    return i ? clone(i) : null;
  },
  async createItem(uid: string, item: VaultItemRecord) {
    vaultOf(uid).set(item.id, clone(item));
  },
  async updateItem(
    uid: string,
    id: string,
    next: { iv: string; data: string; updatedAt: string },
    expected?: string,
  ) {
    const current = vaultOf(uid).get(id);
    if (!current) return { status: 'missing' as const };
    if (expected && current.updatedAt !== expected) return { status: 'conflict' as const };
    const item = { ...current, ...next };
    vaultOf(uid).set(id, item);
    return { status: 'ok' as const, item: clone(item) };
  },
  async removeItem(uid: string, id: string) {
    return vaultOf(uid).delete(id);
  },
  async removeAll(uid: string) {
    const ids = [...vaultOf(uid).keys()];
    vaultOf(uid).clear();
    stores.vaultMeta.delete(uid);
    return ids;
  },
};

// ---------------------------------------------------------------- profile statistics
type Doc = Record<string, unknown>;

/** The fake store behind each collection the statistics read. */
function collectionOf(uid: string, c: StatCollection): Map<string, Doc> {
  const stores_: Record<StatCollection, Map<string, unknown>> = {
    journal: bucket(stores.entries, `${uid}/journal`),
    writing: bucket(stores.entries, `${uid}/writing`),
    notes: bucket(stores.entries, `${uid}/note`),
    reviews: bucket(stores.reviews, uid),
    moments: bucket(stores.moments, uid),
    projects: bucket(stores.projects, uid),
    tasks: bucket(stores.tasks, uid),
    books: bucket(stores.books, uid),
    documents: bucket(stores.documents, uid),
    documentFolders: bucket(stores.folders, uid),
    moneyIdeas: bucket(stores.moneyIdeas, uid),
    income: bucket(stores.income, uid),
    expenses: bucket(stores.expenses, uid),
    subscriptions: bucket(stores.subscriptions, uid),
    vault: bucket(stores.vaultItems, uid),
  };
  return stores_[c] as Map<string, Doc>;
}

const pick = (d: Doc, fields: string[]) =>
  Object.fromEntries(fields.filter((f) => f in d).map((f) => [f, clone(d[f])]));

export const statsRepo = {
  async aggregate(uid: string, c: StatCollection, sumFields: string[] = []) {
    const docs = [...collectionOf(uid, c).values()];
    const sum = (f: string) =>
      docs.reduce((s, d) => s + (typeof d[f] === 'number' ? (d[f] as number) : 0), 0);
    return { count: docs.length, sums: Object.fromEntries(sumFields.map((f) => [f, sum(f)])) };
  },
  async countWhere(
    uid: string,
    c: StatCollection,
    field: string,
    op: '==' | '>',
    value: string | number | boolean,
  ) {
    // Like Firestore, a missing field matches neither `==` nor `>`.
    return [...collectionOf(uid, c).values()].filter((d) =>
      !(field in d)
        ? false
        : op === '=='
          ? d[field] === value
          : (d[field] as number) > (value as number),
    ).length;
  },
  async scan(
    uid: string,
    c: StatCollection,
    fields: string[],
    opts: { after?: string; limit: number },
  ): Promise<ScannedDoc[]> {
    return [...collectionOf(uid, c).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .filter(([id]) => !opts.after || id > opts.after)
      .slice(0, opts.limit)
      .map(([id, d]) => ({ id, data: pick(d, fields) }));
  },
  async setFields(
    uid: string,
    c: StatCollection,
    updates: { id: string; data: Record<string, number> }[],
  ) {
    const col = collectionOf(uid, c);
    for (const u of updates) {
      const d = col.get(u.id);
      if (d) Object.assign(d, u.data);
    }
  },
  async getMeta(uid: string) {
    return { ...(stores.statsMeta.get(uid) ?? {}) };
  },
  async setMeta(uid: string, patch: StatsMeta) {
    stores.statsMeta.set(uid, { ...(stores.statsMeta.get(uid) ?? {}), ...patch });
  },
};

/** Test helper: put a document straight into a store, as if written before stats existed. */
export function seedRaw(uid: string, c: StatCollection, id: string, doc: Doc) {
  collectionOf(uid, c).set(id, clone(doc));
}

const daysOf = (uid: string) => bucket(stores.activityDays, uid);

export const activityRepo = {
  async getMeta(uid: string) {
    const m = stores.activityMeta.get(uid);
    return m ? clone(m) : null;
  },
  async record(
    uid: string,
    dates: string[],
    build: (
      meta: ActivityMetaRecord | null,
      days: Map<string, ActivityDayRecord>,
    ) => { meta: ActivityMetaRecord; days: ActivityDayRecord[] } | null,
  ) {
    const days = new Map(
      dates.filter((d) => daysOf(uid).has(d)).map((d) => [d, clone(daysOf(uid).get(d)!)]),
    );
    const next = build(clone(stores.activityMeta.get(uid) ?? null), days);
    if (!next) return;
    stores.activityMeta.set(uid, clone(next.meta));
    for (const d of next.days) daysOf(uid).set(d.date, clone(d));
  },
  async rebuild(
    uid: string,
    build: (meta: ActivityMetaRecord | null, days: ActivityDayRecord[]) => ActivityMetaRecord,
  ) {
    const meta = build(
      clone(stores.activityMeta.get(uid) ?? null),
      [...daysOf(uid).values()].map(clone),
    );
    stores.activityMeta.set(uid, clone(meta));
  },
};

/** Test helper: the stored day records. */
export const activityDays = (uid: string) => [...daysOf(uid).values()].map(clone);
