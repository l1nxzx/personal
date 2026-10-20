import { CornerDownLeft, PenLine, Plus, Search as SearchIcon, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchResult, SearchType } from '../../../../shared/types';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { useUI } from '../../context/UIContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, formatRelativeDay } from '../../lib/dates';
import { hrefFor, TYPE_LABEL } from '../../lib/routes';
import { useHome, useSearch } from '../me/api';
import { useCreateTask } from '../tasks/api';

/** Group headings in the result list. */
const SECTION: Record<SearchType, string> = {
  journal: 'Journal',
  writing: 'Writing',
  note: 'Ideas & notes',
  task: 'Tasks',
  project: 'Projects',
  book: 'Books',
  document: 'Files',
  folder: 'Folders',
  income: 'Income',
  expense: 'Expenses',
  moneyIdea: 'Money ideas',
  moment: 'Timeline',
  capture: 'Inbox',
};

const ORDER: SearchType[] = [
  'journal',
  'writing',
  'note',
  'task',
  'project',
  'moneyIdea',
  'book',
  'folder',
  'document',
  'moment',
  'income',
  'expense',
  'capture',
];

interface Item {
  key: string;
  run: () => void;
  render: (active: boolean) => ReactNode;
}

/** Universal search: ⌘K / Ctrl K or `/`. Vault content is never part of this index. */
export function SearchDialog() {
  const { searchOpen, closeSearch } = useUI();
  return (
    <Dialog
      open={searchOpen}
      onClose={closeSearch}
      title="Search"
      hideTitle
      placement="top"
      className="sm:max-h-[70vh]"
    >
      <SearchPanel onClose={closeSearch} />
    </Dialog>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { openCapture } = useUI();
  const createTask = useCreateTask();
  const toast = useToast();
  const home = useHome();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(deferred), 180);
    return () => clearTimeout(t);
  }, [deferred]);

  const search = useSearch(debounced);
  const query = q.trim();
  const searching = query.length >= 2;
  const results = searching ? (search.data ?? []) : [];

  const go = (to: string, state?: unknown) => {
    onClose();
    navigate(to, { state });
  };

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    if (searching) {
      for (const type of ORDER) {
        for (const r of results.filter((x) => x.type === type)) {
          list.push({
            key: `${r.type}:${r.id}`,
            run: () => go(hrefFor(r.type, r.id)),
            render: (on) => <ResultRow r={r} active={on} />,
          });
        }
      }
      list.push(
        {
          key: 'action:capture',
          run: () => openCapture({ text: query }),
          render: (on) => (
            <ActionRow icon={<Plus />} active={on}>
              Capture “{query}”
            </ActionRow>
          ),
        },
        {
          key: 'action:task',
          run: () =>
            createTask.mutate(
              { title: query },
              {
                onSuccess: (task) => {
                  onClose();
                  toast({
                    message: 'Task added',
                    action: { label: 'Open', onClick: () => navigate(`/tasks?task=${task.id}`) },
                  });
                },
                onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
              },
            ),
          render: (on) => (
            <ActionRow icon={<Plus />} active={on}>
              New task “{query}”
            </ActionRow>
          ),
        },
        {
          key: 'action:write',
          run: () => go('/writing/new', { title: query }),
          render: (on) => (
            <ActionRow icon={<PenLine />} active={on}>
              Start a draft titled “{query}”
            </ActionRow>
          ),
        },
      );
    } else {
      for (const e of home.data?.recent ?? []) {
        list.push({
          key: `recent:${e.id}`,
          run: () => go(hrefFor(e.kind, e.id)),
          render: (on) => (
            <ResultRow
              r={{ type: e.kind, id: e.id, title: e.title, snippet: '', date: e.updatedAt }}
              active={on}
              recent
            />
          ),
        });
      }
      list.push(
        {
          key: 'action:new-journal',
          run: () => go('/journal/new'),
          render: (on) => (
            <ActionRow icon={<PenLine />} active={on}>
              New journal entry
            </ActionRow>
          ),
        },
        {
          key: 'action:new-writing',
          run: () => go('/writing/new'),
          render: (on) => (
            <ActionRow icon={<PenLine />} active={on}>
              New draft
            </ActionRow>
          ),
        },
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, results, query, home.data]);

  useEffect(() => setActive(0), [query, results.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      items[active]?.run();
    }
  };

  const resultCount = items.length - 3;
  let section: string | null = null;

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-line pl-4 pr-2">
        <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything…"
          aria-label="Search"
          aria-controls="search-results"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-14 min-w-0 flex-1 bg-transparent text-[1.0625rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none sm:h-12"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="flex h-10 w-10 items-center justify-center rounded text-ink-faint hover:bg-surface-2 hover:text-ink sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        id="search-results"
        ref={listRef}
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {searching && search.isError && (
          <p className="px-4 py-3 text-sm text-bad">{errorMessage(search.error)}</p>
        )}
        {searching &&
          debounced.trim() === query &&
          !search.isFetching &&
          search.isSuccess &&
          resultCount === 0 && (
            <p className="px-4 py-3 text-sm text-ink-faint">Nothing found for “{query}”.</p>
          )}
        {!searching && (home.data?.recent.length ?? 0) > 0 && <SectionLabel>Recent</SectionLabel>}
        {items.map((item, i) => {
          const label = sectionFor(item.key);
          const header = label !== section ? label : null;
          section = label;
          return (
            <div key={item.key}>
              {header && searching && <SectionLabel>{header}</SectionLabel>}
              {header === 'Actions' && !searching && <div className="my-1 border-t border-line" />}
              <div
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => item.run()}
                className="cursor-pointer"
              >
                {item.render(i === active)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-2xs text-ink-faint [@media(hover:hover)]:flex">
        <span>↑↓ to move</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" /> to open
        </span>
        <span>esc to close</span>
        {searching && search.isFetching && <span className="ml-auto">Searching…</span>}
      </div>
    </div>
  );
}

function sectionFor(key: string): string {
  const type = key.split(':')[0];
  if (type === 'recent') return 'Recent';
  if (ORDER.includes(type as SearchType)) return SECTION[type as SearchType];
  return 'Actions';
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-3 text-2xs font-medium uppercase tracking-[0.12em] text-ink-faint">
      {children}
    </div>
  );
}

function ResultRow({ r, active, recent }: { r: SearchResult; active: boolean; recent?: boolean }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? formatRelativeDay(r.date) : formatAgo(r.date);
  return (
    <div className={cn('mx-1 rounded px-3 py-2', active && 'bg-surface-2')}>
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            r.title ? 'text-ink' : 'italic text-ink-muted',
          )}
        >
          {r.title || 'Untitled'}
        </span>
        <span className="shrink-0 text-2xs text-ink-faint">
          {recent ? `${TYPE_LABEL[r.type]} · ` : ''}
          {date}
        </span>
      </div>
      {r.snippet && (
        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-5 text-ink-muted">{r.snippet}</p>
      )}
    </div>
  );
}

function ActionRow({
  icon,
  active,
  children,
}: {
  icon: ReactNode;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-1 flex items-center gap-3 rounded px-3 py-2 text-sm text-ink-muted',
        active && 'bg-surface-2 text-ink',
      )}
    >
      <span className="text-ink-faint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
