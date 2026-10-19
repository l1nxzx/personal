import type {
  CreateIncomeRequest,
  IncomeEntry,
  IncomeSummary,
  Page,
  UpdateIncomeRequest,
} from '../../../shared/types.js';
import * as income from '../data/incomeRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';

/** "Gumroad", "gumroad " and "GUMROAD" are one source. Safe as a Firestore map key. */
export const sourceKey = (source: string) =>
  source
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.~*/[\]`]/g, '-')
    .slice(0, 60) || 'other';

const sortKey = (date: string, createdAt: string, id: string) => `${date}|${createdAt}|${id}`;

export const toIncome = (r: income.IncomeRecord): IncomeEntry => ({
  id: r.id,
  date: r.date,
  source: r.source,
  amountMinor: r.amountMinor,
  currency: r.currency,
  description: r.description,
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const terms = (r: Pick<income.IncomeRecord, 'source' | 'description' | 'currency'>) =>
  buildSearchTerms(r.source, r.description, r.currency);

export async function addIncome(ctx: Ctx, input: CreateIncomeRequest): Promise<IncomeEntry> {
  const id = income.newId(ctx.userId);
  const now = new Date().toISOString();
  const source = input.source.trim().replace(/\s+/g, ' ');
  const record: income.IncomeRecord = {
    id,
    date: input.date,
    source,
    sourceKey: sourceKey(source),
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.description?.trim() ?? '',
    status: input.status ?? 'received',
    sortKey: sortKey(input.date, now, id),
    createdAt: now,
    updatedAt: now,
    searchTerms: [],
  };
  record.searchTerms = terms(record);
  await income.create(ctx.userId, record);
  notifyChange(ctx, 'income', id);
  return toIncome(record);
}

export async function updateIncome(
  ctx: Ctx,
  id: string,
  input: UpdateIncomeRequest,
): Promise<IncomeEntry> {
  const saved = await income.update(ctx.userId, id, (current) => {
    const source =
      input.source !== undefined ? input.source.trim().replace(/\s+/g, ' ') : current.source;
    const date = input.date ?? current.date;
    const next: income.IncomeRecord = {
      ...current,
      ...input,
      source,
      sourceKey: sourceKey(source),
      date,
      description: input.description?.trim() ?? current.description,
      sortKey: sortKey(date, current.createdAt, id),
      updatedAt: new Date().toISOString(),
    };
    next.searchTerms = terms(next);
    return next;
  });
  if (!saved) throw notFound('This income entry no longer exists');
  notifyChange(ctx, 'income', id);
  return toIncome(saved);
}

export async function deleteIncome(ctx: Ctx, id: string): Promise<void> {
  if (!(await income.remove(ctx.userId, id))) throw notFound('This income entry no longer exists');
  notifyChange(ctx, 'income', id);
}

export async function listIncome(
  ctx: Ctx,
  opts: { month?: string; limit: number; cursor?: string },
): Promise<Page<IncomeEntry>> {
  const range = opts.month ? { from: `${opts.month}-01`, to: `${opts.month}-31` } : {};
  const page = await income.list(ctx.userId, { ...opts, ...range });
  return { items: page.items.map(toIncome), nextCursor: page.nextCursor };
}

export const incomeSummary = (ctx: Ctx): Promise<IncomeSummary> => income.summary(ctx.userId);
