import { Archive, ArchiveRestore, Ellipsis, Lock, Pin, PinOff, Trash2 } from 'lucide-react';
import { useDeferredValue } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { EntrySummary } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { IconButton } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote, Loading, Segmented } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { formatAgo } from '../../lib/dates';
import { useSearch } from '../me/api';
import { useDeleteEntry, useSetEntryFlags, useTags, useWritingList } from './api';
import { EntryRowsSkeleton, FilterSearch, JournalSectionHeader, TagFilter } from './ListParts';

/** Drafts, essays and other writing that isn't tied to a day. Pinned first, then recently edited. */
export default function WritingPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? undefined;
  const archived = params.get('view') === 'archived';
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

  const list = useWritingList({ archived, tag });
  const tags = useTags('writing');
  const search = useSearch(deferredQ);
  const searching = deferredQ.trim().length >= 2;

  const items: EntrySummary[] | undefined = searching ? undefined : list.data;

  return (
    <Page width="default">
      <JournalSectionHeader newTo="/writing/new" newLabel="New draft" />

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSearch value={q} onChange={(v) => set('q', v)} placeholder="Search writing" />
          <Segmented
            label="Show"
            value={archived ? 'archived' : 'active'}
            onChange={(v) => set('view', v === 'archived' ? 'archived' : undefined)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>
        {!searching && (
          <TagFilter tags={tags.data} selected={tag} onSelect={(t) => set('tag', t)} />
        )}
      </div>

      <div className="mt-4">
        {searching ? (
          search.isLoading ? (
            <Loading label="Searching…" />
          ) : (
            <SearchList
              q={deferredQ}
              results={(search.data ?? []).filter((r) => r.type === 'writing')}
            />
          )
        ) : list.isLoading || tags.isLoading ? (
          <EntryRowsSkeleton pad="py-4" />
        ) : list.isError ? (
          <ErrorNote onRetry={() => void list.refetch()}>{errorMessage(list.error)}</ErrorNote>
        ) : !items?.length ? (
          archived ? (
            <Empty>Nothing archived.</Empty>
          ) : tag ? (
            <Empty>Nothing tagged #{tag}.</Empty>
          ) : (
            <Empty
              action={
                <Link to="/writing/new" className="text-accent underline-offset-2 hover:underline">
                  Start a draft
                </Link>
              }
            >
              Essays, drafts and longer pieces live here, apart from the journal.
            </Empty>
          )
        ) : (
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {items.map((e) => (
              <li key={e.id}>
                <WritingRow e={e} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

function WritingRow({ e }: { e: EntrySummary }) {
  const flags = useSetEntryFlags('writing');
  const del = useDeleteEntry('writing');
  const confirm = useConfirm();
  const toast = useToast();

  const setFlag = (patch: { pinned?: boolean; archived?: boolean }, message: string) =>
    flags.mutate(
      { id: e.id, flags: patch },
      {
        onSuccess: () => toast({ message }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );

  return (
    <div className="group flex items-start gap-2">
      <Link
        to={`/writing/${e.id}`}
        className="-mx-2 min-w-0 flex-1 rounded px-2 py-4 hover:bg-surface/70 active:bg-surface"
      >
        <div className="flex items-center gap-2">
          {e.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Pinned" />}
          {e.locked && (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-accent"
              strokeWidth={2}
              aria-label="Locked"
            />
          )}
          <h3
            className={
              e.title
                ? 'truncate font-serif text-[1.0625rem] font-medium text-ink'
                : 'truncate font-serif text-[1.0625rem] italic text-ink-muted'
            }
            style={{ fontVariationSettings: "'opsz' 20" }}
          >
            {e.title || 'Untitled'}
          </h3>
        </div>
        {e.excerpt && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-muted">{e.excerpt}</p>
        )}
        <p className="mt-1.5 text-2xs text-ink-faint">
          Edited {formatAgo(e.updatedAt)}
          {e.locked ? (
            ' · Locked'
          ) : (
            <>
              {' · '}
              {e.wordCount.toLocaleString()} {e.wordCount === 1 ? 'word' : 'words'}
              {e.tags.length > 0 && <span> · {e.tags.map((t) => `#${t}`).join(' ')}</span>}
            </>
          )}
        </p>
      </Link>
      <div className="pt-3 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
        <Menu
          trigger={(p) => (
            <IconButton label={`Actions for ${e.title || 'Untitled'}`} {...p}>
              <Ellipsis className="h-4 w-4" />
            </IconButton>
          )}
          items={[
            {
              label: e.pinned ? 'Unpin' : 'Pin to top',
              icon: e.pinned ? <PinOff /> : <Pin />,
              onSelect: () => setFlag({ pinned: !e.pinned }, e.pinned ? 'Unpinned' : 'Pinned'),
            },
            {
              label: e.archived ? 'Unarchive' : 'Archive',
              icon: e.archived ? <ArchiveRestore /> : <Archive />,
              onSelect: () =>
                setFlag(
                  { archived: !e.archived },
                  e.archived ? 'Moved back to Writing' : 'Archived',
                ),
            },
            {
              label: 'Delete…',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                const ok = await confirm({
                  title: `Delete “${e.title || 'Untitled'}”?`,
                  message: 'It will be gone for good. This cannot be undone.',
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (ok)
                  del.mutate(e.id, {
                    onSuccess: () => toast({ message: 'Deleted' }),
                    onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                  });
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

function SearchList({
  q,
  results,
}: {
  q: string;
  results: { id: string; title: string; snippet: string; date: string }[];
}) {
  if (!results.length) return <Empty>No writing mentions “{q.trim()}”.</Empty>;
  return (
    <ul className="divide-y divide-line/70 border-t border-line/70">
      {results.map((r) => (
        <li key={r.id}>
          <Link
            to={`/writing/${r.id}`}
            className="-mx-2 block rounded px-2 py-3.5 hover:bg-surface/70 active:bg-surface"
          >
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate font-serif text-[1.0625rem] text-ink">
                {r.title || 'Untitled'}
              </span>
              <span className="shrink-0 text-2xs text-ink-faint">{formatAgo(r.date)}</span>
            </div>
            {r.snippet && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.snippet}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
