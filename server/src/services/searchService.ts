import type { SearchResult, SearchType } from '../../../shared/types.js';
import * as books from '../data/bookRepo.js';
import * as documents from '../data/documentRepo.js';
import * as expenses from '../data/expenseRepo.js';
import * as moments from '../data/momentRepo.js';
import * as moneyIdeas from '../data/moneyIdeaRepo.js';
import * as entries from '../data/entryRepo.js';
import * as inbox from '../data/inboxRepo.js';
import * as income from '../data/incomeRepo.js';
import * as projects from '../data/projectRepo.js';
import * as tasks from '../data/taskRepo.js';
import { buildSearchTerms, excerpt, fold, matchesAll, queryTokens, snippet } from '../lib/text.js';
import type { Ctx } from './context.js';

const PER_TYPE_FETCH = 40;
const PER_TYPE_RESULTS = 8;

interface Candidate {
  result: SearchResult;
  terms: string[];
  titleText: string;
  updatedAt: string;
}

type Fetcher = (uid: string, term: string, tokens: string[]) => Promise<Candidate[]>;

const entryFetcher =
  (kind: 'journal' | 'writing' | 'note'): Fetcher =>
  async (uid, term, tokens) =>
    (await entries.search(uid, kind, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: kind,
        id: r.id,
        title: r.title || (kind === 'note' ? excerpt(r.body, 80) : ''),
        snippet: snippet(r.body, tokens),
        date: kind === 'journal' ? (r.date ?? r.updatedAt) : r.updatedAt,
      },
      terms: r.searchTerms,
      titleText: `${r.title} ${r.topic ?? ''}`,
      updatedAt: r.updatedAt,
    }));

/** One fetcher per searchable type. Vault content is not stored in any of these. */
const FETCHERS: Record<SearchType, Fetcher> = {
  journal: entryFetcher('journal'),
  writing: entryFetcher('writing'),
  note: entryFetcher('note'),
  task: async (uid, term, tokens) =>
    (await tasks.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'task',
        id: r.id,
        title: r.title,
        snippet: r.notes ? snippet(r.notes, tokens) : '',
        date: r.updatedAt,
      },
      terms: r.searchTerms,
      titleText: r.title,
      updatedAt: r.updatedAt,
    })),
  capture: async (uid, term) =>
    (await inbox.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'capture',
        id: r.id,
        title: excerpt(r.text, 90),
        snippet: '',
        date: r.createdAt,
      },
      terms: r.searchTerms,
      titleText: r.text,
      updatedAt: r.createdAt,
    })),
  book: async (uid, term, tokens) =>
    (await books.search(uid, term, PER_TYPE_FETCH)).map((r) => {
      const quote = r.quotes.find((q) => matchesAll(buildSearchTerms(q.text), tokens));
      return {
        result: {
          type: 'book',
          id: r.id,
          title: r.title,
          snippet: quote
            ? `“${excerpt(quote.text, 140)}”`
            : r.notes
              ? snippet(r.notes, tokens)
              : r.author,
          date: r.updatedAt,
        },
        terms: r.searchTerms,
        titleText: `${r.title} ${r.author}`,
        updatedAt: r.updatedAt,
      };
    }),
  project: async (uid, term, tokens) =>
    (await projects.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'project',
        id: r.id,
        title: r.name,
        snippet: snippet(r.description, tokens),
        date: r.updatedAt,
      },
      terms: r.searchTerms,
      titleText: r.name,
      updatedAt: r.updatedAt,
    })),
  document: async (uid, term) =>
    (await documents.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'document',
        id: r.id,
        title: r.name,
        snippet: r.folder ?? '',
        date: r.createdAt,
      },
      terms: r.searchTerms,
      titleText: r.name,
      updatedAt: r.updatedAt,
    })),
  moneyIdea: async (uid, term, tokens) =>
    (await moneyIdeas.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'moneyIdea',
        id: r.id,
        title: r.name,
        snippet: r.nextStep
          ? `Next: ${r.nextStep}`
          : snippet(`${r.description} ${r.notes}`, tokens),
        date: r.updatedAt,
      },
      terms: r.searchTerms,
      titleText: r.name,
      updatedAt: r.updatedAt,
    })),
  expense: async (uid, term) =>
    (await expenses.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'expense',
        id: r.id,
        title: r.description || r.category || 'Expense',
        snippet: [`${(r.amountMinor / 100).toFixed(2)} ${r.currency}`, r.category]
          .filter(Boolean)
          .join(' · '),
        date: r.date,
      },
      terms: r.searchTerms,
      titleText: `${r.description} ${r.category}`,
      updatedAt: r.updatedAt,
    })),
  moment: async (uid, term) =>
    (await moments.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'moment',
        id: r.id,
        title: r.title,
        snippet: excerpt(r.description, 140),
        date: r.date,
      },
      terms: r.searchTerms,
      titleText: r.title,
      updatedAt: r.updatedAt,
    })),
  income: async (uid, term) =>
    (await income.search(uid, term, PER_TYPE_FETCH)).map((r) => ({
      result: {
        type: 'income',
        id: r.id,
        title: r.source,
        snippet: [
          `${(r.amountMinor / 100).toFixed(2)} ${r.currency}`,
          r.status === 'pending' ? 'pending' : '',
          r.description,
        ]
          .filter(Boolean)
          .join(' · '),
        date: r.date,
      },
      terms: r.searchTerms,
      titleText: r.source,
      updatedAt: r.updatedAt,
    })),
};

const ALL_TYPES = Object.keys(FETCHERS) as SearchType[];

/**
 * Universal search. Queries each collection on the longest token, then requires every token
 * to match. Results are ranked by title matches, then recency, a few per type.
 */
export async function search(ctx: Ctx, q: string, types?: SearchType[]): Promise<SearchResult[]> {
  const tokens = queryTokens(q);
  const primary = tokens[0];
  if (!primary || primary.length < 2) return [];

  const wanted = types?.length ? types : ALL_TYPES;
  const candidates = (
    await Promise.all(wanted.map((t) => FETCHERS[t](ctx.userId, primary, tokens)))
  ).flat();

  const score = (c: Candidate) => {
    const title = fold(c.titleText);
    return tokens.filter((t) => title.includes(t)).length;
  };

  const perType = new Map<SearchType, number>();
  return candidates
    .filter((c) => matchesAll(c.terms, tokens))
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || b.c.updatedAt.localeCompare(a.c.updatedAt))
    .filter(({ c }) => {
      const n = perType.get(c.result.type) ?? 0;
      perType.set(c.result.type, n + 1);
      return n < PER_TYPE_RESULTS;
    })
    .map(({ c }) => c.result);
}
