import { useDeferredValue } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { EntrySummary, SearchResult } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Empty, ErrorNote, Loading } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/apiFetch';
import {
  formatMonthYear,
  formatRelativeDay,
  parseLocalDate,
  today,
  weekdayShort,
} from '../../lib/dates';
import { useSearch } from '../me/api';
import { useJournalList, useTags } from './api';
import {
  EncryptedMark,
  encryptedLabel,
  FilterSearch,
  GroupHeading,
  JournalSectionHeader,
  TagFilter,
  useEncryptedState,
} from './ListParts';
import { cn } from '../../lib/cn';

/** The last ten years of months, newest first, for the month filter. */
const MONTHS = (() => {
  const d = new Date();
  return Array.from({ length: 120 }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  });
})();

/** Chronological journal: grouped by month, newest first. */
export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? undefined;
  const month = params.get('month') ?? ''; // YYYY-MM
  const deferredQ = useDeferredValue(q);

  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const range = month ? { from: `${month}-01`, to: `${month}-31` } : {};
  const list = useJournalList({ tag, ...range });
  const tags = useTags('journal');
  const searching = deferredQ.trim().length >= 2;

  return (
    <Page width="default">
      <JournalSectionHeader
        newTo="/journal/new"
        newLabel="New entry"
        quickLabel="New journal entry"
      />

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <FilterSearch value={q} onChange={(v) => set('q', v)} placeholder="Search the journal" />
          <select
            value={month}
            onChange={(e) => set('month', e.target.value || undefined)}
            aria-label="Show one month"
            className="h-10 w-[8.5rem] shrink-0 rounded border border-line bg-bg px-2 text-sm text-ink-muted hover:border-line-strong focus:border-accent/70 focus:outline-none sm:h-9 sm:w-[10rem]"
          >
            <option value="">Any month</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {formatMonthYear(`${m}-01`)}
              </option>
            ))}
          </select>
        </div>
        {!searching && (
          <TagFilter tags={tags.data} selected={tag} onSelect={(t) => set('tag', t)} />
        )}
      </div>

      {searching ? (
        <JournalSearch q={deferredQ} />
      ) : list.isLoading || tags.isLoading ? (
        // Tags too: their filter row sits above the list and would push it down on arrival.
        <JournalSkeleton />
      ) : list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorMessage(list.error)}</ErrorNote>
      ) : (
        <MonthGroups
          entries={list.data?.pages.flatMap((p) => p.items) ?? []}
          filtered={!!(tag || month)}
        />
      )}

      {!searching && list.hasNextPage && (
        <div className="mt-6">
          <Button onClick={() => void list.fetchNextPage()} busy={list.isFetchingNextPage}>
            Load older entries
          </Button>
        </div>
      )}
    </Page>
  );
}

function JournalSkeleton() {
  return (
    <Skeleton className="mt-2">
      <SkeletonText className="pb-2 pt-6 font-serif text-[1.0625rem] font-medium" width="8.5rem" />
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="grid grid-cols-[2.75rem_1fr] gap-3 py-4 sm:grid-cols-[3.25rem_1fr] sm:gap-4"
          >
            <div className="flex flex-col items-center pt-0.5">
              <SkeletonBlock className="h-6 w-7" />
              <SkeletonText className="mt-1 text-2xs" width="1.75rem" />
            </div>
            <div className="min-w-0">
              <SkeletonText className="font-serif text-[1.0625rem]" width={skeletonWidth(i)} />
              <SkeletonText className="mt-0.5 text-sm leading-6" width="100%" />
              <SkeletonText className="text-sm leading-6" width="72%" />
              <SkeletonText className="mt-1.5 text-2xs" width="4rem" />
            </div>
          </li>
        ))}
      </ul>
    </Skeleton>
  );
}

function MonthGroups({ entries, filtered }: { entries: EntrySummary[]; filtered: boolean }) {
  if (!entries.length) {
    return filtered ? (
      <Empty>No entries match these filters.</Empty>
    ) : (
      <Empty
        action={
          <Link to="/journal/new" className="text-accent underline-offset-2 hover:underline">
            Write the first entry
          </Link>
        }
      >
        Nothing here yet. An entry can be a single sentence.
      </Empty>
    );
  }

  const groups = new Map<string, EntrySummary[]>();
  for (const e of entries) {
    const key = e.date!.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <div className="mt-2">
      {[...groups].map(([month, items]) => (
        <section key={month} aria-label={formatMonthYear(`${month}-01`)}>
          <GroupHeading>{formatMonthYear(`${month}-01`)}</GroupHeading>
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {items.map((e) => (
              <li key={e.id}>
                <JournalRow e={e} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function JournalRow({ e }: { e: EntrySummary }) {
  const isToday = e.date === today();
  const encrypted = useEncryptedState();
  return (
    <Link
      to={`/journal/${e.id}`}
      className="group -mx-2 grid grid-cols-[2.75rem_1fr] gap-3 rounded px-2 py-4 transition-colors hover:bg-surface/70 active:bg-surface sm:grid-cols-[3.25rem_1fr] sm:gap-4"
    >
      <div className="pt-0.5 text-center">
        <div
          className="font-serif text-[1.5rem] leading-none text-ink"
          style={{ fontVariationSettings: "'opsz' 36" }}
        >
          {parseLocalDate(e.date!).getDate()}
        </div>
        <div
          className={
            isToday
              ? 'mt-1 text-2xs uppercase tracking-wider text-accent'
              : 'mt-1 text-2xs uppercase tracking-wider text-ink-faint'
          }
        >
          {isToday ? 'Today' : weekdayShort(e.date!)}
        </div>
      </div>
      <div className="min-w-0">
        {e.locked ? (
          <>
            <h3
              className={cn(
                'flex items-center gap-1.5 font-serif text-[1.0625rem]',
                e.title ? 'font-medium text-ink' : 'italic text-ink-muted',
              )}
              style={{ fontVariationSettings: "'opsz' 20" }}
            >
              <EncryptedMark />
              <span className="truncate">{e.title || 'Encrypted entry'}</span>
            </h3>
            <p className="mt-1.5 text-2xs text-ink-faint">{encryptedLabel(encrypted)}</p>
          </>
        ) : e.title ? (
          <>
            <h3
              className="truncate font-serif text-[1.0625rem] font-medium text-ink"
              style={{ fontVariationSettings: "'opsz' 20" }}
            >
              {e.title}
            </h3>
            {e.excerpt && (
              <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-muted">{e.excerpt}</p>
            )}
          </>
        ) : (
          <p className="line-clamp-3 text-[0.9375rem] leading-6 text-ink">
            {e.excerpt || <span className="italic text-ink-faint">Empty entry</span>}
          </p>
        )}
        {!e.locked && (
          <p className="mt-1.5 text-2xs text-ink-faint">
            {e.wordCount.toLocaleString()} {e.wordCount === 1 ? 'word' : 'words'}
            {e.tags.length > 0 && <span> · {e.tags.map((t) => `#${t}`).join(' ')}</span>}
          </p>
        )}
      </div>
    </Link>
  );
}

function JournalSearch({ q }: { q: string }) {
  const search = useSearch(q);
  const results = (search.data ?? []).filter((r: SearchResult) => r.type === 'journal');
  if (search.isLoading) return <Loading label="Searching…" />;
  if (search.isError) return <ErrorNote>{errorMessage(search.error)}</ErrorNote>;
  if (!results.length) return <Empty>No journal entries mention “{q.trim()}”.</Empty>;
  return (
    <ul className="mt-4 divide-y divide-line/70 border-t border-line/70">
      {results.map((r) => (
        <li key={r.id}>
          <Link
            to={`/journal/${r.id}`}
            className="-mx-2 block rounded px-2 py-3.5 hover:bg-surface/70 active:bg-surface"
          >
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate font-serif text-[1.0625rem] text-ink">
                {r.title || formatRelativeDay(r.date)}
              </span>
              <span className="shrink-0 text-2xs text-ink-faint">{formatRelativeDay(r.date)}</span>
            </div>
            {r.snippet && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.snippet}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
