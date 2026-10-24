import type {
  Book,
  BookStatus,
  BookSummary,
  CreateBookRequest,
  Entry,
  UpdateBookRequest,
} from '../../../shared/types.js';
import * as books from '../data/bookRepo.js';
import * as links from '../data/linkRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { createEntry } from './entryService.js';
import { textStatsOf } from './textStats.js';

export const toSummary = (r: books.BookSummaryRecord): BookSummary => ({
  id: r.id,
  title: r.title,
  author: r.author,
  status: r.status,
  rating: r.rating,
  startedOn: r.startedOn,
  finishedOn: r.finishedOn,
  quoteCount: r.quoteCount,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const toBook = (r: books.BookRecord): Book => {
  const { quoteCount: _q, ...rest } = toSummary(r);
  return { ...rest, notes: r.notes, quotes: r.quotes };
};

const terms = (b: Pick<books.BookRecord, 'title' | 'author' | 'notes' | 'quotes'>) =>
  buildSearchTerms(
    b.title,
    b.author,
    b.notes,
    b.quotes.map((q) => `${q.text} ${q.note}`).join(' '),
  );

const localToday = () => new Date().toISOString().slice(0, 10);

export async function createBook(ctx: Ctx, input: CreateBookRequest): Promise<Book> {
  const now = new Date().toISOString();
  const status = input.status ?? 'want';
  const base = { title: input.title, author: input.author ?? '', notes: '', quotes: [] };
  const record: books.BookRecord = {
    id: books.newId(ctx.userId),
    ...base,
    status,
    rating: null,
    startedOn: status === 'reading' ? localToday() : null,
    finishedOn: null,
    quoteCount: 0,
    createdAt: now,
    updatedAt: now,
    searchTerms: terms(base),
    ...textStatsOf('book', base),
  };
  await books.create(ctx.userId, record);
  notifyChange(ctx, 'book', record.id);
  return toBook(record);
}

export async function getBook(ctx: Ctx, id: string): Promise<Book> {
  const r = await books.get(ctx.userId, id);
  if (!r) throw notFound('This book is no longer in your library');
  return toBook(r);
}

/** By status (one equality query): currently reading by start date, finished by finish date. */
export async function listBooks(ctx: Ctx, status: BookStatus): Promise<BookSummary[]> {
  const sortKey = (b: books.BookSummaryRecord) =>
    (status === 'finished' ? b.finishedOn : status === 'reading' ? b.startedOn : null) ??
    b.updatedAt;
  return (await books.listByStatus(ctx.userId, status))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .map(toSummary);
}

export async function updateBook(
  ctx: Ctx,
  id: string,
  input: UpdateBookRequest,
  today?: string,
): Promise<Book> {
  const current = await books.get(ctx.userId, id);
  if (!current) throw notFound('This book is no longer in your library');
  const next: books.BookRecord = { ...current, ...input, updatedAt: new Date().toISOString() };
  // Moving a book along fills in the obvious date, unless one is already set.
  const day = today ?? localToday();
  if (input.status === 'reading' && !next.startedOn) next.startedOn = day;
  if (input.status === 'finished' && !next.finishedOn) next.finishedOn = day;
  next.quoteCount = next.quotes.length;
  next.searchTerms = terms(next);
  Object.assign(next, textStatsOf('book', next));
  const { id: _id, ...patch } = next;
  await books.update(ctx.userId, id, patch);
  notifyChange(ctx, 'book', id);
  return toBook(next);
}

export async function deleteBook(ctx: Ctx, id: string): Promise<void> {
  if (!(await books.get(ctx.userId, id))) throw notFound('This book is no longer in your library');
  await books.remove(ctx.userId, id);
  await links.removeAllFor(ctx.userId, `book:${id}`);
  notifyChange(ctx, 'book', id);
}

/** Turns a saved passage into a quote note in Ideas & Knowledge, linked back to the book. */
export async function quoteToNote(ctx: Ctx, bookId: string, quoteId: string): Promise<Entry> {
  const book = await books.get(ctx.userId, bookId);
  const quote = book?.quotes.find((q) => q.id === quoteId);
  if (!book || !quote) throw notFound('This quote no longer exists');
  const where =
    [book.author, book.title].filter(Boolean).join(', ') + (quote.page ? `, p. ${quote.page}` : '');
  const note = await createEntry(ctx, 'note', {
    noteType: 'quote',
    title: '',
    body: `> ${quote.text.replace(/\n/g, '\n> ')}${quote.note ? `\n\n${quote.note}` : ''}`,
    sources: [{ id: `book-${book.id}`, label: where, url: null }],
  });
  await links.add(ctx.userId, `note:${note.id}`, `book:${book.id}`);
  notifyChange(ctx, 'link');
  return note;
}
