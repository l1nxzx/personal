import { Plus, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EntryKind, TagCount } from '../../../../shared/types';
import { PageHeader } from '../../components/shell/PageHeader';
import { cn } from '../../lib/cn';
import { TabLinks } from '../../components/ui/misc';

/** Shared header for the Journal & Writing section. */
export function JournalSectionHeader({
  newTo,
  newLabel,
  newState,
}: {
  newTo: string;
  newLabel: string;
  newState?: unknown;
}) {
  return (
    <PageHeader
      title="Journal & Writing"
      actions={
        <Link
          to={newTo}
          state={newState}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded bg-accent-strong px-3 text-sm font-medium text-accent-ink hover:bg-accent-strong/85 sm:h-9"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          <span>{newLabel}</span>
        </Link>
      }
    >
      <div className="mt-4">
        <TabLinks
          tabs={[
            { to: '/journal', label: 'Journal', end: true },
            { to: '/writing', label: 'Writing', end: true },
            { to: '/thinking', label: 'Thinking', end: true },
            { to: '/reviews', label: 'Reviews', end: true },
            { to: '/timeline', label: 'Timeline', end: true },
          ]}
        />
      </div>
    </PageHeader>
  );
}

export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        strokeWidth={1.75}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
        className="h-10 w-full rounded border border-line bg-transparent pl-9 pr-9 text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-accent/70 focus:outline-none focus-visible:outline-none sm:h-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-faint hover:text-ink sm:h-7 sm:w-7"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** One horizontal, scrollable row of the most used tags. */
export function TagFilter({
  tags,
  selected,
  onSelect,
}: {
  tags: TagCount[] | undefined;
  selected: string | undefined;
  onSelect: (tag: string | undefined) => void;
}) {
  if (!tags?.length) return null;
  const visible = tags.slice(0, 16);
  if (selected && !visible.some((t) => t.tag === selected))
    visible.unshift({ tag: selected, count: 0 });
  return (
    <div
      className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      role="group"
      aria-label="Filter by tag"
    >
      {visible.map((t) => {
        const on = t.tag === selected;
        return (
          <button
            key={t.tag}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? undefined : t.tag)}
            className={cn(
              'h-8 shrink-0 whitespace-nowrap rounded-sm px-2.5 text-[0.8125rem] transition-colors sm:h-7',
              on
                ? 'bg-accent/15 text-ink ring-1 ring-accent/50'
                : 'bg-surface-2/60 text-ink-muted hover:text-ink',
            )}
          >
            #{t.tag}
          </button>
        );
      })}
    </div>
  );
}

export function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-2 pt-6 font-serif text-[1.0625rem] font-medium text-ink-muted sm:mx-0 sm:px-0"
      style={{ fontVariationSettings: "'opsz' 24" }}
    >
      {children}
    </h2>
  );
}

export const entryHref = (kind: EntryKind, id: string) => `/${kind}/${id}`;
