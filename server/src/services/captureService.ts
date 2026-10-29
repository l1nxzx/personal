import { randomUUID } from 'node:crypto';
import type {
  Capture,
  CaptureRequest,
  CaptureResult,
  ConvertCaptureRequest,
} from '../../../shared/types.js';
import * as inbox from '../data/inboxRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { appendToJournalDay, createEntry } from './entryService.js';
import { createTask } from './taskService.js';
import { recordAction } from './activityService.js';

const toCapture = (r: inbox.CaptureRecord): Capture => ({
  id: r.id,
  text: r.text,
  kind: r.kind,
  createdAt: r.createdAt,
});

/** First line becomes a task title; anything after it becomes the task's notes. */
function splitFirstLine(text: string): { first: string; rest: string } {
  const [first = '', ...rest] = text.trim().split('\n');
  const title = first.length > 200 ? `${first.slice(0, 197)}…` : first;
  const overflow = first.length > 200 ? first : '';
  return { first: title, rest: [overflow, ...rest].join('\n').trim() };
}

/**
 * Quick Capture. With no kind (or note/idea) the text waits in the inbox; choosing
 * task or journal files it immediately, because choosing is already the decision.
 */
export async function capture(ctx: Ctx, input: CaptureRequest): Promise<CaptureResult> {
  const result = await fileCapture(ctx, input);
  // Every use of Quick Capture counts (two captures into one journal day are two). What it
  // filed is counted where it went, too: a task created, the journal day edited.
  await recordAction(ctx, 'capture.created', randomUUID());
  return result;
}

async function fileCapture(ctx: Ctx, input: CaptureRequest): Promise<CaptureResult> {
  const text = input.text.trim();
  if (input.kind === 'task') {
    const { first, rest } = splitFirstLine(text);
    return { destination: 'task', id: (await createTask(ctx, { title: first, notes: rest })).id };
  }
  if (input.kind === 'journal') {
    return {
      destination: 'journal',
      id: await appendToJournalDay(ctx, input.localDate, input.localTime, text),
    };
  }

  const record: inbox.CaptureRecord = {
    id: inbox.newId(ctx.userId),
    text,
    kind: input.kind ?? null,
    createdAt: new Date().toISOString(),
    searchTerms: buildSearchTerms(text),
  };
  await inbox.create(ctx.userId, record);
  notifyChange(ctx, 'inbox', record.id);
  return { destination: 'inbox', id: record.id };
}

export async function listInbox(ctx: Ctx): Promise<Capture[]> {
  return (await inbox.list(ctx.userId, 200)).map(toCapture);
}

export const inboxCount = (ctx: Ctx) => inbox.count(ctx.userId);

export async function deleteCapture(ctx: Ctx, id: string): Promise<void> {
  if (!(await inbox.get(ctx.userId, id))) throw notFound('This item is no longer in the inbox');
  await inbox.remove(ctx.userId, id);
  notifyChange(ctx, 'inbox', id);
}

/** Files an inbox item somewhere, then removes it from the inbox. */
export async function convertCapture(
  ctx: Ctx,
  id: string,
  input: ConvertCaptureRequest,
): Promise<CaptureResult> {
  const item = await inbox.get(ctx.userId, id);
  if (!item) throw notFound('This item is no longer in the inbox');

  let result: CaptureResult;
  if (input.to === 'note') {
    const { first, rest } = splitFirstLine(item.text);
    const entry = await createEntry(ctx, 'note', {
      title: rest ? first : '',
      body: rest || item.text,
      tags: item.kind === 'idea' ? ['idea'] : [],
    });
    result = { destination: 'note', id: entry.id };
  } else if (input.to === 'writing') {
    const { first, rest } = splitFirstLine(item.text);
    const entry = await createEntry(ctx, 'writing', {
      title: rest ? first : '',
      body: rest || item.text,
    });
    result = { destination: 'writing', id: entry.id };
  } else {
    result = await fileCapture(ctx, { ...input, text: item.text, kind: input.to });
  }

  await inbox.remove(ctx.userId, id);
  notifyChange(ctx, 'inbox', id);
  await recordAction(ctx, 'capture.filed', id);
  return result;
}
