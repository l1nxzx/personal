import type { CreateMomentRequest, Moment, UpdateMomentRequest } from '../../../shared/types.js';
import * as moments from '../data/momentRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { describe } from './linkService.js';
import { textStatsOf } from './textStats.js';

export const toMoment = (r: moments.MomentRecord): Moment => ({
  id: r.id,
  date: r.date,
  title: r.title,
  description: r.description,
  ref: r.ref,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** A moment is only ever added on purpose; nothing is turned into a life event automatically. */
export async function addMoment(ctx: Ctx, input: CreateMomentRequest): Promise<Moment> {
  if (input.ref && !(await describe(ctx.userId, [input.ref])).size)
    throw notFound('That item no longer exists');
  const now = new Date().toISOString();
  const record: moments.MomentRecord = {
    id: moments.newId(ctx.userId),
    date: input.date,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    ref: input.ref ?? null,
    createdAt: now,
    updatedAt: now,
    searchTerms: buildSearchTerms(input.title, input.description ?? ''),
    ...textStatsOf('moment', { description: input.description ?? '' }),
  };
  await moments.create(ctx.userId, record);
  notifyChange(ctx, 'moment', record.id);
  return toMoment(record);
}

export async function updateMoment(
  ctx: Ctx,
  id: string,
  input: UpdateMomentRequest,
): Promise<Moment> {
  const current = await moments.get(ctx.userId, id);
  if (!current) throw notFound('This moment no longer exists');
  const next = { ...current, ...input, updatedAt: new Date().toISOString() };
  next.searchTerms = buildSearchTerms(next.title, next.description);
  Object.assign(next, textStatsOf('moment', next));
  const { id: _id, ...patch } = next;
  await moments.update(ctx.userId, id, patch);
  notifyChange(ctx, 'moment', id);
  return toMoment(next);
}

export async function deleteMoment(ctx: Ctx, id: string): Promise<void> {
  if (!(await moments.get(ctx.userId, id))) throw notFound('This moment no longer exists');
  await moments.remove(ctx.userId, id);
  notifyChange(ctx, 'moment', id);
}

export async function listMoments(ctx: Ctx): Promise<Moment[]> {
  return (await moments.listAll(ctx.userId)).map(toMoment);
}
