import { ChevronDown, Pin, Plus } from 'lucide-react';
import { useDeferredValue } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EntrySummary, NoteType } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote, Loading } from '../../components/ui/misc';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, relativeDayInline } from '../../lib/dates';
import { useSearch } from '../me/api';
import { useNoteList, useTags, useTopics } from './api';
import { EntryRowsSkeleton, FilterSearch, TagFilter } from './ListParts';
import { NOTE_TYPES, noteTypeLabel } from './NoteDetails';
import { useQuickAction } from '../../context/UIContext';

/** One knowledge note in a list: title (or its first words), kind, topic, last touched. */
export function NoteRow({ e, showTopic = true }: { e: EntrySummary; showTopic?: boolean }) {
  const n = e.note!;
  return (
    <Link
      to={`/ideas/${e.id}`}
      className="-mx-2 block rounded px-2 py-3.5 hover:bg-surface/70 active:bg-surface"
    >
      <div className="flex items-center gap-2">
        {e.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Pinned" />}
        <h3
          className={cn(
            'min-w-0 flex-1 truncate font-serif text-[1.0625rem] font-medium',
            e.title ? 'text-ink' : 'text-ink-muted',
          )}
          style={{ fontVariationSettings: "'opsz' 20" }}
        >
          {e.title || e.excerpt || 'Untitled'}
        </h3>
      </div>
      {e.title && e.excerpt && (
        <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-muted">{e.excerpt}</p>
      )}
      <p className="mt-1.5 text-2xs text-ink-faint">
        <span className="uppercase tracking-wider">{noteTypeLabel(n.noteType)}</span>
        {[
          showTopic && n.topic,
          n.noteType === 'belief' && n.lastConsidered
            ? `last considered ${relativeDayInline(n.lastConsidered)}`
            : n.noteType === 'decision' && (n.decided || n.revisitOn)
              ? n.decided
                ? 'outcome recorded'
                : `look back ${relativeDayInline(n.revisitOn!)}`
              : formatAgo(e.updatedAt),
          e.tags.length > 0 && e.tags.map((t) => `#${t}`).join(' '),
        ]
          .filter(Boolean)
          .map((part) => ` · ${part}`)
          .join('')}
      </p>
    </Link>
  );
}

export function NewNoteButton({ topic }: { topic?: string }) {
  const navigate = useNavigate();
  return (
    <Menu
      trigger={(p) => (
        <Button variant="primary" aria-label="New note" className="px-3" {...p}>
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          <span className="hidden sm:inline">New</span>
          <ChevronDown className="-mr-1 h-3.5 w-3.5 opacity-80" />
        </Button>
      )}
      items={NOTE_TYPES.map((t) => ({
        label: t.label,
        onSelect: () => navigate('/ideas/new', { state: { noteType: t.value, topic } }),
      }))}
    />
  );
}

const TYPE_FILTERS: { value: NoteType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'question', label: 'Questions' },
  { value: 'belief', label: 'Beliefs' },
  { value: 'quote', label: 'Quotes' },
  { value: 'decision', label: 'Decisions' },
];

/** Ideas & Knowledge: notes to keep working with, browsable by topic, kind and tag. */
export default function IdeasPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic') ?? undefined;
  const type = (params.get('type') as NoteType | null) ?? undefined;
  const tag = params.get('tag') ?? undefined;
  const q = params.get('q') ?? '';
  const deferredQ = useDeferredValue(q);
  const searching = deferredQ.trim().length >= 2;

  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const list = useNoteList({ topic, type, tag });
  const topics = useTopics();
  const tags = useTags('note');
  const search = useSearch(deferredQ);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  useQuickAction('New note', () => navigate('/ideas/new', { state: { topic } }));

  return (
    <Page width="wide">
      <PageHeader title="Ideas & Knowledge" actions={<NewNoteButton topic={topic} />} />

      <div className="mt-6 grid grid-cols-1 gap-x-12 lg:grid-cols-[12rem_minmax(0,1fr)]">
        {/* Topics: a sidebar on desktop, a select on phones */}
        <nav aria-label="Topics" className="hidden lg:block">
          <h2 className="section-label mb-2">Topics</h2>
          <ul className="-mx-2 space-y-0.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => set('topic', undefined)}
                className={cn(
                  'flex w-full justify-between rounded px-2 py-1.5 text-left',
                  !topic ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                All notes
              </button>
            </li>
            {topics.data?.map((t) => (
              <li key={t.topic}>
                <button
                  type="button"
                  onClick={() => set('topic', t.topic)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left',
                    topic?.toLowerCase() === t.topic.toLowerCase()
                      ? 'bg-surface-2 text-ink'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <span className="truncate">{t.topic}</span>
                  <span className="text-2xs text-ink-faint">{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
          {topics.isLoading && (
            <Skeleton className="-mx-2 mt-0.5 space-y-0.5">
              {['70%', '52%', '62%'].map((w) => (
                <SkeletonText key={w} className="px-2 py-1.5 text-sm" width={w} />
              ))}
            </Skeleton>
          )}
          {topics.isSuccess && !topics.data.length && (
            <p className="text-[0.8125rem] text-ink-faint">
              Give a note a topic and it will appear here.
            </p>
          )}
        </nav>

        <div className="min-w-0">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <FilterSearch
                value={q}
                onChange={(v) => set('q', v)}
                placeholder="Search ideas & notes"
              />
              <select
                value={topic ?? ''}
                onChange={(e) => set('topic', e.target.value || undefined)}
                aria-label="Topic"
                className="h-10 w-[8.5rem] shrink-0 rounded border border-line bg-bg px-2 text-sm text-ink-muted lg:hidden"
              >
                <option value="">All topics</option>
                {topics.data?.map((t) => (
                  <option key={t.topic} value={t.topic}>
                    {t.topic}
                  </option>
                ))}
              </select>
            </div>
            {!searching && (
              <>
                <div
                  className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
                  role="group"
                  aria-label="Kind"
                >
                  {TYPE_FILTERS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      aria-pressed={(type ?? '') === f.value}
                      onClick={() => set('type', f.value || undefined)}
                      className={cn(
                        'h-9 shrink-0 rounded px-3 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8125rem]',
                        (type ?? '') === f.value
                          ? 'bg-surface-2 text-ink'
                          : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <TagFilter tags={tags.data} selected={tag} onSelect={(t) => set('tag', t)} />
              </>
            )}
          </div>

          {topic && !searching && (
            <h2
              className="mt-6 font-serif text-[1.25rem] text-ink"
              style={{ fontVariationSettings: "'opsz' 28" }}
            >
              {topics.data?.find((t) => t.topic.toLowerCase() === topic.toLowerCase())?.topic ??
                topic}
            </h2>
          )}

          <div className="mt-3">
            {searching ? (
              search.isLoading ? (
                <Loading label="Searching…" />
              ) : (
                <SearchResults
                  results={(search.data ?? []).filter((r) => r.type === 'note')}
                  q={deferredQ}
                />
              )
            ) : list.isLoading || tags.isLoading ? (
              <EntryRowsSkeleton pad="py-3.5" rows={5} />
            ) : list.isError ? (
              <ErrorNote onRetry={() => void list.refetch()}>{errorMessage(list.error)}</ErrorNote>
            ) : !items.length ? (
              topic || type || tag ? (
                <Empty>Nothing matches these filters.</Empty>
              ) : (
                <Empty>
                  Notes you keep working with live here: questions you&apos;re investigating,
                  beliefs you want to revisit, passages, explanations. Capture something and file it
                  here, or start with “New”.
                </Empty>
              )
            ) : (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {items.map((e) => (
                  <li key={e.id}>
                    <NoteRow e={e} showTopic={!topic} />
                  </li>
                ))}
              </ul>
            )}
            {!searching && list.hasNextPage && (
              <Button
                className="mt-6"
                onClick={() => void list.fetchNextPage()}
                busy={list.isFetchingNextPage}
              >
                Show more
              </Button>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

function SearchResults({
  results,
  q,
}: {
  results: { id: string; title: string; snippet: string; date: string }[];
  q: string;
}) {
  if (!results.length) return <Empty>No notes mention “{q.trim()}”.</Empty>;
  return (
    <ul className="divide-y divide-line/70 border-t border-line/70">
      {results.map((r) => (
        <li key={r.id}>
          <Link
            to={`/ideas/${r.id}`}
            className="-mx-2 block rounded px-2 py-3.5 hover:bg-surface/70 active:bg-surface"
          >
            <span className="block truncate font-serif text-[1.0625rem] text-ink">
              {r.title || 'Untitled'}
            </span>
            {r.snippet && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.snippet}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
