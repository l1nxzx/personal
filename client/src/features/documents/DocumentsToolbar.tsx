import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { DocumentFolder } from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { cn } from '../../lib/cn';
import { FilterSearch } from '../entries/ListParts';
import { defaultDir, SORT_LABEL, type Sort, type SortKey } from './folderTree';
import { useDropTarget } from './DocumentItems';

export type Scope = 'files' | 'recent' | 'starred';

export function Toolbar({
  q,
  onQuery,
  onNewFolder,
  onUpload,
  sort,
  onSort,
  view,
  onView,
}: {
  q: string;
  onQuery: (q: string) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  /** Null when the order is fixed (Recent). */
  sort: Sort | null;
  onSort: (s: Sort) => void;
  view: 'list' | 'grid';
  onView: (v: 'list' | 'grid') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Menu
        align="left"
        items={[
          { label: 'New folder', icon: <FolderPlus />, onSelect: onNewFolder },
          { label: 'Upload files', icon: <Upload />, onSelect: onUpload },
        ]}
        trigger={(p) => (
          <Button {...p} variant="primary">
            <Plus className="h-4 w-4" /> New
          </Button>
        )}
      />
      {/* Phones: a full-width row of its own under New / sort / view. */}
      <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
        <FilterSearch value={q} onChange={onQuery} placeholder="Search files and folders" />
      </div>
      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        {sort && <SortMenu sort={sort} onSort={onSort} />}
        <div className="flex rounded border border-line p-0.5" role="radiogroup" aria-label="View">
          {(['list', 'grid'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              aria-label={v === 'list' ? 'List' : 'Grid'}
              title={v === 'list' ? 'List' : 'Grid'}
              onClick={() => onView(v)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-sm sm:h-7 sm:w-7',
                view === v ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:text-ink',
              )}
            >
              {v === 'list' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortMenu({ sort, onSort }: { sort: Sort; onSort: (s: Sort) => void }) {
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const items: MenuItem[] = (Object.keys(SORT_LABEL) as SortKey[]).map((key) => ({
    label: SORT_LABEL[key],
    icon: sort.key === key ? <Arrow /> : <span className="inline-block w-4" />,
    onSelect: () =>
      onSort(
        sort.key === key
          ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: defaultDir(key) },
      ),
  }));
  return (
    <Menu
      items={items}
      trigger={(p) => (
        <Button
          {...p}
          variant="ghost"
          size="sm"
          aria-label={`Sort: ${SORT_LABEL[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`}
          className="px-2"
        >
          <ArrowUpDown className="h-4 w-4" />
          <span className="hidden text-[0.8125rem] sm:inline">{SORT_LABEL[sort.key]}</span>
        </Button>
      )}
    />
  );
}

/** Replaces the toolbar while something is selected. */
export function SelectionBar({
  count,
  canStar,
  onClear,
  onMove,
  onStar,
  onDelete,
}: {
  count: number;
  canStar: boolean;
  onClear: () => void;
  onMove: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-10 items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1 sm:h-9">
      <IconButton label="Clear selection" onClick={onClear}>
        <X className="h-4 w-4" />
      </IconButton>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{count} selected</span>
      <Button variant="ghost" size="sm" onClick={onMove} className="px-2.5" aria-label="Move">
        <FolderInput className="h-4 w-4" /> <span className="hidden sm:inline">Move</span>
      </Button>
      {canStar && (
        <Button variant="ghost" size="sm" onClick={onStar} className="px-2.5" aria-label="Star">
          <Star className="h-4 w-4" /> <span className="hidden sm:inline">Star</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label="Delete"
        className="px-2.5 text-bad hover:text-bad"
      >
        <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
      </Button>
    </div>
  );
}

export function ScopeTabs({ scope, onScope }: { scope: Scope; onScope: (s: Scope) => void }) {
  const tabs: { value: Scope; label: string }[] = [
    { value: 'files', label: 'My files' },
    { value: 'recent', label: 'Recent' },
    { value: 'starred', label: 'Starred' },
  ];
  return (
    <div className="flex gap-1" role="group" aria-label="Show">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={scope === t.value}
          onClick={() => onScope(t.value)}
          className={cn(
            'h-9 shrink-0 rounded px-3 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8125rem]',
            scope === t.value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "My files › Taxes › 2025". Every level is a link and a drop target; the current folder opens
 * a menu with what can be done to it. Long paths scroll, keeping the current folder in view.
 */
export function Breadcrumbs({
  path,
  onGo,
  onDrop,
  currentMenu,
}: {
  path: DocumentFolder[];
  onGo: (id: string | null) => void;
  onDrop: (folderId: string | null, ev: React.DragEvent) => void;
  currentMenu: MenuItem[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [path]);
  const parent = path.length > 1 ? path.at(-2)!.id : null;
  const current = path.at(-1);

  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-1">
      {current && (
        <IconButton label="Up one level" onClick={() => onGo(parent)} className="-ml-2 sm:hidden">
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
      )}
      <div ref={scroller} className="scrollbar-none flex min-w-0 items-center overflow-x-auto">
        <Crumb
          label="My files"
          onClick={() => onGo(null)}
          onDrop={(ev) => onDrop(null, ev)}
          isLast={!current}
        />
        {path.slice(0, -1).map((f) => (
          <span key={f.id} className="flex shrink-0 items-center">
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <Crumb label={f.name} onClick={() => onGo(f.id)} onDrop={(ev) => onDrop(f.id, ev)} />
          </span>
        ))}
        {current && <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
      </div>
      {/* Outside the scroller, so its menu isn't clipped. */}
      {current && (
        <Menu
          align="left"
          items={currentMenu}
          trigger={(p) => (
            <button
              {...p}
              type="button"
              aria-current="page"
              className="inline-flex h-9 min-w-0 max-w-[16rem] shrink items-center gap-1 rounded px-2 font-serif text-[1.0625rem] font-medium text-ink hover:bg-surface-2 sm:h-8"
            >
              <span className="truncate">{current.name}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
            </button>
          )}
        />
      )}
    </nav>
  );
}

function Crumb({
  label,
  onClick,
  onDrop,
  isLast,
}: {
  label: string;
  onClick: () => void;
  onDrop: (ev: React.DragEvent) => void;
  isLast?: boolean;
}) {
  const drop = useDropTarget(onDrop);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isLast ? 'page' : undefined}
      {...drop.props}
      className={cn(
        'inline-flex h-9 max-w-[12rem] shrink-0 items-center rounded px-2 hover:bg-surface-2 sm:h-8',
        isLast
          ? 'font-serif text-[1.0625rem] font-medium text-ink'
          : 'text-sm text-ink-muted hover:text-ink',
        drop.over && 'bg-accent/15 ring-1 ring-accent/60',
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
