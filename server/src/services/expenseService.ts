import type {
  CreateExpenseRequest,
  CreateSubscriptionRequest,
  Expense,
  ExpenseSummary,
  Frequency,
  Page,
  Subscription,
  UpdateExpenseRequest,
  UpdateSubscriptionRequest,
} from '../../../shared/types.js';
import * as expenses from '../data/expenseRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { sourceKey } from './incomeService.js';

const sortKey = (date: string, createdAt: string, id: string) => `${date}|${createdAt}|${id}`;
const cleanCategory = (c: string | undefined) => (c ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);

export const toExpense = (r: expenses.ExpenseRecord): Expense => ({
  id: r.id,
  date: r.date,
  amountMinor: r.amountMinor,
  currency: r.currency,
  category: r.category,
  description: r.description,
  moneyIdeaId: r.moneyIdeaId,
  projectId: r.projectId,
  subscriptionId: r.subscriptionId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const toSubscription = (r: expenses.SubscriptionRecord): Subscription => ({
  id: r.id,
  name: r.name,
  amountMinor: r.amountMinor,
  currency: r.currency,
  frequency: r.frequency,
  nextRenewal: r.nextRenewal,
  category: r.category,
  notes: r.notes,
  active: r.active,
  moneyIdeaId: r.moneyIdeaId,
  projectId: r.projectId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** An actual, recorded cost. */
export async function addExpense(ctx: Ctx, input: CreateExpenseRequest): Promise<Expense> {
  const id = expenses.newId(ctx.userId);
  const now = new Date().toISOString();
  const category = cleanCategory(input.category);
  const record: expenses.ExpenseRecord = {
    id,
    date: input.date,
    amountMinor: input.amountMinor,
    currency: input.currency,
    category,
    categoryKey: category ? sourceKey(category) : 'other',
    description: input.description?.trim() ?? '',
    moneyIdeaId: input.moneyIdeaId ?? null,
    projectId: input.projectId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    sortKey: sortKey(input.date, now, id),
    createdAt: now,
    updatedAt: now,
    searchTerms: buildSearchTerms(category, input.description ?? ''),
  };
  await expenses.create(ctx.userId, record);
  notifyChange(ctx, 'expense', id);
  return toExpense(record);
}

export async function updateExpense(
  ctx: Ctx,
  id: string,
  input: UpdateExpenseRequest,
): Promise<Expense> {
  const saved = await expenses.update(ctx.userId, id, (current) => {
    const category =
      input.category !== undefined ? cleanCategory(input.category) : current.category;
    const date = input.date ?? current.date;
    const next: expenses.ExpenseRecord = {
      ...current,
      ...input,
      category,
      categoryKey: category ? sourceKey(category) : 'other',
      description: input.description?.trim() ?? current.description,
      date,
      sortKey: sortKey(date, current.createdAt, id),
      updatedAt: new Date().toISOString(),
    };
    next.searchTerms = buildSearchTerms(next.category, next.description);
    return next;
  });
  if (!saved) throw notFound('This expense no longer exists');
  notifyChange(ctx, 'expense', id);
  return toExpense(saved);
}

export async function deleteExpense(ctx: Ctx, id: string): Promise<void> {
  if (!(await expenses.remove(ctx.userId, id))) throw notFound('This expense no longer exists');
  notifyChange(ctx, 'expense', id);
}

export async function listExpenses(
  ctx: Ctx,
  opts: {
    month?: string;
    limit: number;
    cursor?: string;
    moneyIdeaId?: string;
    projectId?: string;
  },
): Promise<Page<Expense>> {
  if (opts.moneyIdeaId || opts.projectId) {
    const field = opts.moneyIdeaId ? 'moneyIdeaId' : 'projectId';
    const items = (
      await expenses.listWhere(ctx.userId, field, (opts.moneyIdeaId ?? opts.projectId)!)
    )
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .map(toExpense);
    return { items, nextCursor: null };
  }
  const range = opts.month ? { from: `${opts.month}-01`, to: `${opts.month}-31` } : {};
  const page = await expenses.list(ctx.userId, { ...opts, ...range });
  return { items: page.items.map(toExpense), nextCursor: page.nextCursor };
}

export const expenseSummary = (ctx: Ctx): Promise<ExpenseSummary> => expenses.summary(ctx.userId);

// ---------------------------------------------------------------- subscriptions

export function advance(date: string, frequency: Frequency): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const months = { weekly: 0, monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  const next =
    frequency === 'weekly'
      ? new Date(Date.UTC(y, m - 1, d + 7))
      : new Date(Date.UTC(y, m - 1 + months, 1));
  if (frequency !== 'weekly') {
    // Keep the day of month, clamped to the month's length (31 Jan → 28/29 Feb).
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(d, last));
  }
  return next.toISOString().slice(0, 10);
}

const subTerms = (s: { name: string; category: string; notes: string }) =>
  buildSearchTerms(s.name, s.category, s.notes);

export async function addSubscription(
  ctx: Ctx,
  input: CreateSubscriptionRequest,
): Promise<Subscription> {
  const now = new Date().toISOString();
  const record: expenses.SubscriptionRecord = {
    id: expenses.newSubscriptionId(ctx.userId),
    name: input.name.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    frequency: input.frequency,
    nextRenewal: input.nextRenewal ?? null,
    category: cleanCategory(input.category),
    notes: input.notes ?? '',
    active: true,
    moneyIdeaId: input.moneyIdeaId ?? null,
    projectId: input.projectId ?? null,
    createdAt: now,
    updatedAt: now,
    searchTerms: [],
  };
  record.searchTerms = subTerms(record);
  await expenses.createSubscription(ctx.userId, record);
  notifyChange(ctx, 'subscription', record.id);
  return toSubscription(record);
}

export async function updateSubscription(
  ctx: Ctx,
  id: string,
  input: UpdateSubscriptionRequest,
): Promise<Subscription> {
  const current = await expenses.getSubscription(ctx.userId, id);
  if (!current) throw notFound('This subscription no longer exists');
  const next: expenses.SubscriptionRecord = {
    ...current,
    ...input,
    category: input.category !== undefined ? cleanCategory(input.category) : current.category,
    updatedAt: new Date().toISOString(),
  };
  next.searchTerms = subTerms(next);
  const { id: _id, ...patch } = next;
  await expenses.updateSubscription(ctx.userId, id, patch);
  notifyChange(ctx, 'subscription', id);
  return toSubscription(next);
}

export async function deleteSubscription(ctx: Ctx, id: string): Promise<void> {
  if (!(await expenses.getSubscription(ctx.userId, id)))
    throw notFound('This subscription no longer exists');
  await expenses.removeSubscription(ctx.userId, id);
  notifyChange(ctx, 'subscription', id);
}

export async function listSubscriptions(ctx: Ctx): Promise<Subscription[]> {
  return (await expenses.listSubscriptions(ctx.userId))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (a.nextRenewal ?? '9999').localeCompare(b.nextRenewal ?? '9999'),
    )
    .map(toSubscription);
}

/**
 * A renewal was actually paid: records it as a real expense (projection → record) and moves the
 * next renewal date forward by one period.
 */
export async function recordPayment(
  ctx: Ctx,
  id: string,
  input: { date: string; amountMinor?: number },
): Promise<{ expense: Expense; subscription: Subscription }> {
  const sub = await expenses.getSubscription(ctx.userId, id);
  if (!sub) throw notFound('This subscription no longer exists');
  const expense = await addExpense(ctx, {
    date: input.date,
    amountMinor: input.amountMinor ?? sub.amountMinor,
    currency: sub.currency,
    category: sub.category || 'Subscriptions',
    description: sub.name,
    subscriptionId: sub.id,
    moneyIdeaId: sub.moneyIdeaId,
    projectId: sub.projectId,
  });
  // The billing cycle follows the renewal date, not the day the payment was noted.
  const subscription = await updateSubscription(ctx, id, {
    nextRenewal: advance(sub.nextRenewal ?? input.date, sub.frequency),
  });
  return { expense, subscription };
}
